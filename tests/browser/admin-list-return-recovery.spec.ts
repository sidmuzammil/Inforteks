import "dotenv/config";
import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { auth } from "../../src/lib/auth";
import { db } from "../../src/lib/db";
import { submitEmailSignIn } from "./sign-in";

const key = `admin-recovery-${randomUUID()}`;
const search = `${key} & matching products`;
const email = `${key}@example.test`;
const password = randomUUID();
let localFixtures = false;
let userId = "",
  brandId = "",
  categoryId = "",
  skuId = "",
  orderId = "",
  itemId = "";
const productIds: string[] = [];

test.beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    url.pathname !== "/inforteks" ||
    !["127.0.0.1", "localhost"].includes(url.hostname)
  )
    throw new Error(
      "Admin recovery fixtures require the local development database.",
    );
  localFixtures = true;
  userId = (
    await auth.api.signUpEmail({
      body: { name: "Local admin recovery", email, password },
    })
  ).user.id;
  await db.user.update({ where: { id: userId }, data: { role: "MANAGER" } });
  brandId = (await db.brand.create({ data: { name: key, slug: key } })).id;
  categoryId = (await db.category.create({ data: { name: key, slug: key } }))
    .id;
  for (let i = 0; i < 32; i++) {
    const product = await db.product.create({
      data: {
        name: i < 31 ? `${search} ${i}` : `Unrelated ${key}`,
        slug: `${key}-${i}`,
        brandId,
        categoryId,
        demo: true,
        updatedAt: new Date(Date.now() - i * 1000),
      },
    });
    productIds.push(product.id);
  }
  skuId = (
    await db.sku.create({
      data: { productId: productIds[0], code: key, price: 10000, onHand: 8 },
    })
  ).id;
  const order = await db.order.create({
    data: {
      reference: key,
      guestTokenHash: randomUUID(),
      email,
      address: {},
      status: "COMPLETED",
      fulfillmentStatus: "FULFILLED",
      paymentMethod: "OFFLINE",
      subtotal: 40000,
      discount: 0,
      tax: 0,
      shipping: 0,
      total: 40000,
      shippingSnapshot: {},
      termsSnapshot: {},
      demo: true,
      items: {
        create: {
          skuId,
          snapshot: { name: "Local return fixture", sku: key, options: {} },
          quantity: 4,
          fulfilled: 4,
          unitPrice: 10000,
          total: 40000,
        },
      },
    },
    include: { items: true },
  });
  orderId = order.id;
  itemId = order.items[0].id;
});

test.beforeEach(async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await submitEmailSignIn(page);
  await expect(page).toHaveURL(/\/admin$/);
});

test.afterAll(async () => {
  if (!localFixtures) return;
  if (userId) await db.auditEvent.deleteMany({ where: { actorId: userId } });
  if (orderId) {
    await db.returnRequest.deleteMany({ where: { orderId } });
    await db.orderItem.deleteMany({ where: { orderId } });
    await db.order.delete({ where: { id: orderId } });
  }
  if (skuId) await db.sku.delete({ where: { id: skuId } });
  await db.product.deleteMany({ where: { id: { in: productIds } } });
  if (brandId) await db.brand.delete({ where: { id: brandId } });
  if (categoryId) await db.category.delete({ where: { id: categoryId } });
  if (userId) await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
});

test("product search stays applied across next and previous pages", async ({
  page,
}) => {
  await page.goto(`/admin/products?${new URLSearchParams({ q: search })}`);
  const rows = page.locator(".admin-table tbody tr");
  await expect(rows).toHaveCount(30);
  const firstPage = await rows.locator("td:first-child").allTextContents();
  expect(firstPage.every((name) => name.includes(search))).toBe(true);
  await page.getByRole("link", { name: "Next", exact: true }).click();
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get("q") === search &&
      url.searchParams.get("page") === "2",
  );
  await expect(
    page.getByRole("textbox", { name: "Search products" }),
  ).toHaveValue(search);
  await expect(rows).toHaveCount(1);
  const lastProduct = await rows.locator("td:first-child").textContent();
  expect(lastProduct).toContain(search);
  expect(firstPage).not.toContain(lastProduct);
  await expect(
    page.getByRole("link", { name: "Next", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Previous", exact: true }).click();
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get("q") === search &&
      url.searchParams.get("page") === "1",
  );
  await expect(rows).toHaveCount(30);
  expect(await rows.locator("td:first-child").allTextContents()).toEqual(
    firstPage,
  );
});

test("a product search with no matches explains the filter and offers clear search", async ({
  page,
}) => {
  await page.goto(
    `/admin/products?${new URLSearchParams({ q: `${key}-missing` })}`,
  );
  await expect(
    page.getByRole("heading", { name: "No matching products." }),
  ).toBeVisible();
  await expect(page.locator("main")).not.toContainText("No records yet");
  await page.getByRole("link", { name: "Clear search", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/products$/);
  await expect(page.locator(".admin-table tbody tr")).toHaveCount(30);
  await expect(
    page.getByRole("textbox", { name: "Search products" }),
  ).toHaveValue("");
});

for (const decision of ["APPROVED", "REJECTED"] as const) {
  test(`a lost staff return ${decision.toLowerCase()} response reads the committed status without replay`, async ({
    page,
  }) => {
    const request = await db.returnRequest.create({
      data: {
        orderId,
        reason: "Local interrupted review",
        items: [{ itemId, quantity: 1 }],
      },
    });
    await page.goto(`/admin/returns/${request.id}`);
    await expect(page.locator(".admin-page-heading")).toContainText(
      "REQUESTED",
    );
    let mutations = 0;
    await page.route(`**/api/v1/admin/returns/${request.id}`, async (route) => {
      expect(route.request().method()).toBe("PATCH");
      mutations++;
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      expect(
        await db.returnRequest.findUniqueOrThrow({ where: { id: request.id } }),
      ).toMatchObject({ status: decision, version: 2 });
      await route.abort("failed");
    });
    await page
      .getByRole("button", {
        name: decision === "APPROVED" ? "Approve request" : "Reject request",
        exact: true,
      })
      .click();
    await expect(page.locator(".admin-page-heading")).toContainText(decision);
    await expect(
      page.getByRole("button", { name: "Approve request", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Reject request", exact: true }),
    ).toHaveCount(0);
    expect(mutations).toBe(1);
    expect(
      await db.auditEvent.count({
        where: {
          actorId: userId,
          targetId: request.id,
          operation: "return.review",
        },
      }),
    ).toBe(1);
    expect(
      await db.sku.findUniqueOrThrow({ where: { id: skuId } }),
    ).toMatchObject({ onHand: 8 });
    expect(
      await db.orderItem.findUniqueOrThrow({ where: { id: itemId } }),
    ).toMatchObject({ returned: 0 });
    expect(await db.inventoryMovement.count({ where: { skuId } })).toBe(0);
  });
}

test("an uncommitted staff return decision stays requested and does not replay", async ({
  page,
}) => {
  const request = await db.returnRequest.create({
    data: {
      orderId,
      reason: "Local uncommitted review",
      items: [{ itemId, quantity: 1 }],
    },
  });
  await page.goto(`/admin/returns/${request.id}`);
  let mutations = 0;
  await page.route(`**/api/v1/admin/returns/${request.id}`, async (route) => {
    mutations++;
    await route.abort("failed");
  });
  const refreshed = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/admin/returns/${request.id}` &&
      response.request().method() === "GET" &&
      response.request().headers().rsc === "1",
  );
  await page
    .getByRole("button", { name: "Approve request", exact: true })
    .click();
  expect((await refreshed).status()).toBe(200);
  await expect(page.locator(".admin-page-heading")).toContainText("REQUESTED");
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "connection was interrupted",
  );
  await expect(
    page.getByRole("button", { name: "Approve request", exact: true }),
  ).toBeEnabled();
  expect(mutations).toBe(1);
  expect(
    await db.returnRequest.findUniqueOrThrow({ where: { id: request.id } }),
  ).toMatchObject({ status: "REQUESTED", version: 1 });
  expect(
    await db.auditEvent.count({
      where: { targetId: request.id, operation: "return.review" },
    }),
  ).toBe(0);
});
