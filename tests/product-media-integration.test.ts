import "dotenv/config";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import sharp from "sharp";
import { beforeAll, afterAll, expect, it } from "vitest";
import { db } from "../src/lib/db";
import { roles, hash, type Actor } from "../src/domains/identity";
import { updateProductMedia } from "../src/domains/product-media";
import { includeProduct, publicProduct } from "../src/domains/catalogue";
import { storeImage } from "../src/domains/storage";
import { getCart } from "../src/domains/commerce";
import { adminList } from "../src/domains/administration";
const key = `media-${randomUUID()}`;
const actor: Actor = {
  id: key,
  role: "OWNER",
  scopes: roles.OWNER,
  source: "admin",
  human: true,
};
let brandId = "",
  categoryId = "";
const productIds: string[] = [],
  uploadedKeys: string[] = [],
  cartIds: string[] = [];
beforeAll(async () => {
  if (new URL(process.env.DATABASE_URL ?? "").pathname !== "/inforteks_test")
    throw new Error("Isolated test database required.");
  brandId = (await db.brand.create({ data: { name: key, slug: key } })).id;
  categoryId = (await db.category.create({ data: { name: key, slug: key } }))
    .id;
});
afterAll(async () => {
  await db.cartItem.deleteMany({ where: { cartId: { in: cartIds } } });
  await db.cart.deleteMany({ where: { id: { in: cartIds } } });
  await db.media.deleteMany({ where: { productId: { in: productIds } } });
  await db.sku.deleteMany({ where: { productId: { in: productIds } } });
  await db.product.deleteMany({ where: { id: { in: productIds } } });
  await db.category.delete({ where: { id: categoryId } });
  await db.brand.delete({ where: { id: brandId } });
  await db.auditEvent.deleteMany({ where: { actorId: key } });
  for (const file of uploadedKeys)
    await rm(`${process.env.UPLOAD_DIR ?? ".data/uploads"}/${file}`, {
      force: true,
    });
  await db.$disconnect();
});
async function fixture(published = true) {
  const id = randomUUID();
  const product = await db.product.create({
    data: {
      name: key,
      slug: `${key}-${id}`,
      brandId,
      categoryId,
      status: published ? "PUBLISHED" : "DRAFT",
      skus: { create: { code: `${key}-${id}`, price: 10000, onHand: 5 } },
      media: {
        create: [0, 1, 2].map((position) => ({
          key: `${randomUUID()}.webp`,
          alt: `Photo ${position + 1}`,
          position,
          public: published && position < 2,
        })),
      },
    },
    include: includeProduct,
  });
  productIds.push(product.id);
  return product;
}
const changes = (media: { id: string; alt: string }[]) =>
  media.map(({ id, alt }) => ({ id, alt }));

it("saves order and descriptions atomically without replacing files or publishing private images", async () => {
  const p = await fixture();
  const images = changes([p.media[2], p.media[1], p.media[0]]);
  images[1].alt = "Laptop front view";
  const result = await updateProductMedia(actor, p.id, {
    version: p.version,
    images,
  });
  expect(result.version).toBe(p.version + 1);
  const saved = await db.product.findUniqueOrThrow({
    where: { id: p.id },
    include: includeProduct,
  });
  expect(saved.media.map((m) => m.id)).toEqual(images.map((m) => m.id));
  expect(saved.media.map((m) => m.position)).toEqual([0, 1, 2]);
  const adminRows = (await adminList(actor, "products", 1, key)) as {
    id: string;
    media: { id: string }[];
  }[];
  expect(
    adminRows.find((row) => row.id === p.id)!.media.map((m) => m.id),
  ).toEqual(images.map((m) => m.id));
  for (const image of saved.media)
    expect(image).toMatchObject({
      key: p.media.find((m) => m.id === image.id)!.key,
      public: p.media.find((m) => m.id === image.id)!.public,
    });
  expect(publicProduct(saved).media[0]).toMatchObject({
    id: p.media[1].id,
    alt: "Laptop front view",
  });
  expect(publicProduct(saved).media).toHaveLength(2);
  const token = randomUUID();
  const cart = await db.cart.create({
    data: {
      tokenHash: hash(token),
      items: { create: { skuId: p.skus[0].id, quantity: 1 } },
    },
  });
  cartIds.push(cart.id);
  const cartProduct = (await getCart(token))!.items[0].sku.product;
  expect(cartProduct.media.map((m) => m.id)).toEqual([
    p.media[1].id,
    p.media[0].id,
  ]);
  expect(
    await db.auditEvent.count({
      where: { targetId: p.id, operation: "product.media.edit" },
    }),
  ).toBe(1);
});

it("denies customer and read-only writes, and requires publishing permission for a live product", async () => {
  const p = await fixture();
  const input = { version: p.version, images: changes([...p.media].reverse()) };
  for (const role of ["CUSTOMER", "INVENTORY", "EDITOR"]) {
    await expect(
      updateProductMedia({ ...actor, role, scopes: roles[role] }, p.id, input),
    ).rejects.toMatchObject({ status: 403 });
  }
  const draft = await fixture(false);
  await expect(
    updateProductMedia(
      { ...actor, role: "EDITOR", scopes: roles.EDITOR },
      draft.id,
      { version: draft.version, images: changes([...draft.media].reverse()) },
    ),
  ).resolves.toMatchObject({ version: draft.version + 1 });
  expect(
    (await db.product.findUniqueOrThrow({ where: { id: p.id } })).version,
  ).toBe(p.version);
});

it("rejects missing, duplicate and foreign images without changing any image or the product version", async () => {
  const p = await fixture();
  const other = await fixture();
  for (const images of [
    changes(p.media.slice(1)),
    changes([p.media[0], p.media[0], p.media[2]]),
    changes([other.media[0], p.media[1], p.media[2]]),
  ]) {
    await expect(
      updateProductMedia(actor, p.id, { version: p.version, images }),
    ).rejects.toThrow();
    const saved = await db.product.findUniqueOrThrow({
      where: { id: p.id },
      include: includeProduct,
    });
    expect(saved.version).toBe(p.version);
    expect(changes(saved.media)).toEqual(changes(p.media));
  }
});

it("rejects stale and competing edits instead of losing another editor's order", async () => {
  const p = await fixture();
  const input = { version: p.version, images: changes([...p.media].reverse()) };
  const results = await Promise.allSettled([
    updateProductMedia(actor, p.id, input),
    updateProductMedia(actor, p.id, { ...input, images: changes(p.media) }),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.find((r) => r.status === "rejected")).toMatchObject({
    reason: { status: 409 },
  });
  await expect(updateProductMedia(actor, p.id, input)).rejects.toMatchObject({
    status: 409,
  });
  expect(
    (await db.product.findUniqueOrThrow({ where: { id: p.id } })).version,
  ).toBe(p.version + 1);
});

it("appends concurrent uploads after the chosen order and invalidates an older editor", async () => {
  const p = await fixture();
  const ordered = await updateProductMedia(actor, p.id, {
    version: p.version,
    images: changes([...p.media].reverse()),
  });
  const bytes = await sharp({
    create: { width: 120, height: 120, channels: 3, background: "blue" },
  })
    .png()
    .toBuffer();
  const uploads = await Promise.all(
    [1, 2].map(async (n) => {
      const media = await storeImage(
        actor,
        new File([new Uint8Array(bytes)], `photo-${n}.png`, {
          type: "image/png",
        }),
        p.id,
        `Uploaded ${n}`,
      );
      uploadedKeys.push(media.key);
      return media;
    }),
  );
  expect(uploads.map((m) => m.position).sort()).toEqual([3, 4]);
  const saved = await db.product.findUniqueOrThrow({
    where: { id: p.id },
    include: includeProduct,
  });
  expect(saved.media.slice(0, 3).map((m) => m.id)).toEqual(
    ordered.media.map((m) => m.id),
  );
  expect(saved.media.slice(3).every((m) => !m.public)).toBe(true);
  await expect(
    updateProductMedia(actor, p.id, {
      version: ordered.version,
      images: changes(saved.media),
    }),
  ).rejects.toMatchObject({ status: 409 });
});
