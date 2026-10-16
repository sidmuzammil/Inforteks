import "dotenv/config";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { db } from "../src/lib/db";
import { actorForUser, roles, type Actor } from "../src/domains/identity";
import { createProduct, catalogue, getProduct } from "../src/domains/catalogue";
import { propose, approve } from "../src/domains/approvals";
import {
  ensureCart,
  setCartItem,
  checkout,
  quote,
  getCart,
  publicCart,
} from "../src/domains/commerce";
import {
  saveBusinessCustomer,
  salesProducts,
  quoteDirectOrder,
  createDirectOrder,
} from "../src/domains/direct-sales";

const key = `quote-${randomUUID()}`;
const address = {
  name: "Office buyer",
  phone: "+971501234567",
  emirate: "Dubai",
  city: "Dubai",
  area: "Business Bay",
  line1: "Test office",
};
let actor: Actor;
let brandId = "",
  categoryId = "",
  cartId = "",
  officeId = "",
  orderId = "";
const products: { id: string; slug: string; skuId: string }[] = [];

async function product(suffix: string, quoteOnly = false, price?: number) {
  const created = await createProduct(actor, {
    name: `${key}-${suffix}`,
    slug: `${key}-${suffix}`,
    brandId,
    categoryId,
    quoteOnly,
    featured: true,
    specs: { cartridge: "Genuine" },
    skus: [{ code: `${key}-${suffix}`, price: price ?? null }],
  });
  const sku = await db.sku.findFirstOrThrow({
    where: { productId: created.id },
  });
  const result = { id: created.id, slug: created.slug, skuId: sku.id };
  products.push(result);
  return result;
}
async function image(id: string) {
  return db.media.create({
    data: {
      productId: id,
      key: `quote-tests/${randomUUID()}.webp`,
      alt: "Isolated catalogue test media",
      width: 120,
      height: 120,
    },
  });
}
async function apply(operation: string, id: string, payload: unknown) {
  const proposal = await propose(actor, operation, id, payload);
  await approve(actor, proposal.id);
  return proposal;
}
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    url.pathname !== "/inforteks_test" ||
    !["127.0.0.1", "localhost"].includes(url.hostname)
  )
    throw new Error("Isolated local database required.");
  vi.stubEnv("DEV_PAYMENT_SIMULATOR", "true");
  await db.user.create({
    data: { id: key, name: key, email: `${key}@example.test`, role: "OWNER" },
  });
  actor = await actorForUser(key);
  categoryId = (await db.category.create({ data: { name: key, slug: key } }))
    .id;
  brandId = (await db.brand.create({ data: { name: key, slug: key } })).id;
  await db.attribute.create({
    data: {
      categoryId,
      key: "cartridge",
      label: "Cartridge type",
      scope: "product",
      required: true,
    },
  });
  await db.shippingZone.create({
    data: { name: key, emirates: ["Dubai"], rate: 0, estimate: "Test" },
  });
  officeId = (await saveBusinessCustomer(actor, { company: key, address })).id;
});
afterAll(async () => {
  const ids = products.map((p) => p.id);
  await db.cart.deleteMany({ where: { userId: key } });
  await db.reservation.deleteMany({ where: { orderId } });
  await db.orderItem.deleteMany({ where: { orderId } });
  await db.order.deleteMany({ where: { id: orderId } });
  await db.businessCustomer.deleteMany({ where: { id: officeId } });
  await db.media.deleteMany({ where: { productId: { in: ids } } });
  await db.inventoryMovement.deleteMany({
    where: { sku: { productId: { in: ids } } },
  });
  await db.sku.deleteMany({ where: { productId: { in: ids } } });
  await db.product.deleteMany({ where: { id: { in: ids } } });
  await db.attribute.deleteMany({ where: { categoryId } });
  await db.category.deleteMany({ where: { id: categoryId } });
  await db.brand.deleteMany({ where: { id: brandId } });
  await db.shippingZone.deleteMany({ where: { name: key } });
  await db.proposal.deleteMany({ where: { actorId: key } });
  await db.auditEvent.deleteMany({ where: { actorId: key } });
  await db.idempotency.deleteMany({ where: { actorId: key } });
  await db.user.deleteMany({ where: { id: key } });
  vi.unstubAllEnvs();
  await db.$disconnect();
});

it("publishes genuine unpriced quote-only products through approvals while retaining image/spec/active-SKU validation", async () => {
  const p = await product("unpriced", true);
  expect(await getProduct(p.slug)).toBeNull();
  await expect(propose(actor, "product.publish", p.id, {})).rejects.toThrow(
    "Add at least one product image",
  );
  await image(p.id);
  await db.product.update({ where: { id: p.id }, data: { specs: {} } });
  await expect(propose(actor, "product.publish", p.id, {})).rejects.toThrow(
    "Missing required specification",
  );
  await db.product.update({
    where: { id: p.id },
    data: { specs: { cartridge: "Genuine" } },
  });
  await db.sku.update({ where: { id: p.skuId }, data: { active: false } });
  await expect(propose(actor, "product.publish", p.id, {})).rejects.toThrow(
    "Add at least one active SKU",
  );
  await db.sku.update({ where: { id: p.skuId }, data: { active: true } });
  await apply("product.publish", p.id, {});
  expect(await getProduct(p.slug)).toMatchObject({
    id: p.id,
    quoteOnly: true,
    skus: [{ id: p.skuId, price: null, compareAt: null, available: 0 }],
  });
  expect(
    await db.sku.findUniqueOrThrow({ where: { id: p.skuId } }),
  ).toMatchObject({ price: null, onHand: 0, reserved: 0 });
  expect(await db.inventoryMovement.count({ where: { skuId: p.skuId } })).toBe(
    0,
  );
  const normal = await product("missing-price");
  await image(normal.id);
  await expect(
    propose(actor, "product.publish", normal.id, {}),
  ).rejects.toThrow("Every active SKU needs an authorized price");
});

it("discovers quote-only products without creating price/offer/availability claims and preserves online visibility", async () => {
  const p = products[0];
  const priced = await product("priced", false, 12000);
  await image(priced.id);
  await apply("product.publish", priced.id, {});
  expect(
    (await catalogue({ category: key })).products.map((p) => p.id),
  ).toEqual(expect.arrayContaining([p.id, priced.id]));
  for (const sort of ["price-asc", "price-desc"])
    expect(
      (await catalogue({ category: key, sort })).products.map((p) => p.id),
    ).toEqual([priced.id, p.id]);
  expect(
    (await catalogue({ category: key, min: "0" })).products.map((p) => p.id),
  ).toEqual([priced.id]);
  expect(
    (await catalogue({ category: key, max: "200" })).products.map((p) => p.id),
  ).toEqual([priced.id]);
  expect((await catalogue({ category: key, offers: "true" })).total).toBe(0);
  expect((await catalogue({ category: key, available: "true" })).total).toBe(0);
  expect((await catalogue({ q: p.slug, featured: "true" })).total).toBe(1);
  await apply("product.store", p.id, { store: false });
  expect(await getProduct(p.slug)).toBeNull();
  expect((await catalogue({ q: p.slug })).total).toBe(0);
  expect(await getProduct(p.slug, actor)).toMatchObject({
    id: p.id,
    quoteOnly: true,
  });
  await apply("product.store", p.id, { store: true });
  await db.category.update({
    where: { id: categoryId },
    data: { visible: false },
  });
  expect(await getProduct(p.slug)).toBeNull();
  expect((await catalogue({ category: key })).total).toBe(0);
  await db.category.update({
    where: { id: categoryId },
    data: { visible: true },
  });
});

it("requires publishing permission and a current version, and rejects enabling unpriced online purchasing", async () => {
  const p = products[0];
  const editor = { ...actor, role: "EDITOR", scopes: roles.EDITOR };
  await expect(
    propose(editor, "product.quoteOnly", p.id, { quoteOnly: false }),
  ).rejects.toMatchObject({ status: 403 });
  const proposal = await propose(actor, "product.quoteOnly", p.id, {
    quoteOnly: false,
  });
  expect(proposal.before).toMatchObject({ quoteOnly: true });
  await expect(approve(actor, proposal.id)).rejects.toThrow(
    "Every active SKU needs an authorized price",
  );
  expect(
    await db.product.findUniqueOrThrow({ where: { id: p.id } }),
  ).toMatchObject({ quoteOnly: true });
  const stale = await propose(actor, "product.quoteOnly", p.id, {
    quoteOnly: true,
  });
  await apply("product.store", p.id, { store: true });
  await expect(approve(actor, stale.id)).rejects.toMatchObject({ status: 409 });
  const revoked = await propose(actor, "product.quoteOnly", p.id, {
    quoteOnly: true,
  });
  await db.user.update({ where: { id: key }, data: { role: "EDITOR" } });
  try {
    await expect(approve(actor, revoked.id)).rejects.toMatchObject({
      status: 403,
    });
  } finally {
    await db.user.update({ where: { id: key }, data: { role: "OWNER" } });
  }
});

it("blocks new and stale online carts while Direct Sales still uses authorized prices and shared stock", async () => {
  const p = products[0];
  const sales = { ...actor, role: "SALES", scopes: roles.SALES };
  const data = {
    customerId: officeId,
    customerVersion: 1,
    lines: [{ skuId: p.skuId, quantity: 2 }],
  };
  expect(await salesProducts(sales, p.slug)).toEqual([]);
  await expect(quoteDirectOrder(sales, data)).rejects.toMatchObject({
    status: 409,
  });
  await apply("price.change", p.skuId, { price: 10000, compareAt: 12000 });
  await apply("inventory.adjust", p.skuId, {
    delta: 10,
    reason: "Verified test inventory",
  });
  expect(await getProduct(p.slug)).toMatchObject({
    quoteOnly: true,
    skus: [{ price: null, compareAt: null, available: 0 }],
  });
  expect((await catalogue({ q: p.slug, offers: "true" })).total).toBe(0);
  expect((await catalogue({ q: p.slug, available: "true" })).total).toBe(0);
  const cart = await ensureCart(undefined, actor.id);
  cartId = cart.cart.id;
  await expect(
    setCartItem(cartId, { skuId: p.skuId, quantity: 1 }),
  ).rejects.toMatchObject({ status: 404 });
  // Build a legitimate cart before staff changes this product to quote-only.
  await apply("product.quoteOnly", p.id, { quoteOnly: false });
  await setCartItem(cartId, { skuId: p.skuId, quantity: 1 });
  await apply("product.quoteOnly", p.id, { quoteOnly: true });
  expect(
    publicCart(await getCart(cart.token, actor.id)).items[0],
  ).toMatchObject({
    name: "Unavailable item",
    price: null,
    available: 0,
  });
  await expect(quote(cartId, "Dubai")).rejects.toMatchObject({ status: 409 });
  await expect(
    checkout(
      cartId,
      actor.id,
      {
        address,
        email: `${key}@example.test`,
        paymentMethod: "SIMULATOR",
      },
      randomUUID(),
    ),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    (await db.sku.findUniqueOrThrow({ where: { id: p.skuId } })).reserved,
  ).toBe(0);
  await setCartItem(cartId, { skuId: p.skuId, quantity: 0 });
  expect(await db.cartItem.count({ where: { cartId } })).toBe(0);
  await apply("product.store", p.id, { store: false });
  expect((await salesProducts(sales, p.slug)).map((s) => s.id)).toEqual([
    p.skuId,
  ]);
  const reviewed = await quoteDirectOrder(sales, data);
  const placed = await createDirectOrder(
    sales,
    {
      ...data,
      reviewedQuote: reviewed.reviewedQuote,
      confirmed: true,
    },
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
    await db.sku.findUniqueOrThrow({ where: { id: p.skuId } }),
  ).toMatchObject({
    onHand: 10,
    reserved: 2,
  });
});
