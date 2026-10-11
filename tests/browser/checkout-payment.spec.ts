import "dotenv/config";
import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { db } from "../../src/lib/db";

const key = `checkout-payment-${randomUUID()}`;
const email = `${key}@example.test`;
const couponCode = `UIPAY${randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`;
const carts = new Set<string>();
let productId = "",
  categoryId = "",
  brandId = "",
  skuId = "",
  couponId = "";
let localFixtures = false;

test.beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    url.pathname !== "/inforteks" ||
    !["127.0.0.1", "localhost"].includes(url.hostname)
  )
    throw new Error(
      "Checkout payment fixtures require the local development database.",
    );
  localFixtures = true;
  brandId = (await db.brand.create({ data: { name: key, slug: key } })).id;
  categoryId = (await db.category.create({ data: { name: key, slug: key } }))
    .id;
  const product = await db.product.create({
    data: {
      name: "Local payment interface fixture with a long product name for narrow order summaries",
      slug: key,
      brandId,
      categoryId,
      status: "PUBLISHED",
      demo: true,
      skus: { create: { code: key, price: 12345, onHand: 10 } },
    },
    include: { skus: true },
  });
  productId = product.id;
  skuId = product.skus[0].id;
  couponId = (
    await db.coupon.create({
      data: {
        code: couponCode,
        percent: 10,
        startsAt: new Date(Date.now() - 60_000),
        endsAt: new Date(Date.now() + 3_600_000),
      },
    })
  ).id;
});

test.afterAll(async () => {
  if (!localFixtures) return;
  await db.cart.deleteMany({ where: { id: { in: [...carts] } } });
  if (couponId) await db.coupon.delete({ where: { id: couponId } });
  if (productId) await db.sku.deleteMany({ where: { productId } });
  if (productId) await db.product.delete({ where: { id: productId } });
  if (categoryId) await db.category.delete({ where: { id: categoryId } });
  if (brandId) await db.brand.delete({ where: { id: brandId } });
  await db.$disconnect();
});

async function prepareCheckout(page: Page, methods: string[]) {
  const response = await page.request.patch("/api/v1/storefront/carts", {
    headers: { Origin: "http://localhost:3000" },
    data: { skuId, quantity: 1 },
  });
  expect(response.status()).toBe(200);
  const cart = await page.request.get("/api/v1/storefront/carts");
  carts.add((await cart.json()).data.id);

  // Keep real local price/stock/delivery calculation. Only substitute the
  // advertised methods to exercise disabled and future-provider UI states.
  await page.route("**/api/v1/storefront/carts/quote", async (route) => {
    const result = await route.fetch();
    expect(result.status()).toBe(200);
    const body = await result.json();
    body.data.paymentMethods = methods;
    await route.fulfill({ response: result, json: body });
  });
  const submissions: string[] = [];
  await page.route("**/api/v1/storefront/checkout", async (route) => {
    submissions.push(route.request().postData() ?? "");
    // These are presentation/validation tests; never create even a local order.
    await route.fulfill({
      status: 409,
      json: {
        error: { message: "Unexpected test submission; no order created." },
      },
    });
  });
  await page.goto("/checkout");
  await expect(page.locator(".summary-line.total")).toBeVisible();
  return submissions;
}

async function fillCheckout(page: Page) {
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page
    .getByLabel("Full name", { exact: true })
    .fill("Local payment test");
  await page
    .getByLabel("UAE mobile number", { exact: true })
    .fill("+971501234567");
  await page.getByLabel("City", { exact: true }).fill("Dubai");
  await page
    .getByLabel("Area / neighbourhood", { exact: true })
    .fill("Local payment area");
  await page
    .getByLabel("Building, street & apartment", { exact: true })
    .fill("Local payment test building");
  await page.locator('#checkout-form input[type="checkbox"]').check();
}

for (const width of [1440, 390, 320])
  test(`payment availability is honest, accessible and fits ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const submissions = await prepareCheckout(page, [
      "OFFLINE",
      "FUTURE_GATEWAY",
    ]);
    const offline = page.getByRole("radio", { name: /^Offline payment\b/ });
    const card = page.getByRole("radio", { name: /^Card payment\b/ });
    await expect(offline).toBeChecked();
    await expect(card).toBeDisabled();
    await expect(page.getByRole("radio")).toHaveCount(2);
    await expect(page.locator('input[value="FUTURE_GATEWAY"]')).toHaveCount(0);
    await expect(page.locator("main")).toContainText(/unpaid/i);
    await expect(page.locator("main")).toContainText(
      /no (?:money|online payment|charge)/i,
    );
    await expect(
      page.getByRole("textbox", { name: /card number|cvv|cvc|security code/i }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Edit cart", exact: true }),
    ).toHaveAttribute("href", "/cart");
    await offline.focus();
    await expect(offline).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(offline).toBeChecked();
    await expect(card).not.toBeChecked();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const accessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      accessibility.violations.filter((issue) =>
        ["serious", "critical"].includes(issue.impact ?? ""),
      ),
    ).toEqual([]);
    await page.getByRole("heading", { level: 1 }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `.data/screenshots/checkout-payment-${width}.png`,
      fullPage: true,
    });
    expect(submissions).toEqual([]);
  });

test("chosen payment survives delivery and promo recalculation", async ({
  page,
}) => {
  const submissions = await prepareCheckout(page, ["OFFLINE", "SIMULATOR"]);
  const offline = page.getByRole("radio", { name: /^Offline payment\b/ });
  const simulator = page.getByRole("radio", {
    name: /^Development simulator\b/,
  });
  await offline.focus();
  await page.keyboard.press("ArrowRight");
  await expect(simulator).toBeChecked();

  const regionQuote = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/storefront/carts/quote") &&
      response.request().postDataJSON().emirate === "Sharjah",
  );
  await page.getByLabel("Deliver to", { exact: true }).selectOption("Sharjah");
  await expect(
    page.getByRole("button", { name: "Place order", exact: true }),
  ).toBeDisabled();
  await regionQuote;
  await expect(page.locator(".summary-line.total")).toBeVisible();
  await expect(simulator).toBeChecked();

  const promoQuote = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/storefront/carts/quote") &&
      response.request().postDataJSON().coupon === couponCode,
  );
  await page.getByLabel("Promo code", { exact: true }).fill(couponCode);
  await expect(
    page.getByRole("button", { name: "Place order", exact: true }),
  ).toBeDisabled();
  await promoQuote;
  await expect(page.locator(".summary-line.total")).toBeVisible();
  await expect(simulator).toBeChecked();
  await expect(page.locator(".summary-card")).toContainText("Discount");
  await expect(
    page.getByRole("button", { name: "Place order", exact: true }),
  ).toBeEnabled();
  expect(submissions).toEqual([]);
});

for (const methods of [[], ["FUTURE_GATEWAY"]])
  test(`${methods.length ? "unknown-only" : "empty"} payment methods cannot place an order`, async ({
    page,
  }) => {
    const submissions = await prepareCheckout(page, methods);
    await fillCheckout(page);
    await expect(
      page.getByRole("button", { name: "Place order", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("radio", { name: /^Card payment\b/ }),
    ).toBeDisabled();
    await expect(
      page.locator('input[name="paymentMethod"]:enabled'),
    ).toHaveCount(0);
    await expect(page.locator('input[value="FUTURE_GATEWAY"]')).toHaveCount(0);
    await expect(page.locator('main a[href="/contact"]')).toBeVisible();
    await page.getByLabel("Email address", { exact: true }).press("Enter");
    expect(submissions).toEqual([]);
  });

test("invalid delivery details have focused inline errors and never submit checkout", async ({
  page,
}) => {
  const submissions = await prepareCheckout(page, ["OFFLINE"]);
  await fillCheckout(page);
  const name = page.getByLabel("Full name", { exact: true });
  const phone = page.getByLabel("UAE mobile number", { exact: true });
  await name.fill("   ");
  await phone.fill("+97112");
  await page.getByRole("button", { name: "Place order", exact: true }).click();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(name).toBeFocused();
  await expect(phone).toHaveAttribute("aria-invalid", "true");
  const nameDescription = await name.getAttribute("aria-describedby");
  expect(nameDescription).toBeTruthy();
  const error = page.locator(`[id="${nameDescription!.split(" ").at(-1)}"]`);
  await expect(error).toBeVisible();
  await expect(error).not.toContainText(/invalid_type|too_small|"path"/);
  await expect(page.locator("main")).not.toContainText(/"code":|"minimum":/);
  await expect(page.getByLabel("Email address", { exact: true })).toHaveValue(
    email,
  );
  await expect(
    page.getByLabel("Building, street & apartment", { exact: true }),
  ).toHaveValue("Local payment test building");
  expect(submissions).toEqual([]);

  await name.fill("Local payment test");
  await page.getByRole("button", { name: "Place order", exact: true }).click();
  await expect(phone).toBeFocused();
  await expect(phone).toHaveAttribute("aria-invalid", "true");
  expect(submissions).toEqual([]);
});
