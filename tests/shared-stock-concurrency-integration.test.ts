import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { db } from "../src/lib/db";
import { actorForUser, type Actor } from "../src/domains/identity";
import { approve, propose } from "../src/domains/approvals";
import { checkout, ensureCart, setCartItem } from "../src/domains/commerce";
import {
  createDirectOrder,
  quoteDirectOrder,
  saveBusinessCustomer,
} from "../src/domains/direct-sales";

const prefix = `stock-race-${randomUUID()}`;
const cartIds: string[] = [];
const skuIds: string[] = [];
const couponIds: string[] = [];
let isolatedDatabaseVerified = false;
let owner: Actor, sales: Actor, categoryId: string, brandId: string;
const address = {
  name: "Shared stock test contact",
  phone: "+971501234567",
  emirate: "Dubai",
  city: "Dubai",
  area: "Test district",
  line1: "Isolated test office",
};
const checkoutBody = {
  email: `${prefix}@example.test`,
  address,
  paymentMethod: "SIMULATOR",
};

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    url.pathname !== "/inforteks_test" ||
    !["localhost", "127.0.0.1"].includes(url.hostname)
  )
    throw new Error("Shared-stock tests require loopback inforteks_test.");
  isolatedDatabaseVerified = true;
  vi.stubEnv("DEV_PAYMENT_SIMULATOR", "true");
  vi.stubEnv("OFFLINE_PAYMENTS_ENABLED", "false");
  for (const role of ["OWNER", "SALES"])
    await db.user.create({
      data: {
        id: `${prefix}-${role}`,
        name: `${prefix}-${role}`,
        email: `${prefix}-${role}@example.test`,
        role,
      },
    });
  owner = await actorForUser(`${prefix}-OWNER`);
  sales = await actorForUser(`${prefix}-SALES`);
  categoryId = (
    await db.category.create({ data: { name: prefix, slug: prefix } })
  ).id;
  brandId = (await db.brand.create({ data: { name: prefix, slug: prefix } }))
    .id;
  await db.shippingZone.create({
    data: {
      name: prefix,
      emirates: ["Dubai"],
      rate: 0,
      estimate: "Isolated test only",
    },
  });
});

afterAll(async () => {
  if (!isolatedDatabaseVerified) return;
  const orders = await db.order.findMany({
    where: { items: { some: { skuId: { in: skuIds } } } },
    select: { id: true },
  });
  const orderId = { in: orders.map((order) => order.id) };
  const actorId = { in: [`${prefix}-OWNER`, `${prefix}-SALES`, ...cartIds] };
  await db.job.deleteMany({
    where: {
      dedupeKey: {
        in: orders.map((order) => `order-notification:${order.id}`),
      },
    },
  });
  await db.shipment.deleteMany({ where: { orderId } });
  await db.reservation.deleteMany({ where: { orderId } });
  await db.orderItem.deleteMany({ where: { orderId } });
  await db.order.deleteMany({ where: { id: orderId } });
  await db.businessCustomer.deleteMany({
    where: { createdBy: `${prefix}-SALES` },
  });
  await db.cart.deleteMany({
    where: {
      OR: [
        { id: { in: cartIds } },
        { items: { some: { skuId: { in: skuIds } } } },
      ],
    },
  });
  await db.inventoryMovement.deleteMany({ where: { skuId: { in: skuIds } } });
  await db.sku.deleteMany({ where: { id: { in: skuIds } } });
  if (brandId) {
    await db.product.deleteMany({ where: { brandId } });
    await db.brand.delete({ where: { id: brandId } });
  }
  if (categoryId) await db.category.delete({ where: { id: categoryId } });
  await db.shippingZone.deleteMany({ where: { name: prefix } });
  await db.coupon.deleteMany({ where: { id: { in: couponIds } } });
  await db.proposal.deleteMany({ where: { actorId } });
  await db.auditEvent.deleteMany({
    where: { OR: [{ actorId }, { targetId: orderId }] },
  });
  await db.idempotency.deleteMany({ where: { actorId } });
  await db.user.deleteMany({ where: { id: actorId } });
  vi.unstubAllEnvs();
  await db.$disconnect();
});

async function stock(onHand: number, count = 2) {
  const key = `${prefix}-${randomUUID()}`;
  const product = await db.product.create({
    data: {
      name: key,
      slug: key,
      brandId,
      categoryId,
      status: "PUBLISHED",
      skus: {
        create: Array.from({ length: count }, (_, i) => ({
          code: `${key}-${i}`,
          price: 10000 + i * 100,
          onHand,
        })),
      },
    },
    include: { skus: { orderBy: { id: "asc" } } },
  });
  skuIds.push(...product.skus.map((sku) => sku.id));
  return product.skus;
}

async function onlineCart(ids: string[], quantity = 1) {
  const { cart } = await ensureCart();
  cartIds.push(cart.id);
  for (const skuId of ids) await setCartItem(cart.id, { skuId, quantity });
  return cart;
}

async function directPayload(ids: string[], quantity = 1, coupon = "") {
  const customer = await saveBusinessCustomer(sales, {
    company: `${prefix}-${randomUUID()}`,
    address,
  });
  const input = {
    customerId: customer.id,
    customerVersion: customer.version,
    lines: ids.map((skuId) => ({ skuId, quantity })),
    coupon,
    note: "Shared-stock regression",
  };
  const quote = await quoteDirectOrder(sales, input);
  return {
    ...input,
    reviewedQuote: quote.reviewedQuote,
    confirmed: true as const,
  };
}

// A real PostgreSQL row lock forces overlapping transactions. Start each
// contender only after the previous one is observed waiting in the lock graph;
// this also catches waiters on its cart/idempotency/approval advisory locks.
async function contend(
  table: "Sku" | "Order" | "Coupon",
  id: string,
  operations: (() => Promise<unknown>)[],
) {
  const gate = new Client({
    connectionString: process.env.DATABASE_URL,
    application_name: "inforteks-shared-stock-test-gate",
  });
  const pending: Promise<PromiseSettledResult<unknown>>[] = [];
  await gate.connect();
  try {
    await gate.query("BEGIN");
    const { rows } = await gate.query<{ pid: number }>(
      "SELECT pg_backend_pid() AS pid",
    );
    await gate.query(`SELECT id FROM "${table}" WHERE id=$1 FOR UPDATE`, [id]);
    for (const operation of operations) {
      pending.push(
        operation().then(
          (value) => ({ status: "fulfilled" as const, value }),
          (reason: unknown) => ({ status: "rejected" as const, reason }),
        ),
      );
      await vi.waitFor(
        async () => {
          await gate.query("SELECT pg_stat_clear_snapshot()");
          const waiting = await gate.query<{ count: number }>(
            `WITH RECURSIVE waiting(pid) AS (
             SELECT pid FROM pg_stat_activity WHERE $1::int = ANY(pg_blocking_pids(pid))
             UNION
             SELECT a.pid FROM pg_stat_activity a JOIN waiting w ON w.pid = ANY(pg_blocking_pids(a.pid))
           ) SELECT count(*)::int AS count FROM waiting`,
            [rows[0].pid],
          );
          expect(waiting.rows[0].count).toBeGreaterThanOrEqual(pending.length);
        },
        { timeout: 5000, interval: 20 },
      );
    }
  } finally {
    await gate.query("ROLLBACK");
    await gate.end();
    await Promise.all(pending);
  }
  return Promise.all(pending);
}

it("fulfils online and direct orders sharing multiple SKUs without a lock-order deadlock", async () => {
  const skus = await stock(2);
  const ids = skus.map((sku) => sku.id);
  const cart = await onlineCart(ids);
  const online = await checkout(cart.id, undefined, checkoutBody, randomUUID());
  const direct = await createDirectOrder(
    sales,
    await directPayload([...ids].reverse()),
    randomUUID(),
  );
  const proposals = [];
  for (const [order, descending] of [
    [online, true],
    [direct, false],
  ] as const) {
    const items = await db.orderItem.findMany({
      where: { orderId: order.id },
      orderBy: { skuId: descending ? "desc" : "asc" },
    });
    proposals.push(
      await propose(owner, "order.fulfil", order.id, {
        carrier: "Isolated test shipment",
        items: items.map((item) => ({ itemId: item.id, quantity: 1 })),
      }),
    );
  }
  // Holding the higher SKU lets the first request queue before the second.
  // Caller-ordered updates deadlock here: higher->lower and lower->higher.
  const results = await contend(
    "Sku",
    ids[1],
    proposals.map((proposal) => () => approve(owner, proposal.id)),
  );
  expect(results.filter((result) => result.status === "rejected")).toEqual([]);
  expect(
    await db.sku.findMany({
      where: { id: { in: ids } },
      select: { onHand: true, reserved: true },
    }),
  ).toEqual([
    { onHand: 0, reserved: 0 },
    { onHand: 0, reserved: 0 },
  ]);
  for (const [index, order] of [online, direct].entries()) {
    expect(
      await db.order.findUniqueOrThrow({ where: { id: order.id } }),
    ).toMatchObject({
      status: "COMPLETED",
      fulfillmentStatus: "FULFILLED",
      expiresAt: null,
    });
    expect(
      await db.reservation.findMany({
        where: { orderId: order.id },
        select: { quantity: true, consumed: true, released: true },
      }),
    ).toEqual([
      { quantity: 1, consumed: 1, released: 0 },
      { quantity: 1, consumed: 1, released: 0 },
    ]);
    expect(await db.shipment.count({ where: { orderId: order.id } })).toBe(1);
    expect(
      (await db.shipment.findFirstOrThrow({ where: { orderId: order.id } }))
        .items,
    ).toEqual((proposals[index].payload as { items: unknown }).items);
  }
  expect(
    await db.inventoryMovement.count({
      where: { skuId: { in: ids }, reason: "Shipment" },
    }),
  ).toBe(4);
});

it("rolls back a losing cross-channel multi-SKU order and permits the same request after cancellation frees stock", async () => {
  const skus = await stock(1);
  const ids = skus.map((sku) => sku.id);
  const cart = await onlineCart(ids);
  const payload = await directPayload([...ids].reverse());
  const onlineKey = randomUUID(),
    directKey = randomUUID();
  const results = await contend("Sku", ids[0], [
    () => checkout(cart.id, undefined, checkoutBody, onlineKey),
    () => createDirectOrder(sales, payload, directKey),
  ]);
  expect(results[0].status).toBe("fulfilled");
  expect(results[1]).toMatchObject({
    status: "rejected",
    reason: { status: 409 },
  });
  const orders = await db.order.findMany({
    where: { items: { some: { skuId: { in: ids } } } },
  });
  expect(orders).toHaveLength(1);
  expect(orders[0].channel).toBe("ONLINE");
  expect(
    await db.sku.findMany({
      where: { id: { in: ids } },
      select: { onHand: true, reserved: true },
    }),
  ).toEqual([
    { onHand: 1, reserved: 1 },
    { onHand: 1, reserved: 1 },
  ]);
  expect(await db.reservation.count({ where: { skuId: { in: ids } } })).toBe(2);
  expect(await db.cartItem.count({ where: { skuId: { in: ids } } })).toBe(0);
  expect(
    await db.idempotency.count({
      where: { actorId: sales.id, key: directKey },
    }),
  ).toBe(0);
  expect(
    await db.job.count({
      where: { dedupeKey: `order-notification:${orders[0].id}` },
    }),
  ).toBe(1);
  const cancel = await propose(owner, "order.cancel", orders[0].id, {
    reason: "Release test reservation",
  });
  await approve(owner, cancel.id);
  const direct = await createDirectOrder(sales, payload, directKey);
  expect(
    await db.order.findUniqueOrThrow({ where: { id: direct.id } }),
  ).toMatchObject({
    channel: "DIRECT",
    businessCustomerId: payload.customerId,
    paymentStatus: "PENDING",
  });
  expect(
    await db.idempotency.count({
      where: { actorId: sales.id, key: directKey },
    }),
  ).toBe(1);
  expect(
    await db.job.count({
      where: { dedupeKey: `order-notification:${direct.id}` },
    }),
  ).toBe(0);
  expect(
    await db.sku.findMany({
      where: { id: { in: ids } },
      select: { onHand: true, reserved: true },
    }),
  ).toEqual([
    { onHand: 1, reserved: 1 },
    { onHand: 1, reserved: 1 },
  ]);
  expect(
    await db.reservation.findMany({
      where: { orderId: orders[0].id },
      select: { consumed: true, released: true },
    }),
  ).toEqual([
    { consumed: 0, released: 1 },
    { consumed: 0, released: 1 },
  ]);
});

it("returns one order and guest token to concurrent retries without repeating stock, audit or notification writes", async () => {
  const [sku] = await stock(3, 1);
  const cart = await onlineCart([sku.id], 2);
  const key = randomUUID();
  const request = () => checkout(cart.id, undefined, checkoutBody, key);
  const results = await contend("Sku", sku.id, [request, request, request]);
  expect(results.filter((result) => result.status === "rejected")).toEqual([]);
  expect(results[1]).toEqual(results[0]);
  expect(results[2]).toEqual(results[0]);
  const orders = await db.order.findMany({
    where: { items: { some: { skuId: sku.id } } },
  });
  expect(orders).toHaveLength(1);
  const order = orders[0];
  expect(
    await db.sku.findUniqueOrThrow({ where: { id: sku.id } }),
  ).toMatchObject({ onHand: 3, reserved: 2 });
  expect(
    await db.reservation.findMany({
      where: { skuId: sku.id },
      select: { quantity: true, consumed: true, released: true },
    }),
  ).toEqual([{ quantity: 2, consumed: 0, released: 0 }]);
  expect(await db.idempotency.count({ where: { actorId: cart.id, key } })).toBe(
    1,
  );
  expect(
    await db.auditEvent.count({
      where: { targetId: order.id, operation: "order.create" },
    }),
  ).toBe(1);
  expect(
    await db.job.count({
      where: { dedupeKey: `order-notification:${order.id}` },
    }),
  ).toBe(1);
  expect(await db.cartItem.count({ where: { cartId: cart.id } })).toBe(0);
  await expect(
    checkout(
      cart.id,
      undefined,
      { ...checkoutBody, email: "changed@example.test" },
      key,
    ),
  ).rejects.toMatchObject({ status: 409 });
});

it("serializes different request keys for the same cart and leaves no failed idempotency result", async () => {
  const [sku] = await stock(2, 1);
  const cart = await onlineCart([sku.id]);
  const keys = [randomUUID(), randomUUID()];
  const results = await contend(
    "Sku",
    sku.id,
    keys.map((key) => () => checkout(cart.id, undefined, checkoutBody, key)),
  );
  expect(results[0].status).toBe("fulfilled");
  expect(results[1]).toMatchObject({
    status: "rejected",
    reason: { status: 422 },
  });
  expect(
    await db.order.count({ where: { items: { some: { skuId: sku.id } } } }),
  ).toBe(1);
  expect(
    await db.sku.findUniqueOrThrow({ where: { id: sku.id } }),
  ).toMatchObject({ onHand: 2, reserved: 1 });
  expect(
    await db.idempotency.findMany({
      where: { actorId: cart.id },
      select: { key: true },
    }),
  ).toEqual([{ key: keys[0] }]);
  // A failure is retryable: restoring this cart lets its previously failed key
  // perform a new transaction instead of replaying a partial/empty result.
  await setCartItem(cart.id, { skuId: sku.id, quantity: 1 });
  await checkout(cart.id, undefined, checkoutBody, keys[1]);
  expect(
    await db.order.count({ where: { items: { some: { skuId: sku.id } } } }),
  ).toBe(2);
  expect(
    await db.sku.findUniqueOrThrow({ where: { id: sku.id } }),
  ).toMatchObject({ onHand: 2, reserved: 2 });
});

it("rolls back stock and temporary carts when another channel consumes the final coupon use", async () => {
  const [onlineSku, directSku] = await stock(1);
  const coupon = await db.coupon.create({
    data: {
      code: `RACE-${randomUUID().slice(0, 8)}`.toUpperCase(),
      percent: 10,
      minimum: 0,
      startsAt: new Date(Date.now() - 60000),
      endsAt: new Date(Date.now() + 3600000),
      maxUses: 1,
    },
  });
  couponIds.push(coupon.id);
  const cart = await onlineCart([onlineSku.id]);
  const payload = await directPayload([directSku.id], 1, coupon.code);
  const directKey = randomUUID();
  // Each order uses a different SKU, so both reserve successfully inside their
  // transactions before the coupon's conditional update becomes contested.
  const results = await contend("Coupon", coupon.id, [
    () =>
      checkout(
        cart.id,
        undefined,
        { ...checkoutBody, coupon: coupon.code },
        randomUUID(),
      ),
    () => createDirectOrder(sales, payload, directKey),
  ]);
  expect(results[0].status).toBe("fulfilled");
  expect(results[1]).toMatchObject({
    status: "rejected",
    reason: { status: 409 },
  });
  expect(
    await db.coupon.findUniqueOrThrow({ where: { id: coupon.id } }),
  ).toMatchObject({ uses: 1 });
  expect(
    await db.sku.findUniqueOrThrow({ where: { id: directSku.id } }),
  ).toMatchObject({ onHand: 1, reserved: 0 });
  expect(
    await db.order.count({ where: { businessCustomerId: payload.customerId } }),
  ).toBe(0);
  expect(await db.reservation.count({ where: { skuId: directSku.id } })).toBe(
    0,
  );
  expect(await db.cartItem.count({ where: { skuId: directSku.id } })).toBe(0);
  expect(
    await db.idempotency.count({
      where: { actorId: sales.id, key: directKey },
    }),
  ).toBe(0);
  await db.coupon.update({ where: { id: coupon.id }, data: { maxUses: 2 } });
  await createDirectOrder(sales, payload, directKey);
  expect(
    await db.coupon.findUniqueOrThrow({ where: { id: coupon.id } }),
  ).toMatchObject({ uses: 2 });
  expect(
    await db.sku.findUniqueOrThrow({ where: { id: directSku.id } }),
  ).toMatchObject({ onHand: 1, reserved: 1 });
});

it.each([
  ["ONLINE", "order.cancel"],
  ["ONLINE", "order.fulfil"],
  ["DIRECT", "order.cancel"],
  ["DIRECT", "order.fulfil"],
] as const)(
  "serializes %s cancellation and fulfilment with %s first",
  async (channel, first) => {
    const [sku] = await stock(2, 1);
    const order =
      channel === "DIRECT"
        ? await createDirectOrder(
            sales,
            await directPayload([sku.id], 2),
            randomUUID(),
          )
        : await checkout(
            (await onlineCart([sku.id], 2)).id,
            undefined,
            checkoutBody,
            randomUUID(),
          );
    const item = await db.orderItem.findFirstOrThrow({
      where: { orderId: order.id },
    });
    const cancellation = await propose(owner, "order.cancel", order.id, {
      reason: "Concurrent test cancellation",
    });
    const shipment = await propose(owner, "order.fulfil", order.id, {
      carrier: "Isolated test delivery",
      items: [{ itemId: item.id, quantity: 2 }],
    });
    const proposals =
      first === "order.cancel"
        ? [cancellation, shipment]
        : [shipment, cancellation];
    const results = await contend(
      "Order",
      order.id,
      proposals.map((proposal) => () => approve(owner, proposal.id)),
    );
    expect(results[0].status).toBe("fulfilled");
    expect(results[1]).toMatchObject({
      status: "rejected",
      reason: { status: 409 },
    });
    const cancelled = first === "order.cancel";
    expect(
      await db.order.findUniqueOrThrow({ where: { id: order.id } }),
    ).toMatchObject({
      status: cancelled ? "CANCELLED" : "COMPLETED",
      version: 2,
      expiresAt: null,
    });
    expect(
      await db.sku.findUniqueOrThrow({ where: { id: sku.id } }),
    ).toMatchObject({ onHand: cancelled ? 2 : 0, reserved: 0 });
    expect(
      await db.reservation.findUniqueOrThrow({
        where: { orderId_skuId: { orderId: order.id, skuId: sku.id } },
      }),
    ).toMatchObject({
      quantity: 2,
      consumed: cancelled ? 0 : 2,
      released: cancelled ? 2 : 0,
    });
    expect(
      await db.orderItem.findUniqueOrThrow({ where: { id: item.id } }),
    ).toMatchObject({ fulfilled: cancelled ? 0 : 2 });
    expect(await db.shipment.count({ where: { orderId: order.id } })).toBe(
      cancelled ? 0 : 1,
    );
    expect(await db.inventoryMovement.count({ where: { skuId: sku.id } })).toBe(
      cancelled ? 0 : 1,
    );
    expect(
      await db.proposal.findUniqueOrThrow({ where: { id: proposals[1].id } }),
    ).toMatchObject({ status: "PENDING" });
    for (const proposal of proposals)
      await expect(approve(owner, proposal.id)).rejects.toMatchObject({
        status: 409,
      });
  },
);
