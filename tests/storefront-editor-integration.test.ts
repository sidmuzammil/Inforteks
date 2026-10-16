import "dotenv/config";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, it, expect } from "vitest";
import { db } from "../src/lib/db";
import { roles, type Actor } from "../src/domains/identity";
import { createProduct, catalogue } from "../src/domains/catalogue";
import {
  homeSectionInput,
  previewHomeSection,
} from "../src/domains/home-sections";
import {
  defaultContent,
  sectionContent,
  sectionProductQuery,
} from "../src/lib/home-sections";
import { sampleProducts } from "../src/lib/sample-products";
const key = `storefront-${randomUUID()}`;
const actor: Actor = {
  id: key,
  role: "OWNER",
  scopes: roles.OWNER,
  human: true,
  source: "admin",
};
let categoryId = "",
  brandId = "";
const ids: string[] = [];
beforeAll(async () => {
  if (new URL(process.env.DATABASE_URL ?? "").pathname !== "/inforteks_test")
    throw new Error("Isolated database required");
  categoryId = (await db.category.create({ data: { name: key, slug: key } }))
    .id;
  brandId = (await db.brand.create({ data: { name: key, slug: key } })).id;
});
afterAll(async () => {
  await db.sku.deleteMany({ where: { productId: { in: ids } } });
  await db.product.deleteMany({ where: { id: { in: ids } } });
  if (categoryId) await db.category.delete({ where: { id: categoryId } });
  if (brandId) await db.brand.delete({ where: { id: brandId } });
  await db.auditEvent.deleteMany({ where: { actorId: key } });
  await db.$disconnect();
});
it("creates every sample starter as a private draft with zero inventory even if store=true is submitted", async () => {
  for (const sample of sampleProducts) {
    const product = await createProduct(actor, {
      name: `${key}-${sample.id}`,
      categoryId,
      brandId,
      sampleTemplate: sample.id,
      store: true,
      skus: [{ code: `${key}-${sample.id}` }],
    });
    ids.push(product.id);
    expect(product).toMatchObject({
      status: "DRAFT",
      demo: true,
      store: false,
    });
    const sku = await db.sku.findFirstOrThrow({
      where: { productId: product.id },
    });
    expect(sku).toMatchObject({
      price: null,
      compareAt: null,
      onHand: 0,
      reserved: 0,
    });
  }
  expect((await catalogue({ category: key })).total).toBe(0);
});
it("uses identical scoped selections for public sections and previews without exposing drafts or Direct-only products", async () => {
  for (const [suffix, status, store] of [
    ["online", "PUBLISHED", true],
    ["offline", "PUBLISHED", false],
    ["draft", "DRAFT", true],
  ] as const) {
    const p = await db.product.create({
      data: {
        name: `${key}-${suffix}`,
        slug: `${key}-${suffix}`,
        categoryId,
        brandId,
        status,
        store,
        skus: { create: { code: `${key}-${suffix}`, price: 12900 } },
      },
    });
    ids.push(p.id);
  }
  const raw = {
    title: "Work essentials",
    subtitle: "",
    kind: "collection",
    href: "/categories",
    buttonLabel: "Explore",
    position: 0,
    visible: false,
    content: {
      ...defaultContent,
      tone: "blue",
      layout: "rail",
      categorySlug: key,
      productLimit: 2,
    },
  };
  const count = await db.homeSection.count();
  const preview = await previewHomeSection(actor, raw);
  expect(preview.products.map((p) => p.name)).toEqual([`${key}-online`]);
  expect(preview.products).toEqual(
    (await catalogue(sectionProductQuery(preview.section))).products,
  );
  expect(await db.homeSection.count()).toBe(count);
  await expect(
    previewHomeSection({ ...actor, scopes: [] }, raw),
  ).rejects.toMatchObject({ status: 403 });
  expect(
    homeSectionInput.safeParse({
      ...raw,
      content: { ...raw.content, productLimit: 100 },
    }).success,
  ).toBe(false);
  expect(
    homeSectionInput.safeParse({
      ...raw,
      content: { ...raw.content, categorySlug: "//external.test" },
    }).success,
  ).toBe(false);
});
it("keeps existing section JSON compatible and validates new presentation options", () => {
  expect(sectionContent({ eyebrow: "Existing merchant copy" })).toMatchObject({
    tone: "navy",
    productLimit: 5,
    layout: "grid",
    eyebrow: "Existing merchant copy",
  });
});
