import "dotenv/config";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import sharp from "sharp";
import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { db } from "../src/lib/db";
import { auth } from "../src/lib/auth";
import { actorForUser, roles, type Actor } from "../src/domains/identity";
import { createProduct, catalogue, getProduct } from "../src/domains/catalogue";
import { compareProducts } from "../src/domains/comparison";
import { storeImage, readImage } from "../src/domains/storage";
import { propose, approve } from "../src/domains/approvals";
import {
  ensureCart,
  setCartItem,
  checkout,
  quote,
} from "../src/domains/commerce";
import {
  saveBusinessCustomer,
  salesProducts,
  quoteDirectOrder,
  createDirectOrder,
} from "../src/domains/direct-sales";
import { adminList } from "../src/domains/administration";
import { GET, POST } from "../src/app/api/v1/[...path]/route";
import sitemap from "../src/app/sitemap";
const key = `store-${randomUUID()}`;
const address = {
  name: "Office buyer",
  phone: "+971501234567",
  emirate: "Dubai",
  city: "Dubai",
  area: "Business Bay",
  line1: "Test office",
};
let actor: Actor,
  cookie = "",
  productId = "",
  brandId = "",
  categoryId = "",
  officeId = "",
  cartId = "",
  orderId = "",
  imageId = "",
  imageKey = "";
let skuIds: string[] = [];
const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
async function request(path: string, body?: unknown) {
  return (body === undefined ? GET : POST)(
    new NextRequest(`${origin}/api/v1${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Origin: origin,
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    {
      params: Promise.resolve({ path: path.split("?")[0].slice(1).split("/") }),
    },
  );
}
async function change(store: boolean) {
  const proposal = await propose(actor, "product.store", productId, { store });
  await approve(actor, proposal.id);
  return proposal;
}
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    url.pathname !== "/inforteks_test" ||
    !["127.0.0.1", "localhost"].includes(url.hostname)
  )
    throw new Error("Isolated database only.");
  vi.stubEnv("DEV_PAYMENT_SIMULATOR", "true");
  const signed = await auth.api.signUpEmail({
    body: { name: key, email: `${key}@example.test`, password: randomUUID() },
    asResponse: true,
  });
  const id = (await signed.json()).user.id;
  cookie = signed.headers
    .getSetCookie()
    .map((c) => c.split(";", 1)[0])
    .join("; ");
  await db.user.update({ where: { id }, data: { role: "OWNER" } });
  actor = await actorForUser(id);
  categoryId = (await db.category.create({ data: { name: key, slug: key } }))
    .id;
  brandId = (await db.brand.create({ data: { name: key, slug: key } })).id;
  productId = (
    await createProduct(actor, {
      name: key,
      slug: key,
      brandId,
      categoryId,
      store: false,
      featured: true,
      skus: [1, 2].map((i) => ({
        code: `${key}-${i}`,
        price: 10000,
        compareAt: 12000,
      })),
    })
  ).id;
  const skus = await db.sku.findMany({
    where: { productId },
    orderBy: { code: "asc" },
  });
  skuIds = skus.map((s) => s.id);
  await db.sku.updateMany({ where: { productId }, data: { onHand: 10 } });
  const bytes = await sharp({
    create: { width: 120, height: 120, channels: 3, background: "blue" },
  })
    .png()
    .toBuffer();
  const media = await storeImage(
    actor,
    new File([new Uint8Array(bytes)], "product.png", { type: "image/png" }),
    productId,
    "Private office product",
  );
  imageId = media.id;
  imageKey = media.key;
  const publish = await propose(actor, "product.publish", productId, {});
  await approve(actor, publish.id);
  officeId = (await saveBusinessCustomer(actor, { company: key, address })).id;
  await db.shippingZone.create({
    data: { name: key, emirates: ["Dubai"], rate: 0, estimate: "Test" },
  });
});
afterAll(async () => {
  await db.wishlistItem.deleteMany({ where: { skuId: { in: skuIds } } });
  await db.cart.deleteMany({ where: { userId: actor.id } });
  await db.reservation.deleteMany({ where: { orderId } });
  await db.orderItem.deleteMany({ where: { orderId } });
  await db.order.deleteMany({ where: { id: orderId } });
  await db.businessCustomer.deleteMany({ where: { id: officeId } });
  await db.media.deleteMany({ where: { productId } });
  await db.sku.deleteMany({ where: { productId } });
  await db.product.deleteMany({ where: { id: productId } });
  await db.brand.deleteMany({ where: { id: brandId } });
  await db.category.deleteMany({ where: { id: categoryId } });
  await db.shippingZone.deleteMany({ where: { name: key } });
  await db.proposal.deleteMany({ where: { actorId: actor.id } });
  await db.auditEvent.deleteMany({ where: { actorId: actor.id } });
  await db.idempotency.deleteMany({ where: { actorId: actor.id } });
  await db.user.deleteMany({ where: { id: actor.id } });
  if (imageKey)
    await rm(`${process.env.UPLOAD_DIR ?? ".data/uploads"}/${imageKey}`, {
      force: true,
    });
  vi.unstubAllEnvs();
  await db.$disconnect();
});
it("activates an offline-only product without exposing either SKU, images, search facets or sitemap", async () => {
  expect(
    await db.product.findUniqueOrThrow({ where: { id: productId } }),
  ).toMatchObject({ store: false, status: "PUBLISHED" });
  for (const filters of [
    { q: key },
    { category: key },
    { featured: "true", q: key },
    { offers: "true", q: key },
  ]) {
    const result = await catalogue(filters);
    expect(result.total).toBe(0);
    expect(result.products).toEqual([]);
    expect(result.facets.brands).toEqual([]);
  }
  expect(await getProduct(key)).toBeNull();
  expect(await getProduct(key, actor)).toMatchObject({ id: productId });
  expect((await compareProducts({ skuIds })).items).toEqual([]);
  expect((await request(`/storefront/products/${key}`)).status).toBe(404);
  await expect(readImage(imageId)).rejects.toMatchObject({ status: 404 });
  expect((await readImage(imageId, actor)).public).toBe(false);
  expect((await sitemap()).some((p) => p.url.endsWith(`/product/${key}`))).toBe(
    false,
  );
  expect(await adminList(actor, "products", 1, key)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: productId, store: false }),
    ]),
  );
});
it("takes a real Direct Sales order for an offline product using the same stock and immutable snapshot", async () => {
  const sales = { ...actor, role: "SALES", scopes: roles.SALES };
  expect((await salesProducts(sales, key)).map((s) => s.id).sort()).toEqual(
    [...skuIds].sort(),
  );
  const data = {
    customerId: officeId,
    customerVersion: 1,
    lines: [{ skuId: skuIds[0], quantity: 2 }],
  };
  const reviewed = await quoteDirectOrder(sales, data);
  const placed = await createDirectOrder(
    sales,
    { ...data, reviewedQuote: reviewed.reviewedQuote, confirmed: true },
    randomUUID(),
  );
  orderId = placed.id;
  expect(
    await db.order.findUniqueOrThrow({ where: { id: orderId } }),
  ).toMatchObject({
    channel: "DIRECT",
    paymentStatus: "PENDING",
    total: reviewed.totals.total,
  });
  expect(
    (await db.sku.findUniqueOrThrow({ where: { id: skuIds[0] } })).reserved,
  ).toBe(2);
});
it("publishes store visibility by approval and allows online discovery, images, wishlists and carts", async () => {
  await change(true);
  expect((await catalogue({ q: key })).total).toBe(1);
  expect(await getProduct(key)).toMatchObject({ id: productId });
  expect((await compareProducts({ skuIds })).items).toHaveLength(2);
  expect((await readImage(imageId)).public).toBe(true);
  expect((await sitemap()).some((p) => p.url.endsWith(`/product/${key}`))).toBe(
    true,
  );
  expect(
    (await request("/account/wishlist", { skuId: skuIds[0] })).status,
  ).toBe(200);
  cartId = (await ensureCart(undefined, actor.id)).cart.id;
  await setCartItem(cartId, { skuId: skuIds[0], quantity: 1 });
  expect(
    (await (await request("/storefront/carts")).json()).data.items[0].name,
  ).toBe(key);
});
it("hides existing wishlist/cart details, blocks stale online checkout and keeps office order history", async () => {
  const p = await change(false);
  expect(p.before).toMatchObject({ store: true });
  expect(p.payload).toEqual({ store: false });
  expect((await (await request("/account/wishlist")).json()).data).toEqual([]);
  expect(
    (await request("/account/wishlist", { skuId: skuIds[1] })).status,
  ).toBe(404);
  const line = (await (await request("/storefront/carts")).json()).data
    .items[0];
  expect(line).toMatchObject({
    name: "Unavailable item",
    slug: null,
    code: null,
    image: null,
    price: null,
    available: 0,
  });
  for (const skuId of skuIds)
    await expect(
      setCartItem(cartId, { skuId, quantity: 1 }),
    ).rejects.toMatchObject({ status: 404 });
  await expect(quote(cartId, "Dubai")).rejects.toMatchObject({ status: 409 });
  await expect(
    checkout(
      cartId,
      actor.id,
      { address, email: `${key}@example.test`, paymentMethod: "SIMULATOR" },
      randomUUID(),
    ),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    (
      await request("/storefront/carts/quote", {
        emirate: "Dubai",
        channel: "DIRECT",
      })
    ).status,
  ).toBe(422);
  await setCartItem(cartId, { skuId: skuIds[0], quantity: 0 });
  expect(
    (await (await request("/storefront/carts")).json()).data.items,
  ).toEqual([]);
  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: true },
  });
  expect(order.items[0].snapshot).toMatchObject({ name: key });
  expect(order.items[0].quantity).toBe(2);
});
it("requires publishing permission, rechecks revoked access and rejects stale visibility approvals", async () => {
  const editor = { ...actor, role: "EDITOR", scopes: roles.EDITOR };
  await expect(
    propose(editor, "product.store", productId, { store: true }),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    propose(actor, "product.store", productId, { store: "false" }),
  ).rejects.toThrow();
  const stale = await propose(actor, "product.store", productId, {
    store: true,
  });
  await change(false);
  await expect(approve(actor, stale.id)).rejects.toMatchObject({ status: 409 });
  const revoked = await propose(actor, "product.store", productId, {
    store: true,
  });
  await db.user.update({ where: { id: actor.id }, data: { role: "EDITOR" } });
  try {
    await expect(approve(actor, revoked.id)).rejects.toMatchObject({
      status: 403,
    });
  } finally {
    await db.user.update({ where: { id: actor.id }, data: { role: "OWNER" } });
  }
  expect(
    (await db.product.findUniqueOrThrow({ where: { id: productId } })).store,
  ).toBe(false);
});
