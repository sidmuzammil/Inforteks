import "dotenv/config";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, it, expect } from "vitest";
import { db } from "../src/lib/db";
import { createInquiry } from "../src/domains/inquiries";
import { compareProducts } from "../src/domains/comparison";

const key = `inquiries-${randomUUID()}`;
let productId: string, skuId: string, categoryId: string, brandId: string;
const input = {
  name: "Quote customer",
  email: `${key}@example.test`,
  subject: "Client supplied subject",
  message: "Please confirm compatibility and lead time.",
};
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    url.pathname !== "/inforteks_test" ||
    !["localhost", "127.0.0.1"].includes(url.hostname)
  )
    throw new Error("Isolated local database required.");
  categoryId = (await db.category.create({ data: { name: key, slug: key } }))
    .id;
  brandId = (await db.brand.create({ data: { name: key, slug: key } })).id;
  const product = await db.product.create({
    data: {
      name: "Genuine researched toner",
      slug: key,
      brandId,
      categoryId,
      status: "PUBLISHED",
      store: true,
      quoteOnly: true,
      skus: {
        create: { code: key, mpn: "VERIFIED-TEST-MPN", price: null, onHand: 0 },
      },
    },
    include: { skus: true },
  });
  productId = product.id;
  skuId = product.skus[0].id;
});
afterAll(async () => {
  await db.inquiry.deleteMany({ where: { email: input.email } });
  await db.sku.deleteMany({ where: { productId } });
  await db.product.deleteMany({ where: { id: productId } });
  await db.category.deleteMany({ where: { id: categoryId } });
  await db.brand.deleteMany({ where: { id: brandId } });
  await db.$disconnect();
});
it("saves server-resolved product and quantity without placing an order or changing stock", async () => {
  const before = await db.sku.findUniqueOrThrow({ where: { id: skuId } });
  const response = await createInquiry({
    ...input,
    productSlug: key,
    skuId,
    quantity: 12,
  });
  const saved = await db.inquiry.findUniqueOrThrow({
    where: { id: response.id },
  });
  expect(saved.subject).toBe("Quote: Genuine researched toner");
  expect(saved.message).toContain(
    "Manufacturer part number: VERIFIED-TEST-MPN",
  );
  expect(saved.message).toContain("Requested quantity: 12");
  expect(saved.message).toContain(input.message);
  expect(response.message).not.toMatch(/email.*sent/i);
  const after = await db.sku.findUniqueOrThrow({ where: { id: skuId } });
  expect(after.onHand).toBe(before.onHand);
  expect(after.reserved).toBe(before.reserved);
  expect(await db.orderItem.count({ where: { skuId } })).toBe(0);
});
it("rejects stale visibility, mismatched references, inactive SKUs and invalid quantities", async () => {
  const request = { ...input, productSlug: key, skuId, quantity: 1 };
  await expect(
    createInquiry({ ...request, productSlug: "not-this-product" }),
  ).rejects.toMatchObject({ status: 404 });
  await expect(createInquiry({ ...request, quantity: 0 })).rejects.toThrow();
  await expect(createInquiry({ ...input, productSlug: key })).rejects.toThrow();
  for (const change of [{ store: false }, { status: "DRAFT" as const }]) {
    await db.product.update({ where: { id: productId }, data: change });
    await expect(createInquiry(request)).rejects.toMatchObject({ status: 404 });
    await db.product.update({
      where: { id: productId },
      data: { store: true, status: "PUBLISHED" },
    });
  }
  await db.category.update({
    where: { id: categoryId },
    data: { visible: false },
  });
  await expect(createInquiry(request)).rejects.toMatchObject({ status: 404 });
  await db.category.update({
    where: { id: categoryId },
    data: { visible: true },
  });
  await db.sku.update({ where: { id: skuId }, data: { active: false } });
  await expect(createInquiry(request)).rejects.toMatchObject({ status: 404 });
  await db.sku.update({ where: { id: skuId }, data: { active: true } });
});
it("keeps quote-only products available for factual comparison without a stock or price claim", async () => {
  await db.sku.update({
    where: { id: skuId },
    data: { price: 15000, onHand: 20, cost: 12345 },
  });
  const comparison = await compareProducts({ skuIds: [skuId] });
  expect(comparison.items).toHaveLength(1);
  expect(comparison.rows.find((r) => r.key === "availability")?.values).toEqual(
    ["Availability on request"],
  );
  expect(comparison.items[0].product.skus[0].price).toBeNull();
  expect(JSON.stringify(comparison)).not.toContain("12345");
  expect(JSON.stringify(comparison)).not.toContain("AED");
});
it("retains ordinary contact inquiries without creating contact identities", async () => {
  const response = await createInquiry(input);
  const saved = await db.inquiry.findUniqueOrThrow({
    where: { id: response.id },
  });
  expect(saved.message).toBe(input.message);
  expect(saved.subject).toBe(input.subject);
  expect(await db.user.count({ where: { email: input.email } })).toBe(0);
});
