import "dotenv/config";
import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { auth } from "../../src/lib/auth";
import { db } from "../../src/lib/db";
import { submitEmailSignIn } from "./sign-in";

const fixture = `customer-return-recovery-${randomUUID()}`;
const email = `${fixture}@example.test`;
const password = randomUUID();
let userId = "",
  orderId = "",
  skuId = "",
  productId = "",
  categoryId = "",
  brandId = "";
const orderIds: string[] = [];
let localFixtures = false;
test.beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    url.pathname !== "/inforteks" ||
    !["127.0.0.1", "localhost"].includes(url.hostname)
  )
    throw new Error(
      "Return recovery fixtures require the local development database.",
    );
  localFixtures = true;
  userId = (
    await auth.api.signUpEmail({
      body: { name: "Local return recovery", email, password },
    })
  ).user.id;
  categoryId = (
    await db.category.create({ data: { name: fixture, slug: fixture } })
  ).id;
  brandId = (await db.brand.create({ data: { name: fixture, slug: fixture } }))
    .id;
  const product = await db.product.create({
    data: {
      name: "Local return recovery item",
      slug: fixture,
      categoryId,
      brandId,
      demo: true,
      skus: { create: { code: fixture, price: 10000 } },
    },
    include: { skus: true },
  });
  productId = product.id;
  skuId = product.skus[0].id;
});
test.beforeEach(async ({ page }) => {
  const order = await db.order.create({
    data: {
      reference: `${fixture}-${randomUUID()}`,
      userId,
      guestTokenHash: randomUUID(),
      email,
      address: {
        name: "Local return recovery",
        phone: "+971501234567",
        emirate: "Dubai",
        city: "Dubai",
        area: "Test area",
        line1: "Local test building",
      },
      status: "FULFILLED",
      fulfillmentStatus: "FULFILLED",
      paymentMethod: "bank_transfer",
      subtotal: 20000,
      discount: 0,
      tax: 0,
      shipping: 0,
      total: 20000,
      shippingSnapshot: {},
      termsSnapshot: {},
      demo: true,
      items: {
        create: {
          skuId,
          snapshot: {
            name: "Local return recovery item",
            sku: fixture,
            options: {},
          },
          quantity: 2,
          fulfilled: 2,
          unitPrice: 10000,
          total: 20000,
        },
      },
    },
  });
  orderId = order.id;
  orderIds.push(orderId);
  await page.goto("/login");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await submitEmailSignIn(page, "Sign in");
  await page.goto(`/account/orders/${orderId}`);
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Local test item arrived damaged.");
});
test.afterAll(async () => {
  if (!localFixtures) return;
  await db.returnRequest.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.order.deleteMany({ where: { id: { in: orderIds } } });
  if (userId) {
    await db.idempotency.deleteMany({ where: { actorId: userId } });
    await db.user.deleteMany({ where: { id: userId } });
  }
  if (productId) {
    await db.sku.deleteMany({ where: { productId } });
    await db.product.deleteMany({ where: { id: productId } });
  }
  if (categoryId) await db.category.deleteMany({ where: { id: categoryId } });
  if (brandId) await db.brand.deleteMany({ where: { id: brandId } });
  await db.$disconnect();
});

for (const interruption of ["lost", "incomplete"] as const)
  test(`recovers one return when its committed response is ${interruption}, preserving the request after a rate-limited check`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    const requests: { key?: string; body: string | null }[] = [];
    const returnedIds: string[] = [];
    await page.route("**/api/v1/account/returns", async (route) => {
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
      returnedIds.push((await response.json()).data.id);
      if (requests.length === 1) {
        if (interruption === "lost") await route.abort("failed");
        else
          await route.fulfill({
            status: 201,
            contentType: "application/json",
            body: JSON.stringify({ data: {} }),
          });
      } else await route.fulfill({ response });
    });
    await page
      .getByRole("button", { name: "Submit request", exact: true })
      .click();
    await expect(page.locator("main").getByRole("alert")).toContainText(
      "couldn’t confirm your return request",
    );
    await expect(page.getByLabel("Quantity", { exact: true })).toBeDisabled();
    await expect(page.getByLabel("Reason", { exact: true })).toBeDisabled();
    await expect(
      page.getByRole("link", { name: "return requests", exact: true }),
    ).toHaveAttribute("href", "/account/returns");
    expect(await db.returnRequest.count({ where: { orderId } })).toBe(1);
    const retry = page.getByRole("button", {
      name: "Check return status",
      exact: true,
    });
    await retry.focus();
    await expect(retry).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("main").getByRole("alert")).toContainText(
      "retry window",
    );
    await expect(page.getByLabel("Quantity", { exact: true })).toBeDisabled();
    await expect(page.getByLabel("Reason", { exact: true })).toBeDisabled();
    expect(await db.returnRequest.count({ where: { orderId } })).toBe(1);
    if (interruption === "lost") {
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const accessibility = await new AxeBuilder({ page })
        .include("main")
        .analyze();
      expect(accessibility.violations).toEqual([]);
    }
    await retry.click();
    await expect(page.getByRole("status")).toContainText(
      "Return request saved",
    );
    await expect(
      page.getByRole("button", { name: "Submit request", exact: true }),
    ).toHaveCount(0);
    expect(requests).toHaveLength(3);
    expect(requests[0].key).toBeTruthy();
    expect(requests[1]).toEqual(requests[0]);
    expect(requests[2]).toEqual(requests[0]);
    expect(returnedIds).toHaveLength(2);
    expect(returnedIds[1]).toBe(returnedIds[0]);
    expect(await db.returnRequest.count({ where: { orderId } })).toBe(1);
    expect(
      await db.idempotency.count({
        where: { actorId: userId, key: requests[0].key },
      }),
    ).toBe(1);
  });

test("allows correcting a definitively rejected quantity before a fresh submission", async ({
  page,
}) => {
  const requests: { key?: string; body: string | null; status: number }[] = [];
  await page.route("**/api/v1/account/returns", async (route) => {
    const response = await route.fetch();
    requests.push({
      key: route.request().headers()["idempotency-key"],
      body: route.request().postData(),
      status: response.status(),
    });
    await route.fulfill({ response });
  });
  await page.getByLabel("Quantity", { exact: true }).fill("3");
  await page
    .getByRole("button", { name: "Submit request", exact: true })
    .click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Quantity exceeds the remaining returnable items",
  );
  await expect(page.getByLabel("Quantity", { exact: true })).toBeEnabled();
  await expect(page.getByLabel("Reason", { exact: true })).toHaveValue(
    "Local test item arrived damaged.",
  );
  expect(await db.returnRequest.count({ where: { orderId } })).toBe(0);
  await page.getByLabel("Quantity", { exact: true }).fill("1");
  await page
    .getByRole("button", { name: "Submit request", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Return request saved");
  expect(requests.map((request) => request.status)).toEqual([422, 201]);
  expect(requests[0].key).toBeTruthy();
  expect(requests[1].key).toBeTruthy();
  expect(requests[0].key).not.toBe(requests[1].key);
  expect(await db.returnRequest.count({ where: { orderId } })).toBe(1);
});
