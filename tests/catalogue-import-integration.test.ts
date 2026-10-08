import "dotenv/config";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, it, expect } from "vitest";
import { db } from "../src/lib/db";
import { actorForUser, type Actor } from "../src/domains/identity";
import {
  previewCatalogueImport,
  commitCatalogueImport,
} from "../src/domains/catalogue-import";

const key = `manifest-${randomUUID()}`;
let actor: Actor;
const manifest = (suffix = "one") => ({
  version: 1,
  source: key,
  products: [
    {
      externalId: suffix,
      sourceUrl: "https://www.hp.com/product-source",
      name: `Researched ${suffix} cartridge`,
      slug: `${key}-${suffix}`,
      brand: { name: key, slug: key },
      category: {
        name: key,
        slug: key,
        parent: { name: `${key} printers`, slug: `${key}-parent` },
      },
      sku: { code: `${key}-${suffix}`, mpn: `${key}-${suffix}-mpn` },
      description: "Original factual product description.",
      images: [],
      unresolved: ["Manufacturer photograph awaits visual verification."],
    },
  ],
});
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    url.pathname !== "/inforteks_test" ||
    !["localhost", "127.0.0.1"].includes(url.hostname)
  )
    throw new Error("Isolated local database required.");
  await db.user.create({
    data: { id: key, name: key, email: `${key}@example.test`, role: "OWNER" },
  });
  actor = await actorForUser(key);
});
afterAll(async () => {
  await db.catalogueSource.deleteMany({ where: { source: key } });
  await db.sku.deleteMany({ where: { code: { startsWith: key } } });
  await db.product.deleteMany({ where: { slug: { startsWith: key } } });
  await db.category.deleteMany({ where: { slug: key } });
  await db.category.deleteMany({ where: { slug: `${key}-parent` } });
  await db.brand.deleteMany({ where: { slug: key } });
  await db.auditEvent.deleteMany({ where: { actorId: key } });
  await db.importBatch.deleteMany({ where: { actorId: key } });
  await db.user.deleteMany({ where: { id: key } });
  await db.$disconnect();
});
it("previews research blockers without writing products then creates only unpriced zero-stock drafts", async () => {
  const preview = await previewCatalogueImport(actor, { manifest: manifest() });
  expect(preview.summary).toEqual({ create: 1, existing: 0, conflict: 0 });
  expect(preview.rows[0].issues).toContain(
    "A verified product photograph is required before publication.",
  );
  expect(await db.product.count({ where: { slug: `${key}-one` } })).toBe(0);
  await expect(
    commitCatalogueImport(actor, preview.id, { fingerprint: "0".repeat(64) }),
  ).rejects.toMatchObject({ status: 409 });
  const saved = await commitCatalogueImport(actor, preview.id, {
    fingerprint: preview.fingerprint,
  });
  const product = await db.product.findUniqueOrThrow({
    where: { id: saved.rows[0].productId },
    include: { skus: true },
  });
  expect(product).toMatchObject({
    status: "DRAFT",
    quoteOnly: true,
    store: true,
    demo: false,
  });
  expect(product.skus[0]).toMatchObject({
    price: null,
    compareAt: null,
    onHand: 0,
    reserved: 0,
  });
  const replay = await commitCatalogueImport(actor, preview.id, {
    fingerprint: preview.fingerprint,
  });
  expect(replay.replay).toBe(true);
  expect(replay.rows).toEqual(saved.rows);
  const repeated = await previewCatalogueImport(actor, {
    manifest: manifest(),
  });
  expect(repeated.summary.existing).toBe(1);
});
it("preserves existing stock and prices and flags changed sources and SKU collisions", async () => {
  await db.sku.update({
    where: { code: `${key}-one` },
    data: { price: 15000, onHand: 9 },
  });
  const changed = manifest();
  changed.products[0].name = "Changed source name";
  const preview = await previewCatalogueImport(actor, { manifest: changed });
  expect(preview.summary.conflict).toBe(1);
  await expect(
    commitCatalogueImport(actor, preview.id, {
      fingerprint: preview.fingerprint,
    }),
  ).rejects.toMatchObject({ status: 409 });
  const colliding = manifest("collision");
  colliding.products[0].sku.code = `${key}-one`;
  expect(
    (await previewCatalogueImport(actor, { manifest: colliding })).summary
      .conflict,
  ).toBe(1);
  expect(
    await db.sku.findUniqueOrThrow({ where: { code: `${key}-one` } }),
  ).toMatchObject({ price: 15000, onHand: 9 });
});
it("serializes two independently reviewed batches of the same source without duplicate products", async () => {
  const first = await previewCatalogueImport(actor, {
    manifest: manifest("concurrent"),
  });
  const second = await previewCatalogueImport(actor, {
    manifest: manifest("concurrent"),
  });
  const [a, b] = await Promise.all([
    commitCatalogueImport(actor, first.id, { fingerprint: first.fingerprint }),
    commitCatalogueImport(actor, second.id, {
      fingerprint: second.fingerprint,
    }),
  ]);
  expect(a.rows).toEqual(b.rows);
  expect(await db.product.count({ where: { slug: `${key}-concurrent` } })).toBe(
    1,
  );
});
it("rejects nonhuman, unprivileged, expired and currently revoked imports", async () => {
  const preview = await previewCatalogueImport(actor, {
    manifest: manifest("permissions"),
  });
  const confirmation = { fingerprint: preview.fingerprint };
  await expect(
    commitCatalogueImport(
      { ...actor, human: false, source: "api" },
      preview.id,
      confirmation,
    ),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    previewCatalogueImport(
      { ...actor, scopes: [] },
      { manifest: manifest("permissions") },
    ),
  ).rejects.toMatchObject({ status: 403 });
  await db.user.update({ where: { id: key }, data: { role: "CUSTOMER" } });
  await expect(
    commitCatalogueImport(actor, preview.id, confirmation),
  ).rejects.toMatchObject({ status: 403 });
  await db.user.update({ where: { id: key }, data: { role: "OWNER" } });
  await db.importBatch.update({
    where: { id: preview.id },
    data: { createdAt: new Date(Date.now() - 16 * 60_000) },
  });
  await expect(
    commitCatalogueImport(actor, preview.id, confirmation),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    await db.product.count({ where: { slug: `${key}-permissions` } }),
  ).toBe(0);
});
it("rejects prices, inventory and path escapes in researched manifests", async () => {
  const input = manifest("invalid");
  for (const injected of [{ price: 199 }, { onHand: 50 }]) {
    await expect(
      previewCatalogueImport(actor, {
        manifest: {
          ...input,
          products: [
            {
              ...input.products[0],
              sku: { ...input.products[0].sku, ...injected },
            },
          ],
        },
      }),
    ).rejects.toThrow();
  }
  await expect(
    previewCatalogueImport(actor, {
      manifest: {
        ...input,
        products: [
          {
            ...input.products[0],
            images: [
              {
                file: "../private.webp",
                sha256: "a".repeat(64),
                alt: "Product",
                sourceUrl: "https://www.hp.com/photo.webp",
              },
            ],
          },
        ],
      },
    }),
  ).rejects.toThrow();
  expect(await db.product.count({ where: { slug: `${key}-invalid` } })).toBe(0);
});
