import "dotenv/config";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { db } from "../../src/lib/db";

const key = `quote-browser-${Date.now()}`;
const email = `${key}@example.test`;
let productId = "";
let skuId = "";

test.beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/inforteks"
  )
    throw new Error("Local development fixtures only.");
  const brand = await db.brand.findFirstOrThrow();
  const category = await db.category.findFirstOrThrow({
    where: { visible: true },
  });
  const product = await db.product.create({
    data: {
      name: key,
      slug: key,
      description: "Local browser fixture for quote catalogue interactions.",
      status: "PUBLISHED",
      quoteOnly: true,
      brandId: brand.id,
      categoryId: category.id,
      skus: { create: { code: key, mpn: `${key}-MPN`, price: null } },
    },
    include: { skus: true },
  });
  productId = product.id;
  skuId = product.skus[0].id;
});

test.afterAll(async () => {
  await db.inquiry.deleteMany({ where: { email } });
  if (productId) {
    await db.sku.deleteMany({ where: { productId } });
    await db.product.delete({ where: { id: productId } });
  }
  await db.$disconnect();
});

test("quote catalogue keeps price and stock unknown through discovery, selection and inquiry", async ({
  page,
}) => {
  await page.goto(`/search?q=${key}`);
  const card = page.locator(".product-card").filter({ hasText: key });
  await expect(card).toContainText("Request a quote");
  await expect(card).toContainText("Availability on request");
  await expect(card).not.toContainText(/AED|Out of stock|In stock/);
  await expect(
    card.getByRole("button", { name: /Add .* to cart/ }),
  ).toHaveCount(0);
  await expect(card.locator('img[src*="illustrations"]')).toHaveCount(0);
  await card.getByRole("button", { name: `Save ${key} to wishlist` }).click();
  await card.getByRole("button", { name: `Compare ${key}` }).click();

  await page.goto("/wishlist");
  await expect(page.locator(".comparison-table")).toContainText(
    "Request a quote",
  );
  await expect(page.locator(".comparison-table")).not.toContainText("AED");
  await page.goto("/compare");
  await expect(page.locator(".comparison-table")).toContainText(
    "Availability on request",
  );
  await expect(page.locator(".comparison-table")).not.toContainText(
    /AED|Out of stock/,
  );

  await page.goto(`/product/${key}?sku=${skuId}`);
  await expect(page.locator(".detail-price")).toHaveText("Request a quote");
  await expect(
    page.getByRole("button", { name: "Add to cart", exact: true }),
  ).toHaveCount(0);
  const schema = JSON.parse(
    (await page.locator('script[type="application/ld+json"]').textContent()) ??
      "{}",
  );
  expect(schema.offers).toBeUndefined();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page
    .getByRole("link", { name: "Request a quote", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`product=${key}.*sku=${skuId}`));
  await expect(
    page.getByRole("heading", { name: "Request a product quote" }),
  ).toBeVisible();
  await expect(page.locator("main form")).toContainText(`${key}-MPN`);
  const accessibility = await new AxeBuilder({ page })
    .include("main")
    .analyze();
  expect(
    accessibility.violations.filter((v) =>
      ["critical", "serious"].includes(v.impact ?? ""),
    ),
  ).toEqual([]);
  await page
    .getByLabel("Your name", { exact: true })
    .fill("Quote browser customer");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Quantity needed", { exact: true }).fill("12");
  await page
    .getByLabel("Your requirements", { exact: true })
    .fill("Please confirm compatibility and a quotation for twelve units.");
  await page
    .getByRole("button", { name: "Request a quote", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Request received.");
  const inquiry = await db.inquiry.findFirstOrThrow({ where: { email } });
  expect(inquiry.message).toContain(key);
  expect(inquiry.message).toContain("12");
  expect(
    await db.sku.findUniqueOrThrow({ where: { id: skuId } }),
  ).toMatchObject({ price: null, onHand: 0, reserved: 0 });
});
