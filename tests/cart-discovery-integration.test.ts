import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { db } from "../src/lib/db";
import { catalogue } from "../src/domains/catalogue";
import {
  ensureCart,
  getCart,
  publicCart,
  setCartItem,
} from "../src/domains/commerce";

const prefix = `cart-discovery-${randomUUID()}`;
const users = [`${prefix}-a`, `${prefix}-b`];
const carts = new Set<string>();
let productId = "",
  brandId = "",
  categoryId = "";
let skuIds: string[] = [];

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    url.pathname !== "/inforteks_test" ||
    !["127.0.0.1", "localhost"].includes(url.hostname)
  )
    throw new Error("Requires isolated local test database.");
  for (const id of users)
    await db.user.create({
      data: { id, name: id, email: `${id}@example.test` },
    });
  brandId = (await db.brand.create({ data: { name: prefix, slug: prefix } }))
    .id;
  categoryId = (
    await db.category.create({ data: { name: prefix, slug: prefix } })
  ).id;
  const product = await db.product.create({
    data: {
      name: `${prefix} switch`,
      slug: prefix,
      brandId,
      categoryId,
      status: "PUBLISHED",
      specs: { networking: `${prefix}-poe` },
      skus: {
        create: [0, 1, 2].map((i) => ({
          code: `${prefix}-${i}`,
          price: 10000,
          onHand: 20,
          options: { uplink: `${prefix}-sfp` },
        })),
      },
    },
    include: { skus: { orderBy: { code: "asc" } } },
  });
  productId = product.id;
  skuIds = product.skus.map((sku) => sku.id);
});

beforeEach(async () => {
  await db.product.update({ where: { id: productId }, data: { store: true } });
  await db.sku.updateMany({
    where: { productId },
    data: { active: true, price: 10000 },
  });
});

afterAll(async () => {
  vi.restoreAllMocks();
  await db.cart.deleteMany({
    where: { OR: [{ id: { in: [...carts] } }, { userId: { in: users } }] },
  });
  if (productId) await db.sku.deleteMany({ where: { productId } });
  if (productId) await db.product.delete({ where: { id: productId } });
  if (brandId) await db.brand.delete({ where: { id: brandId } });
  if (categoryId) await db.category.delete({ where: { id: categoryId } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});

it("redacts a disabled or unpriced cart configuration while retaining its removal handle", async () => {
  const cart = await ensureCart();
  carts.add(cart.cart.id);
  await setCartItem(cart.cart.id, { skuId: skuIds[0], quantity: 1 });
  for (const data of [
    { active: false, price: 10000 },
    { active: true, price: null },
  ]) {
    await db.sku.update({ where: { id: skuIds[0] }, data });
    expect(publicCart(await getCart(cart.token)).items[0]).toMatchObject({
      skuId: skuIds[0],
      quantity: 1,
      name: "Unavailable item",
      code: null,
      slug: null,
      price: null,
      available: 0,
      image: null,
    });
  }
  await setCartItem(cart.cart.id, { skuId: skuIds[0], quantity: 0 });
  expect(publicCart(await getCart(cart.token)).items).toEqual([]);
  await db.sku.update({
    where: { id: skuIds[0] },
    data: { active: true, price: 10000 },
  });
});

it("finds broad IT specifications and configuration options without exposing offline products", async () => {
  for (const q of [`${prefix}-poe`, `${prefix}-sfp`]) {
    expect((await catalogue({ q })).products.map((p) => p.id)).toContain(
      productId,
    );
  }
  await db.product.update({ where: { id: productId }, data: { store: false } });
  for (const q of [`${prefix}-poe`, `${prefix}-sfp`]) {
    expect((await catalogue({ q })).products.map((p) => p.id)).not.toContain(
      productId,
    );
  }
  await db.product.update({ where: { id: productId }, data: { store: true } });
});

it("allows only one account to claim a guest cart observed concurrently by two accounts", async () => {
  const guest = await ensureCart();
  carts.add(guest.cart.id);
  await setCartItem(guest.cart.id, { skuId: skuIds[0], quantity: 1 });
  for (const [i, user] of users.entries()) {
    const saved = await ensureCart(undefined, user);
    carts.add(saved.cart.id);
    await setCartItem(saved.cart.id, { skuId: skuIds[i + 1], quantity: 1 });
  }
  // Hold both completed reads at the same boundary: each request has observed
  // an unowned cart, but neither has started its claim transaction yet.
  const find = db.cart.findUnique.bind(db.cart);
  let observed = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const spy = vi.spyOn(db.cart, "findUnique").mockImplementation((args) => {
    const request = find(args);
    const then = request.then.bind(request);
    request.then = (fulfilled, rejected) =>
      then(async (row) => {
        if (++observed === 2) release();
        await gate;
        return row;
      }).then(fulfilled, rejected);
    return request;
  });
  let results;
  try {
    results = await Promise.allSettled(
      users.map((user) => ensureCart(guest.token, user)),
    );
  } finally {
    spy.mockRestore();
  }
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  expect(results.find((result) => result.status === "rejected")).toMatchObject({
    reason: { status: 409 },
  });
  const claimed = await db.cart.findUniqueOrThrow({
    where: { id: guest.cart.id },
  });
  const winner = users.indexOf(claimed.userId!);
  expect(winner).toBeGreaterThanOrEqual(0);
  const owned = publicCart(await getCart(guest.token, users[winner]));
  expect(owned.items.map((item) => item.skuId).sort()).toEqual(
    [skuIds[0], skuIds[winner + 1]].sort(),
  );
  const loser = 1 - winner;
  expect(
    publicCart(await getCart(guest.token, users[loser])).items.map(
      (item) => item.skuId,
    ),
  ).toEqual([skuIds[loser + 1]]);
  expect(await getCart(guest.token)).toBeNull();
});
