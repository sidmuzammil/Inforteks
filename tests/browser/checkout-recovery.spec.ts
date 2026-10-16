import "dotenv/config";
import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { db } from "../../src/lib/db";
import { hash } from "../../src/domains/identity";

const key = `checkout-recovery-${randomUUID()}`;
const email = `${key}@example.test`;
const orderEmails = new Set([email]);
let productId = "",
  categoryId = "",
  brandId = "",
  skuId = "";
const carts = new Set<string>();
let localFixtures = false;
test.beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    url.pathname !== "/inforteks" ||
    !["127.0.0.1", "localhost"].includes(url.hostname)
  )
    throw new Error(
      "Checkout recovery fixtures require the local development database.",
    );
  localFixtures = true;
  brandId = (await db.brand.create({ data: { name: key, slug: key } })).id;
  categoryId = (await db.category.create({ data: { name: key, slug: key } }))
    .id;
  const product = await db.product.create({
    data: {
      name: "Local interrupted checkout fixture",
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
});
test.afterAll(async () => {
  if (!localFixtures) return;
  const orders = await db.order.findMany({
    where: { email: { in: [...orderEmails] } },
    select: { id: true },
  });
  const ids = orders.map((order) => order.id);
  for (const id of ids)
    await db.job.deleteMany({
      where: { payload: { path: ["orderId"], equals: id } },
    });
  await db.auditEvent.deleteMany({ where: { targetId: { in: ids } } });
  await db.reservation.deleteMany({ where: { orderId: { in: ids } } });
  await db.payment.deleteMany({ where: { orderId: { in: ids } } });
  await db.orderItem.deleteMany({ where: { orderId: { in: ids } } });
  await db.order.deleteMany({ where: { id: { in: ids } } });
  await db.idempotency.deleteMany({ where: { actorId: { in: [...carts] } } });
  await db.cart.deleteMany({ where: { id: { in: [...carts] } } });
  if (productId) await db.sku.deleteMany({ where: { productId } });
  if (productId) await db.product.delete({ where: { id: productId } });
  if (categoryId) await db.category.delete({ where: { id: categoryId } });
  if (brandId) await db.brand.delete({ where: { id: brandId } });
  await db.$disconnect();
});
async function prepareCart(page: Page) {
  const response = await page.request.patch("/api/v1/storefront/carts", {
    headers: { Origin: "http://localhost:3000" },
    data: { skuId, quantity: 1 },
  });
  expect(response.status()).toBe(200);
  const cart = await page.request.get("/api/v1/storefront/carts");
  carts.add((await cart.json()).data.id);
}
async function fillCheckout(page: Page, orderEmail = email) {
  await page.getByLabel("Email address", { exact: true }).fill(orderEmail);
  await page
    .getByLabel("Full name", { exact: true })
    .fill("Local recovery test");
  await page.getByLabel("UAE mobile number").fill("+971501234567");
  await page.getByLabel("City", { exact: true }).fill("Dubai");
  await page
    .getByLabel("Area / neighbourhood", { exact: true })
    .fill("Local area");
  await page
    .getByLabel("Building, street & apartment")
    .fill("Local test building");
  await page.locator('#checkout-form input[type="checkbox"]').check();
}

test("mobile cart recovers from an interrupted read without losing its saved items", async ({
  page,
}) => {
  await prepareCart(page);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.route("**/api/v1/storefront/carts", async (route) => {
    if (route.request().method() === "GET") await route.abort("failed");
    else await route.continue();
  });
  await page.goto("/cart");
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "connection was interrupted",
  );
  const retry = page.getByRole("button", { name: "Retry loading cart" });
  await retry.focus();
  await expect(retry).toBeFocused();
  await page.unroute("**/api/v1/storefront/carts");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Your shopping cart" }),
  ).toBeVisible();
  await expect(page.locator(".cart-item")).toContainText(
    "Local interrupted checkout fixture",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator(".summary-line.total")).toBeVisible();
  await page.route("**/api/v1/storefront/carts", async (route) => {
    if (route.request().method() === "GET") await route.abort("failed");
    else await route.continue();
  });
  await page
    .getByRole("button", {
      name: "Increase Local interrupted checkout fixture quantity",
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry loading cart" }),
  ).toBeVisible();
  await expect(page.locator(".summary-line.total")).toHaveCount(0);
  await page.unroute("**/api/v1/storefront/carts");
  await page.getByRole("button", { name: "Retry loading cart" }).click();
  await expect(page.locator(".cart-item .quantity span")).toHaveText("2");
  await expect(page.locator(".summary-line.total")).toBeVisible();
});

test("changed delivery invalidates the old total and failed recalculation can be retried", async ({
  page,
}) => {
  await prepareCart(page);
  await page.goto("/checkout");
  const submit = page.getByRole("button", { name: "Place order", exact: true });
  await expect(submit).toBeEnabled();
  await fillCheckout(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/storefront/carts/quote", async (route) => {
    await gate;
    await route.fulfill({
      status: 503,
      contentType: "text/html",
      body: "Temporarily unavailable",
    });
  });
  await page.getByLabel("Deliver to", { exact: true }).selectOption("Sharjah");
  await expect(submit).toBeDisabled();
  await expect(page.locator(".summary-line.total")).toHaveCount(0);
  release();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "incomplete response",
  );
  await page.unroute("**/api/v1/storefront/carts/quote");
  await page.getByRole("button", { name: "Retry order total" }).click();
  await expect(submit).toBeEnabled();
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue(
    "Local recovery test",
  );
  await expect(page.getByLabel("Deliver to", { exact: true })).toHaveValue(
    "Sharjah",
  );
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    accessibility.violations.filter((issue) =>
      ["serious", "critical"].includes(issue.impact ?? ""),
    ),
  ).toEqual([]);
});

test("lost checkout response rechecks the exact order once and preserves its stock reservation", async ({
  page,
}) => {
  await prepareCart(page);
  await page.setViewportSize({ width: 390, height: 950 });
  await page.goto("/checkout");
  await fillCheckout(page);
  const requests: { key: string | undefined; body: string | null }[] = [];
  await page.route("**/api/v1/storefront/checkout", async (route) => {
    requests.push({
      key: route.request().headers()["idempotency-key"],
      body: route.request().postData(),
    });
    if (requests.length === 2) {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({
          error: { message: "Try again after the retry window." },
        }),
      });
      return;
    }
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    if (requests.length === 1) {
      // route.fetch can store response cookies even though the browser never
      // receives the response. Remove that artifact to test real token recovery.
      await page.context().clearCookies({ name: /^ift-order-/ });
      await route.abort("failed");
    } else await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "Place order", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "couldn’t confirm your order",
  );
  await expect(
    page.getByLabel("Email address", { exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel("Promo code", { exact: true })).toBeDisabled();
  expect(await db.order.count({ where: { email } })).toBe(1);
  expect(
    (await page.context().cookies()).filter((cookie) =>
      cookie.name.startsWith("ift-order-"),
    ),
  ).toEqual([]);
  await page
    .getByRole("button", { name: "Check order status", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Check order status", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByLabel("Email address", { exact: true }),
  ).toBeDisabled();
  expect(await db.order.count({ where: { email } })).toBe(1);
  await page
    .getByRole("button", { name: "Check order status", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your order is in." }),
  ).toBeVisible();
  expect(requests).toHaveLength(3);
  expect(requests[0].key).toBeTruthy();
  expect(requests[1]).toEqual(requests[0]);
  expect(requests[2]).toEqual(requests[0]);
  expect(await db.order.count({ where: { email } })).toBe(1);
  expect(
    (await db.sku.findUniqueOrThrow({ where: { id: skuId } })).reserved,
  ).toBe(1);
});

for (const responseShape of [
  "empty",
  "missing-id",
  "blank-reference",
  "surrogate-reference",
] as const)
  test(`incomplete committed checkout response (${responseShape}) retains its exact recovery request and guest access`, async ({
    page,
  }) => {
    const orderEmail = `${responseShape}-${email}`;
    orderEmails.add(orderEmail);
    const reservedBefore = (
      await db.sku.findUniqueOrThrow({ where: { id: skuId } })
    ).reserved;
    await prepareCart(page);
    await page.goto("/checkout");
    await fillCheckout(page, orderEmail);
    const requests: { key: string | undefined; body: string | null }[] = [];
    const responseIds: string[] = [];
    await page.route("**/api/v1/storefront/checkout", async (route) => {
      requests.push({
        key: route.request().headers()["idempotency-key"],
        body: route.request().postData(),
      });
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      const confirmed = (await response.json()).data;
      responseIds.push(confirmed.id);
      if (requests.length === 1) {
        // The order really committed. Discard route.fetch's cookie artifact too,
        // so retry must restore guest access through the real response headers.
        await page.context().clearCookies({ name: /^ift-order-/ });
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            data:
              responseShape === "empty"
                ? {}
                : responseShape === "missing-id"
                  ? { reference: confirmed.reference }
                  : {
                      id: confirmed.id,
                      reference:
                        responseShape === "blank-reference" ? " " : "\ud800",
                    },
          }),
        });
      } else await route.fulfill({ response });
    });
    await page
      .getByRole("button", { name: "Place order", exact: true })
      .click();
    await expect
      .poll(() => db.order.count({ where: { email: orderEmail } }))
      .toBe(1);
    await expect(page.locator("main").getByRole("alert")).toContainText(
      "couldn’t confirm your order",
    );
    await expect(page).toHaveURL(/\/checkout$/);
    await expect(
      page.getByLabel("Email address", { exact: true }),
    ).toBeDisabled();
    await expect(page.getByLabel("Promo code", { exact: true })).toBeDisabled();
    expect(
      (await page.context().cookies()).filter((cookie) =>
        cookie.name.startsWith("ift-order-"),
      ),
    ).toEqual([]);
    const order = await db.order.findFirstOrThrow({
      where: { email: orderEmail },
      select: { id: true, reference: true, guestTokenHash: true },
    });
    await page
      .getByRole("button", { name: "Check order status", exact: true })
      .click();
    await expect(page).toHaveURL(`/order-confirmation/${order.reference}`);
    await expect(
      page.getByRole("heading", { name: "Your order is in." }),
    ).toBeVisible();
    expect(requests).toHaveLength(2);
    expect(requests[0].key).toBeTruthy();
    expect(requests[1]).toEqual(requests[0]);
    expect(responseIds).toEqual([order.id, order.id]);
    expect(await db.order.count({ where: { email: orderEmail } })).toBe(1);
    expect(
      await db.idempotency.count({
        where: { operation: "checkout", key: requests[0].key },
      }),
    ).toBe(1);
    expect(
      await db.reservation.findMany({
        where: { orderId: order.id },
        select: { skuId: true, quantity: true },
      }),
    ).toEqual([{ skuId, quantity: 1 }]);
    expect(
      (await db.sku.findUniqueOrThrow({ where: { id: skuId } })).reserved,
    ).toBe(reservedBefore + 1);
    const cookie = (await page.context().cookies()).find(
      (value) => value.name === `ift-order-${order.id}`,
    );
    expect(cookie).toBeDefined();
    expect(cookie?.httpOnly).toBe(true);
    expect(hash(cookie!.value)).toBe(order.guestTokenHash);
  });
