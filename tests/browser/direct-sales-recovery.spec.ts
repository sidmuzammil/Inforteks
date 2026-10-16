import "dotenv/config";
import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { auth } from "../../src/lib/auth";
import { db } from "../../src/lib/db";
import { actorForUser } from "../../src/domains/identity";
import { saveBusinessCustomer } from "../../src/domains/direct-sales";
import { submitEmailSignIn } from "./sign-in";

const key = `direct-recovery-${randomUUID()}`;
const email = `${key}@example.test`,
  password = randomUUID();
let localFixtures = false;
let userId = "",
  customerId = "",
  skuId = "",
  productId = "",
  brandId = "",
  categoryId = "";

test.beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    url.pathname !== "/inforteks" ||
    !["localhost", "127.0.0.1"].includes(url.hostname)
  )
    throw new Error(
      "Direct Sales recovery fixtures require loopback development database.",
    );
  localFixtures = true;
  userId = (
    await auth.api.signUpEmail({
      body: { name: "Direct recovery fixture", email, password },
    })
  ).user.id;
  await db.user.update({ where: { id: userId }, data: { role: "SALES" } });
  brandId = (await db.brand.create({ data: { name: key, slug: key } })).id;
  categoryId = (await db.category.create({ data: { name: key, slug: key } }))
    .id;
  const product = await db.product.create({
    data: {
      name: "Local Direct Sales recovery toner",
      slug: key,
      brandId,
      categoryId,
      status: "PUBLISHED",
      store: false,
      demo: true,
      skus: { create: { code: key, price: 14900, onHand: 8 } },
    },
    include: { skus: true },
  });
  productId = product.id;
  skuId = product.skus[0].id;
  customerId = (
    await saveBusinessCustomer(await actorForUser(userId), {
      company: key,
      address: {
        name: "Local buyer",
        phone: "+971501234567",
        emirate: "Dubai",
        city: "Dubai",
        area: "Test district",
        line1: "Isolated test office",
      },
    })
  ).id;
});

test.afterAll(async () => {
  if (!localFixtures) return;
  const orders = await db.order.findMany({
    where: { salesActorId: userId },
    select: { id: true },
  });
  const orderId = { in: orders.map((order) => order.id) };
  await db.reservation.deleteMany({ where: { orderId } });
  await db.orderItem.deleteMany({ where: { orderId } });
  await db.order.deleteMany({ where: { id: orderId } });
  if (customerId)
    await db.businessCustomer.delete({ where: { id: customerId } });
  if (skuId) await db.sku.delete({ where: { id: skuId } });
  if (productId) await db.product.delete({ where: { id: productId } });
  if (brandId) await db.brand.delete({ where: { id: brandId } });
  if (categoryId) await db.category.delete({ where: { id: categoryId } });
  if (userId) {
    await db.auditEvent.deleteMany({ where: { actorId: userId } });
    await db.idempotency.deleteMany({ where: { actorId: userId } });
    await db.user.delete({ where: { id: userId } });
  }
  await db.$disconnect();
});

async function reviewOrder(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await submitEmailSignIn(page);
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto(`/admin/direct-sales/new-order?customer=${customerId}`);
  await page.getByLabel("Find products", { exact: true }).fill(key);
  await page
    .getByRole("button", { name: "Find products", exact: true })
    .click();
  await page
    .getByRole("button", { name: /Local Direct Sales recovery toner/ })
    .click();
  await page.getByLabel("Internal order note").fill("Original reviewed order");
  await page
    .getByRole("button", { name: "Review order total", exact: true })
    .click();
  await page.getByLabel("I confirmed these items", { exact: false }).check();
}

test("lost Direct Sales response locks review changes and rechecks the exact order through a rate limit", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await reviewOrder(page);
  const requests: { key: string | undefined; body: string | null }[] = [];
  await page.route("**/api/v1/admin/direct-sales/orders", async (route) => {
    requests.push({
      key: route.request().headers()["idempotency-key"],
      body: route.request().postData(),
    });
    if (requests.length === 2) {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({
          error: { message: "Too many attempts. Try again shortly." },
        }),
      });
      return;
    }
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    if (requests.length === 1) await route.abort("failed");
    else await route.fulfill({ response });
  });
  await page
    .getByRole("button", { name: "Confirm direct order", exact: true })
    .click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "couldn’t confirm this direct order",
  );
  expect(await db.order.count({ where: { salesActorId: userId } })).toBe(1);
  for (const name of [
    "Refresh prices & review",
    "Change customer",
    `Remove ${key}`,
    "Find products",
  ])
    await expect(
      page.getByRole("button", { name, exact: true }),
    ).toBeDisabled();
  for (const name of [
    "Internal order note",
    "Coupon code (optional)",
    `Quantity for ${key}`,
  ])
    await expect(page.getByLabel(name)).toBeDisabled();
  await expect(
    page.getByLabel("I confirmed these items", { exact: false }),
  ).toBeDisabled();
  await expect(page.getByLabel("Internal order note")).toHaveValue(
    "Original reviewed order",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const retry = page.getByRole("button", {
    name: "Check order status",
    exact: true,
  });
  await retry.focus();
  await expect(retry).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(retry).toBeEnabled();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "couldn’t confirm this direct order",
  );
  await expect(
    page.getByRole("button", { name: "Refresh prices & review", exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel("Internal order note")).toBeDisabled();
  await retry.click();
  await expect(page).toHaveURL(/\/admin\/direct-sales\/orders\/[^/]+$/);
  expect(requests).toHaveLength(3);
  expect(requests[0].key).toBeTruthy();
  expect(requests[1]).toEqual(requests[0]);
  expect(requests[2]).toEqual(requests[0]);
  expect(await db.order.count({ where: { salesActorId: userId } })).toBe(1);
  expect(
    (await db.sku.findUniqueOrThrow({ where: { id: skuId } })).reserved,
  ).toBe(1);
  expect(
    await db.idempotency.count({
      where: { actorId: userId, operation: "direct_order.create" },
    }),
  ).toBe(1);
  expect(
    await db.auditEvent.count({
      where: { actorId: userId, operation: "direct_order.create" },
    }),
  ).toBe(1);
});

test("a definitive stale-quote refusal lets staff review corrected details and place one order", async ({
  page,
}) => {
  const before = await db.order.count({ where: { salesActorId: userId } });
  await reviewOrder(page);
  await db.sku.update({ where: { id: skuId }, data: { price: 15000 } });
  await page
    .getByRole("button", { name: "Confirm direct order", exact: true })
    .click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "quote changed",
  );
  expect(await db.order.count({ where: { salesActorId: userId } })).toBe(
    before,
  );
  await expect(page.getByLabel("Internal order note")).toBeEnabled();
  await page
    .getByLabel("Internal order note")
    .fill("Freshly reviewed corrected order");
  await page
    .getByRole("button", { name: "Review order total", exact: true })
    .click();
  await page.getByLabel("I confirmed these items", { exact: false }).check();
  await page
    .getByRole("button", { name: "Confirm direct order", exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/direct-sales\/orders\/[^/]+$/);
  expect(await db.order.count({ where: { salesActorId: userId } })).toBe(
    before + 1,
  );
  const order = await db.order.findFirstOrThrow({
    where: {
      salesActorId: userId,
      salesNote: "Freshly reviewed corrected order",
    },
    include: { items: true },
  });
  expect(order.items[0]).toMatchObject({ quantity: 1, unitPrice: 15000 });
});
