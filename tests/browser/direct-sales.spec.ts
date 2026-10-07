import { submitEmailSignIn } from "./sign-in";
import "dotenv/config";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { auth } from "../../src/lib/auth";
import { db } from "../../src/lib/db";
const key = `office-browser-${Date.now()}`;
const email = `${key}@example.test`,
  password = randomUUID();
let userId = "",
  skuId = "",
  categoryId = "",
  brandId = "",
  onlineOrderId = "";
test.beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    url.pathname !== "/inforteks" ||
    !["localhost", "127.0.0.1"].includes(url.hostname)
  )
    throw new Error("Local development fixtures only.");
  userId = (
    await auth.api.signUpEmail({
      body: { name: "Office sales test", email, password },
    })
  ).user.id;
  await db.user.update({ where: { id: userId }, data: { role: "SALES" } });
  categoryId = (await db.category.create({ data: { name: key, slug: key } }))
    .id;
  brandId = (await db.brand.create({ data: { name: key, slug: key } })).id;
  const product = await db.product.create({
    data: {
      name: "Office verification toner",
      slug: key,
      brandId,
      categoryId,
      status: "PUBLISHED",
      skus: { create: { code: key, price: 14900, onHand: 20 } },
    },
    include: { skus: true },
  });
  skuId = product.skus[0].id;
  const online = await db.order.create({
    data: {
      reference: `${key}-online`,
      guestTokenHash: randomUUID(),
      email,
      address: {
        name: "Online buyer",
        phone: "+971501234567",
        emirate: "Dubai",
        city: "Dubai",
        area: "Business Bay",
        line1: "Test office",
      },
      paymentMethod: "bank_transfer",
      subtotal: 14900,
      discount: 0,
      tax: 745,
      shipping: 0,
      total: 15645,
      shippingSnapshot: {},
      termsSnapshot: {},
      demo: true,
      items: {
        create: {
          skuId,
          snapshot: { name: product.name, sku: key, options: {} },
          quantity: 1,
          unitPrice: 14900,
          total: 14900,
        },
      },
    },
  });
  onlineOrderId = online.id;
});
test.afterAll(async () => {
  const orders = await db.order.findMany({
    where: { OR: [{ salesActorId: userId }, { id: onlineOrderId }] },
    select: { id: true },
  });
  const orderId = { in: orders.map((o) => o.id) };
  await db.reservation.deleteMany({ where: { orderId } });
  await db.orderItem.deleteMany({ where: { orderId } });
  await db.order.deleteMany({ where: { id: orderId } });
  await db.salesVisit.deleteMany({ where: { actorId: userId } });
  await db.businessCustomer.deleteMany({ where: { createdBy: userId } });
  await db.sku.deleteMany({ where: { id: skuId } });
  await db.product.deleteMany({ where: { brandId } });
  await db.brand.deleteMany({ where: { id: brandId } });
  await db.category.deleteMany({ where: { id: categoryId } });
  await db.auditEvent.deleteMany({ where: { actorId: userId } });
  await db.idempotency.deleteMany({ where: { actorId: userId } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.$disconnect();
});
test.beforeEach(async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await submitEmailSignIn(page);
  await expect(page).toHaveURL(/\/admin$/);
});
test("sales staff records an office visit and takes four toners through review and confirmation", async ({
  page,
}) => {
  await expect(
    page.getByRole("link", { name: "Open Direct Sales" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Open Direct Sales" }).click();
  await page
    .getByRole("link", { name: "Office customers Contact details" })
    .click();
  await page.getByRole("link", { name: "Add office customer" }).click();
  await page.getByLabel("Office / company name").fill(`${key} office`);
  await page.getByLabel("Full name", { exact: true }).fill("Office buyer");
  await page
    .getByLabel("UAE mobile number", { exact: true })
    .fill("+971501234567");
  await page.getByLabel("City", { exact: true }).fill("Dubai");
  await page
    .getByLabel("Area / neighbourhood", { exact: true })
    .fill("Business Bay");
  await page
    .getByLabel("Building, street & apartment", { exact: true })
    .fill("Test Tower, floor 5, office 501");
  await page.getByRole("button", { name: "Save office customer" }).click();
  await expect(
    page.getByRole("heading", { name: `${key} office`, exact: true }),
  ).toBeVisible();
  await page.getByLabel("Visit outcome").selectOption("INTERESTED");
  await page
    .getByLabel("Visit notes")
    .fill("Customer needs four toners during this visit.");
  await page
    .getByLabel("Next follow-up", { exact: false })
    .fill(
      new Date(Date.now() + 2 * 86400000 + 4 * 3600000)
        .toISOString()
        .slice(0, 16),
    );
  await page.getByRole("button", { name: "Record visit" }).click();
  await expect(page.getByRole("status")).toContainText("Visit recorded");
  await page
    .getByRole("link", { name: "Take an order", exact: true })
    .last()
    .click();
  await page.getByLabel("Find products", { exact: true }).fill(key);
  await page
    .getByRole("button", { name: "Find products", exact: true })
    .click();
  await page.getByRole("button", { name: /Office verification toner/ }).click();
  await page.getByLabel(`Quantity for ${key}`).fill("4");
  await page
    .getByLabel("Internal order note")
    .fill("Customer confirmed four units in person.");
  await page.getByRole("button", { name: "Review order total" }).click();
  await expect(page.getByText("Ready for review")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm direct order" }),
  ).toBeDisabled();
  await page.getByLabel("I confirmed these items", { exact: false }).check();
  await page.screenshot({
    path: ".data/direct-order-desktop.png",
    fullPage: true,
    caret: "initial",
  });
  await page.getByRole("button", { name: "Confirm direct order" }).click();
  await expect(page).toHaveURL(/\/admin\/direct-sales\/orders\/[^/]+$/);
  await expect(
    page.getByRole("navigation", { name: "Direct Sales navigation" }),
  ).toBeVisible();
  await expect(
    page.getByText("Customer confirmed four units in person."),
  ).toBeVisible();
  await expect(page.getByText("PENDING", { exact: true })).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(
    page.getByText("Customer confirmed four units in person."),
  ).not.toBeVisible();
  await page.emulateMedia({ media: "screen" });
  await expect(
    page.getByRole("heading", { name: "Record verified payment" }),
  ).toHaveCount(0);
  const order = await db.order.findFirstOrThrow({
    where: { salesActorId: userId },
    include: { items: true },
  });
  expect(order.channel).toBe("DIRECT");
  expect(order.items[0].quantity).toBe(4);
  expect(order.userId).toBeNull();
  expect(
    (await db.sku.findUniqueOrThrow({ where: { id: skuId } })).reserved,
  ).toBe(4);
  await page.goto(
    "/admin/direct-sales/orders?q=" + encodeURIComponent(order.reference),
  );
  await expect(
    page.getByRole("link", { name: order.reference, exact: true }),
  ).toBeVisible();
  await page.goto("/admin/direct-sales/follow-ups");
  await page.getByRole("button", { name: "Mark complete" }).click();
  await expect(
    page.getByRole("heading", { name: "You’re up to date" }),
  ).toBeVisible();
});
test("mobile navigation remains usable and sales cannot open website orders or settings", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Workspace menu" }).click();
  await expect(
    page.getByRole("navigation", { name: "Admin workspace" }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Admin workspace" })
    .getByRole("link", { name: "Direct Sales", exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/direct-sales$/);
  await expect(
    page.getByRole("button", { name: "Workspace menu" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Take an order", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Take an order", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add office customer", exact: true })
    .click();
  await page.screenshot({
    path: ".data/direct-order-mobile.png",
    fullPage: true,
    caret: "initial",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("link", { name: "Online Store", exact: true }),
  ).toHaveCount(0);
  await page.goto(`/admin/online-store/orders/${onlineOrderId}`);
  await expect(
    page.getByRole("heading", { name: "Permission required." }),
  ).toBeVisible();
  await page.goto(`/admin/direct-sales/orders/${onlineOrderId}`);
  await expect(
    page.getByRole("heading", { name: "Permission required." }),
  ).toBeVisible();
  await page.goto("/admin/online-store/orders");
  await expect(
    page.getByRole("heading", { name: "Permission required." }),
  ).toBeVisible();
  await page.goto("/admin/settings");
  await expect(
    page.getByRole("heading", { name: "Permission required." }),
  ).toBeVisible();
});

test("Owner sees both sales channels and can find shared administration pages", async ({
  page,
}) => {
  await db.user.update({ where: { id: userId }, data: { role: "OWNER" } });
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Your business. One workspace." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open Direct Sales" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open Online Store" }),
  ).toBeVisible();
  await page.screenshot({
    path: ".data/admin-channels-desktop.png",
    fullPage: true,
    caret: "initial",
  });
  const appNav = page.getByRole("navigation", {
    name: "Admin workspace",
    exact: true,
  });
  await expect(
    appNav.getByRole("link", { name: "Sales", exact: true }),
  ).toHaveCount(0);
  for (const width of [1440, 1260, 1024]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(
      appNav.getByRole("link", { name: "Direct Sales", exact: true }),
    ).toBeVisible();
    await expect(
      appNav.getByRole("link", { name: "Online Store", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const a11y = await new AxeBuilder({ page })
    .include(".erp-shell")
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(a11y.violations).toEqual([]);
  await page.getByRole("link", { name: "Open Online Store" }).click();
  await page
    .getByRole("navigation", { name: "Online Store navigation" })
    .getByRole("link", { name: "Online orders", exact: true })
    .click();
  await page.getByLabel("Find an order").fill(`${key}-online`);
  await page.getByRole("button", { name: "Apply filters" }).click();
  await page.getByRole("link", { name: `${key}-online`, exact: true }).click();
  await expect(page).toHaveURL(`/admin/online-store/orders/${onlineOrderId}`);
  await expect(
    page.getByRole("navigation", { name: "Online Store navigation" }),
  ).toBeVisible();
  await page.goto(`/admin/orders/${onlineOrderId}`);
  await expect(page).toHaveURL(`/admin/online-store/orders/${onlineOrderId}`);
  const wrongChannel = await page.goto(
    `/admin/direct-sales/orders/${onlineOrderId}`,
  );
  // App Router can stream a not-found boundary with HTTP 200; assert its UI.
  expect(wrongChannel?.ok() || wrongChannel?.status() === 404).toBe(true);
  await expect(
    page.getByRole("heading", { name: "Let’s find your way back." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: `${key}-online`, exact: true }),
  ).toHaveCount(0);
  await page.goto("/admin/online-store");
  await page
    .getByRole("navigation", { name: "Online Store navigation" })
    .getByRole("link", { name: "Homepage & banners" })
    .click();
  await expect(
    page.getByRole("navigation", { name: "Online Store navigation" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Homepage sections" }),
  ).toBeVisible();
  await page.getByLabel("Find an admin page").fill("staff");
  await page
    .getByRole("navigation", { name: "Page search results" })
    .getByRole("link", { name: "Staff & access" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Staff & access" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 320, height: 780 });
  await page.getByRole("button", { name: "Workspace menu" }).click();
  await page
    .getByRole("navigation", { name: "Admin workspace" })
    .getByRole("link", { name: "Direct Sales", exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/direct-sales$/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".data/admin-channel-mobile.png",
    fullPage: true,
    caret: "initial",
  });
});
