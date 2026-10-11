import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { db } from "../src/lib/db";
import { requestReturn } from "../src/domains/commerce";

const fixture = `return-recovery-${randomUUID()}`;
const userId = `${fixture}-customer`;
const strangerId = `${fixture}-stranger`;
const orderIds: string[] = [];
let skuId = "",
  productId = "",
  categoryId = "",
  brandId = "";
let localFixtures = false;

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    url.pathname !== "/inforteks_test" ||
    !["127.0.0.1", "localhost"].includes(url.hostname)
  )
    throw new Error(
      "Return recovery integration tests require the isolated local test database.",
    );
  localFixtures = true;
  await db.user.createMany({
    data: [userId, strangerId].map((id) => ({
      id,
      email: `${id}@example.test`,
      name: "Local return recovery",
    })),
  });
  categoryId = (
    await db.category.create({ data: { name: fixture, slug: fixture } })
  ).id;
  brandId = (await db.brand.create({ data: { name: fixture, slug: fixture } }))
    .id;
  const product = await db.product.create({
    data: {
      name: "Local return recovery item",
      slug: fixture,
      categoryId,
      brandId,
      demo: true,
      skus: { create: { code: fixture, price: 10000 } },
    },
    include: { skus: true },
  });
  productId = product.id;
  skuId = product.skus[0].id;
});
afterAll(async () => {
  if (!localFixtures) return;
  await db.returnRequest.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.order.deleteMany({ where: { id: { in: orderIds } } });
  await db.idempotency.deleteMany({
    where: { actorId: { in: [userId, strangerId] } },
  });
  await db.user.deleteMany({ where: { id: { in: [userId, strangerId] } } });
  if (productId) {
    await db.sku.deleteMany({ where: { productId } });
    await db.product.deleteMany({ where: { id: productId } });
  }
  if (categoryId) await db.category.deleteMany({ where: { id: categoryId } });
  if (brandId) await db.brand.deleteMany({ where: { id: brandId } });
  await db.$disconnect();
});
async function order(quantity = 2) {
  const result = await db.order.create({
    data: {
      reference: `${fixture}-${randomUUID()}`,
      userId,
      guestTokenHash: randomUUID(),
      email: `${userId}@example.test`,
      address: {},
      status: "FULFILLED",
      fulfillmentStatus: "FULFILLED",
      paymentMethod: "bank_transfer",
      subtotal: quantity * 10000,
      discount: 0,
      tax: 0,
      shipping: 0,
      total: quantity * 10000,
      shippingSnapshot: {},
      termsSnapshot: {},
      demo: true,
      items: {
        create: {
          skuId,
          snapshot: { name: "Return recovery item" },
          quantity,
          fulfilled: quantity,
          unitPrice: 10000,
          total: quantity * 10000,
        },
      },
    },
    include: { items: true },
  });
  orderIds.push(result.id);
  return {
    orderId: result.id,
    itemId: result.items[0].id,
    quantity: 1,
    reason: "Local item arrived damaged.",
  };
}

it("serializes concurrent retries and replays the original return after its state changes", async () => {
  const payload = await order();
  const key = randomUUID();
  const [first, retry] = await Promise.all([
    requestReturn(userId, payload, key),
    requestReturn(userId, payload, key),
  ]);
  expect(retry.id).toBe(first.id);
  expect(
    await db.returnRequest.count({ where: { orderId: payload.orderId } }),
  ).toBe(1);
  expect(
    await db.idempotency.count({
      where: { actorId: userId, operation: "return.request", key },
    }),
  ).toBe(1);
  await db.returnRequest.update({
    where: { id: first.id },
    data: { status: "RECEIVED" },
  });
  await db.orderItem.update({
    where: { id: payload.itemId },
    data: { returned: 2 },
  });
  expect((await requestReturn(userId, payload, key)).id).toBe(first.id);
  expect(
    await db.returnRequest.count({ where: { orderId: payload.orderId } }),
  ).toBe(1);
});

it("binds a key to its exact payload and current customer ownership while allowing a separate intent", async () => {
  const payload = await order();
  const key = randomUUID();
  const first = await requestReturn(userId, payload, key);
  await expect(
    requestReturn(
      userId,
      { ...payload, reason: "A different return request reason." },
      key,
    ),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    requestReturn(userId, { ...payload, quantity: 2 }, key),
  ).rejects.toMatchObject({ status: 409 });
  await expect(requestReturn(strangerId, payload, key)).rejects.toMatchObject({
    status: 404,
  });
  const second = await requestReturn(userId, payload, randomUUID());
  expect(second.id).not.toBe(first.id);
  expect(
    await db.returnRequest.count({ where: { orderId: payload.orderId } }),
  ).toBe(2);
  await db.order.update({
    where: { id: payload.orderId },
    data: { userId: strangerId },
  });
  await expect(requestReturn(userId, payload, key)).rejects.toMatchObject({
    status: 404,
  });
});

it("preserves unkeyed clients and rejects invalid keys or quantities without storing a result", async () => {
  const payload = await order();
  for (const key of ["", "short", "x".repeat(129)])
    await expect(requestReturn(userId, payload, key)).rejects.toMatchObject({
      status: 400,
    });
  const retryKey = randomUUID();
  await expect(
    requestReturn(userId, { ...payload, quantity: 3 }, retryKey),
  ).rejects.toMatchObject({ status: 422 });
  expect(
    await db.idempotency.count({ where: { actorId: userId, key: retryKey } }),
  ).toBe(0);
  const first = await requestReturn(userId, payload);
  const second = await requestReturn(userId, payload);
  expect(second.id).not.toBe(first.id);
  await expect(requestReturn(userId, payload)).rejects.toMatchObject({
    status: 422,
  });
  expect(
    await db.returnRequest.count({ where: { orderId: payload.orderId } }),
  ).toBe(2);
});

it("retains the pending quantity guard for competing distinct intents", async () => {
  const payload = { ...(await order(3)), quantity: 2 };
  const results = await Promise.allSettled([
    requestReturn(userId, payload, randomUUID()),
    requestReturn(userId, payload, randomUUID()),
  ]);
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  expect(results.find((result) => result.status === "rejected")).toMatchObject({
    reason: { status: 422 },
  });
  expect(
    await db.returnRequest.count({ where: { orderId: payload.orderId } }),
  ).toBe(1);
  expect(
    await db.orderItem.findUnique({
      where: { id: payload.itemId },
      select: { returned: true },
    }),
  ).toEqual({ returned: 0 });
});
