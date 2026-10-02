import "dotenv/config";
import { randomBytes, randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { db } from "../src/lib/db";
import { auth } from "../src/lib/auth";
import * as api from "../src/app/api/v1/[...path]/route";
import { GET as mediaGET } from "../src/app/media/[id]/route";
import { apiOperations } from "../src/lib/openapi";

const key = `flow-${randomBytes(6).toString("hex")}`;
const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const users: string[] = [],
  orderIds: string[] = [],
  mediaKeys: string[] = [];
let owner = "",
  customer = "",
  stranger = "",
  categoryId = "",
  brandId = "";
const address = {
  name: "Workflow customer",
  phone: "+971501234567",
  emirate: "Dubai",
  city: "Dubai",
  line1: "Isolated test building",
};
async function call(
  path: string,
  method = "GET",
  body?: unknown,
  cookie = "",
  extra: Record<string, string> = {},
) {
  const request = new NextRequest(`${origin}/api/v1${path}`, {
    method,
    headers: {
      Origin: origin,
      Cookie: cookie,
      ...(body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...extra,
    },
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });
  return api[method as "GET" | "POST" | "PATCH" | "DELETE"](request, {
    params: Promise.resolve({ path: path.slice(1).split("/") }),
  });
}
async function data<T>(response: Response, status = 200): Promise<T> {
  const result = await response.json();
  expect(response.status, JSON.stringify(result)).toBe(status);
  return result.data as T;
}
async function proposal(operation: string, targetId: string, payload: unknown) {
  const p = await data<{ id: string }>(
    await call(
      "/admin/proposals",
      "POST",
      { operation, targetId, payload },
      owner,
    ),
    201,
  );
  await data(await call(`/admin/proposals/${p.id}/approve`, "POST", {}, owner));
  return p.id;
}
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    url.pathname !== "/inforteks_test" ||
    !["127.0.0.1", "localhost"].includes(url.hostname)
  )
    throw new Error("Requires isolated local test database.");
  vi.stubEnv("DEV_PAYMENT_SIMULATOR", "true");
  vi.stubEnv("STORAGE_DRIVER", "local");
  vi.stubEnv("UPLOAD_DIR", `.data/workflow-${key}`);
  const cookies: string[] = [];
  for (const label of ["owner", "customer", "stranger"]) {
    const response = await auth.api.signUpEmail({
      body: {
        name: label,
        email: `${key}-${label}@example.test`,
        password: randomBytes(24).toString("base64url"),
      },
      asResponse: true,
    });
    expect(response.status).toBe(200);
    const user = (await response.json()).user;
    users.push(user.id);
    cookies.push(
      response.headers
        .getSetCookie()
        .map((c) => c.split(";", 1)[0])
        .join("; "),
    );
  }
  [owner, customer, stranger] = cookies;
  await db.user.update({ where: { id: users[0] }, data: { role: "OWNER" } });
  categoryId = (await db.category.create({ data: { name: key, slug: key } }))
    .id;
  brandId = (await db.brand.create({ data: { name: key, slug: key } })).id;
  await db.shippingZone.create({
    data: {
      name: key,
      emirates: ["Dubai"],
      rate: 1000,
      estimate: "Local verification only",
    },
  });
});
afterAll(async () => {
  await db.returnRequest.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.refundRequest.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.payment.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.shipment.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.reservation.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.order.deleteMany({ where: { id: { in: orderIds } } });
  await db.cart.deleteMany({ where: { userId: { in: users } } });
  await db.inventoryMovement.deleteMany({ where: { actorId: { in: users } } });
  await db.media.deleteMany({ where: { key: { in: mediaKeys } } });
  if (brandId) {
    await db.sku.deleteMany({ where: { product: { brandId } } });
    await db.product.deleteMany({ where: { brandId } });
    await db.brand.delete({ where: { id: brandId } });
  }
  if (categoryId) await db.category.delete({ where: { id: categoryId } });
  await db.shippingZone.deleteMany({ where: { name: key } });
  await db.proposal.deleteMany({ where: { actorId: { in: users } } });
  await db.auditEvent.deleteMany({ where: { actorId: { in: users } } });
  await db.job.deleteMany({ where: { actorId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await rm(`.data/workflow-${key}`, { recursive: true, force: true });
  vi.unstubAllEnvs();
  await db.$disconnect();
});
describe("HTTP store and administration workflows", () => {
  it("denies every registered staff operation to anonymous visitors and customers", async () => {
    const operations = apiOperations.filter((o) =>
      o.path.startsWith("/admin/"),
    );
    expect(operations.length).toBeGreaterThan(50);
    for (const operation of operations) {
      const path = operation.path.replace(/\{[^}]+\}/g, "fixture-id");
      const method = operation.method.toUpperCase();
      const body = method === "GET" ? undefined : {};
      expect(
        (await call(path, method, body)).status,
        `${method} ${path} anonymous`,
      ).toBe(401);
      expect(
        (await call(path, method, body, customer)).status,
        `${method} ${path} customer`,
      ).toBe(403);
    }
    await db.user.update({
      where: { id: users[2] },
      data: { role: "STAFF_DISABLED" },
    });
    expect(
      (await call("/admin/me/permissions", "GET", undefined, stranger)).status,
    ).toBe(403);
    await db.user.update({
      where: { id: users[2] },
      data: { role: "CUSTOMER" },
    });
  });
  it("uploads and publishes a dummy product, reserves an order once, fulfils it and receives a customer return", async () => {
    const product = await data<{ id: string; slug: string }>(
      await call(
        "/admin/products",
        "POST",
        {
          name: "HTTP verification laptop",
          slug: key,
          categoryId,
          brandId,
          skus: [{ code: key, price: 123450, specs: { ram: 16 } }],
        },
        owner,
      ),
      201,
    );
    const sku = await db.sku.findFirstOrThrow({
      where: { productId: product.id },
    });
    expect((await call(`/storefront/products/${key}`)).status).toBe(404);
    const form = new FormData();
    const png = await sharp({
      create: { width: 120, height: 120, channels: 3, background: "#1455ff" },
    })
      .png()
      .toBuffer();
    form.set(
      "file",
      new File([new Uint8Array(png)], "fixture.png", { type: "image/png" }),
    );
    form.set("productId", product.id);
    form.set("alt", "Local test image");
    const media = await data<{ id: string; key: string }>(
      await call("/admin/media", "POST", form, owner),
      201,
    );
    mediaKeys.push(media.key);
    const image = () =>
      mediaGET(new Request(`${origin}/media/${media.id}`), {
        params: Promise.resolve({ id: media.id }),
      });
    expect((await image()).status).toBe(404);
    await proposal("inventory.adjust", sku.id, {
      delta: 5,
      reason: "Dummy initial stock",
    });
    await proposal("product.publish", product.id, {});
    expect((await image()).headers.get("content-type")).toBe("image/webp");
    const publicProduct = await data(await call(`/storefront/products/${key}`));
    expect(JSON.stringify(publicProduct)).not.toContain('"cost"');
    await data(
      await call(
        "/storefront/carts",
        "POST",
        { skuId: sku.id, quantity: 1, mode: "add" },
        customer,
      ),
    );
    await data(
      await call(
        "/storefront/carts",
        "POST",
        { skuId: sku.id, quantity: 1, mode: "add" },
        customer,
      ),
    );
    // No cart cookie: a new device restores this customer's database cart.
    const cart = await data<{ items: { quantity: number }[] }>(
      await call("/storefront/carts", "GET", undefined, customer),
    );
    expect(cart.items[0].quantity).toBe(2);
    expect(
      await data(await call("/storefront/carts", "GET", undefined, stranger)),
    ).toEqual({ items: [] });
    const quote = await data<{ totals: { total: number; subtotal: number } }>(
      await call(
        "/storefront/carts/quote",
        "POST",
        { emirate: "Dubai" },
        customer,
      ),
    );
    expect(quote.totals.subtotal).toBe(246900);
    const payload = {
      country: "AE",
      email: `${key}-customer@example.test`,
      address,
      paymentMethod: "SIMULATOR",
    };
    expect(
      (
        await call(
          "/storefront/checkout",
          "POST",
          { ...payload, country: "QA" },
          customer,
          { "Idempotency-Key": randomUUID() },
        )
      ).status,
    ).toBe(422);
    const headers = { "Idempotency-Key": randomUUID() };
    const order = await data<{ id: string; total: number }>(
      await call("/storefront/checkout", "POST", payload, customer, headers),
      201,
    );
    orderIds.push(order.id);
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: order.id } })).total,
    ).toBe(quote.totals.total);
    const replay = await data<{ id: string }>(
      await call("/storefront/checkout", "POST", payload, customer, headers),
      201,
    );
    expect(replay.id).toBe(order.id);
    expect(
      (await db.sku.findUniqueOrThrow({ where: { id: sku.id } })).reserved,
    ).toBe(2);
    expect(
      (await call(`/account/orders/${order.id}`, "GET", undefined, stranger))
        .status,
    ).toBe(404);
    await data(
      await call(`/account/orders/${order.id}`, "GET", undefined, customer),
    );
    const staffOrder = await data<{
      items: { id: string; quantity: number }[];
    }>(await call(`/admin/orders/${order.id}`, "GET", undefined, owner));
    const fulfilment = await proposal("order.fulfil", order.id, {
      carrier: "Local test carrier",
      items: staffOrder.items.map((i) => ({
        itemId: i.id,
        quantity: i.quantity,
      })),
    });
    expect(
      (await call(`/admin/proposals/${fulfilment}/approve`, "POST", {}, owner))
        .status,
    ).toBe(409);
    expect(
      await db.sku.findUniqueOrThrow({ where: { id: sku.id } }),
    ).toMatchObject({ onHand: 3, reserved: 0 });
    const returned = await data<{ id: string }>(
      await call(
        "/account/returns",
        "POST",
        {
          orderId: order.id,
          itemId: staffOrder.items[0].id,
          quantity: 1,
          reason: "Local return verification",
        },
        customer,
      ),
      201,
    );
    await data(
      await call(
        `/admin/returns/${returned.id}`,
        "PATCH",
        { status: "APPROVED" },
        owner,
      ),
    );
    await proposal("return.receive", returned.id, { disposition: "RESTOCK" });
    expect(
      (await db.sku.findUniqueOrThrow({ where: { id: sku.id } })).onHand,
    ).toBe(4);
    expect(
      (
        await db.orderItem.findUniqueOrThrow({
          where: { id: staffOrder.items[0].id },
        })
      ).returned,
    ).toBe(1);
    await data(
      await call(
        "/storefront/carts",
        "POST",
        { skuId: sku.id, quantity: 1 },
        customer,
      ),
    );
    await proposal("product.archive", product.id, {});
    await data(
      await call(
        "/storefront/carts",
        "PATCH",
        { skuId: sku.id, quantity: 0 },
        customer,
      ),
    );
    expect((await call(`/storefront/products/${key}`)).status).toBe(404);
    expect((await image()).status).toBe(404);
  });
});
