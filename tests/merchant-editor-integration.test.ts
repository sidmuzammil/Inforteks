import "dotenv/config";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, it, expect } from "vitest";
import { db } from "../src/lib/db";
import { roles, type Actor } from "../src/domains/identity";
import { saveResource } from "../src/domains/administration";
import { createProduct, catalogue } from "../src/domains/catalogue";
import { previewHomeSection } from "../src/domains/home-sections";
import { defaultContent } from "../src/lib/home-sections";
const key = `merchant-${randomUUID()}`;
const owner: Actor = {
  id: key,
  role: "OWNER",
  scopes: roles.OWNER,
  human: true,
  source: "admin",
};
let categoryId = "",
  brandId = "",
  productId = "",
  sectionId = "";
beforeAll(() => {
  if (new URL(process.env.DATABASE_URL ?? "").pathname !== "/inforteks_test")
    throw new Error("Isolated test database required.");
});
afterAll(async () => {
  if (sectionId) await db.homeSection.delete({ where: { id: sectionId } });
  if (productId) {
    await db.sku.deleteMany({ where: { productId } });
    await db.product.delete({ where: { id: productId } });
  }
  if (categoryId) await db.category.delete({ where: { id: categoryId } });
  if (brandId) await db.brand.delete({ where: { id: brandId } });
  await db.auditEvent.deleteMany({ where: { actorId: key } });
  await db.$disconnect();
});
it("creates a first category and brand, stores full sale details, and filters featured independently from offers", async () => {
  const category = (await saveResource(owner, "categories", {
    name: key,
    slug: key,
  })) as { id: string };
  categoryId = category.id;
  const brand = (await saveResource(owner, "brands", {
    name: key,
    slug: key,
  })) as { id: string };
  brandId = brand.id;
  const p = await createProduct(owner, {
    name: key,
    categoryId,
    brandId,
    model: "Model X",
    featured: true,
    skus: [
      {
        code: key,
        price: 99995,
        compareAt: 129995,
        condition: "Refurbished",
        warranty: "Merchant supplied warranty",
        specs: { ram: 16 },
      },
    ],
  });
  productId = p.id;
  await db.product.update({
    where: { id: p.id },
    data: { status: "PUBLISHED" },
  });
  let results = await catalogue({ q: key, featured: "true" });
  expect(results.total).toBe(1);
  expect(results.products[0].skus[0]).toMatchObject({
    price: 99995,
    compareAt: 129995,
    condition: "Refurbished",
  });
  await db.product.update({ where: { id: p.id }, data: { featured: false } });
  results = await catalogue({ q: key, featured: "true" });
  expect(results.total).toBe(0);
  expect((await catalogue({ q: key, offers: "true" })).total).toBe(1);
  await expect(
    createProduct({ ...owner, scopes: roles.CONTENT }, { name: key }),
  ).rejects.toMatchObject({ status: 403 });
});
it("previews sanitized HTML without saving, rejects stale edits, and denies customer access", async () => {
  const data = {
    title: key,
    subtitle: "",
    kind: "html",
    href: "/categories",
    position: 100,
    visible: false,
    content: {
      ...defaultContent,
      html: "<h2>Sale</h2><script>alert(1)</script>",
    },
  };
  const before = await db.homeSection.count();
  const preview = await previewHomeSection(owner, data);
  expect(preview.section.content.html).toBe("<h2>Sale</h2>");
  expect(await db.homeSection.count()).toBe(before);
  await expect(
    previewHomeSection({ ...owner, role: "CUSTOMER", scopes: [] }, data),
  ).rejects.toMatchObject({ status: 403 });
  const section = (await saveResource(owner, "home-sections", data)) as {
    id: string;
    version: number;
  };
  sectionId = section.id;
  await saveResource(
    owner,
    "home-sections",
    { ...data, version: section.version, title: "First editor's changes" },
    section.id,
  );
  await expect(
    saveResource(
      owner,
      "home-sections",
      { ...data, version: section.version, title: "Stale changes" },
      section.id,
    ),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    (await db.homeSection.findUniqueOrThrow({ where: { id: section.id } }))
      .title,
  ).toBe("First editor's changes");
});
