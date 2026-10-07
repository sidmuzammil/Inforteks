import { submitEmailSignIn } from "./sign-in";
import "dotenv/config";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { auth } from "../../src/lib/auth";
import { db } from "../../src/lib/db";
import { actorForUser } from "../../src/domains/identity";
import { saveBusinessCustomer } from "../../src/domains/direct-sales";
test.describe.configure({ mode: "serial" });
const key = `erp-browser-${Date.now()}`;
const email = `${key}@example.test`,
  password = randomUUID();
let userId = "",
  officeId = "",
  productId = "",
  skuId = "",
  categoryId = "",
  brandId = "",
  opportunityId = "";
test.beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    url.pathname !== "/inforteks" ||
    !["localhost", "127.0.0.1"].includes(url.hostname)
  )
    throw new Error("Local browser fixtures required.");
  userId = (
    await auth.api.signUpEmail({
      body: { email, password, name: "ERP verification owner" },
    })
  ).user.id;
  await db.user.update({ where: { id: userId }, data: { role: "OWNER" } });
  officeId = (
    await saveBusinessCustomer(await actorForUser(userId), {
      company: `${key} office`,
      email: `${key}-contact@example.test`,
      address: {
        name: "Office purchaser",
        phone: "+971501234567",
        emirate: "Dubai",
        city: "Dubai",
        area: "Business Bay",
        line1: "ERP test office 301",
      },
    })
  ).id;
  categoryId = (await db.category.create({ data: { name: key, slug: key } }))
    .id;
  brandId = (await db.brand.create({ data: { name: key, slug: key } })).id;
  const product = await db.product.create({
    data: {
      name: "ERP verification toner",
      slug: key,
      categoryId,
      brandId,
      status: "PUBLISHED",
      skus: { create: { code: key, price: 12500, onHand: 10 } },
    },
    include: { skus: true },
  });
  productId = product.id;
  skuId = product.skus[0].id;
});
test.afterAll(async () => {
  await db.crmActivity.deleteMany({
    where: { opportunity: { createdBy: userId } },
  });
  await db.crmOpportunity.deleteMany({ where: { createdBy: userId } });
  const orders = await db.order.findMany({
    where: { salesActorId: userId },
    select: { id: true },
  });
  const orderId = { in: orders.map((o) => o.id) };
  await db.shipment.deleteMany({ where: { orderId } });
  await db.payment.deleteMany({ where: { orderId } });
  await db.reservation.deleteMany({ where: { orderId } });
  await db.orderItem.deleteMany({ where: { orderId } });
  await db.order.deleteMany({ where: { id: orderId } });
  await db.businessCustomer.deleteMany({ where: { createdBy: userId } });
  await db.inventoryMovement.deleteMany({ where: { skuId } });
  await db.sku.deleteMany({ where: { id: skuId } });
  await db.product.deleteMany({ where: { id: productId } });
  await db.category.deleteMany({ where: { id: categoryId } });
  await db.brand.deleteMany({ where: { id: brandId } });
  await db.proposal.deleteMany({ where: { actorId: userId } });
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
test("ERP apps, contact history, CRM activity and a four-unit opportunity-to-order journey", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page
    .getByRole("navigation", { name: "Admin workspace", exact: true })
    .getByRole("link", { name: "Contacts", exact: true })
    .click();
  await page.getByLabel("Search contacts").fill(key);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("link", { name: `${key} office`, exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sales orders (0)" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "New opportunity", exact: true })
    .click();
  await page.getByLabel("Opportunity title").fill("Four toners for the office");
  await page.getByLabel("Expected value (AED)").fill("500.00");
  await page.getByLabel("Salesperson", { exact: true }).selectOption(userId);
  await page
    .getByLabel("Internal notes")
    .fill("Customer requested a visit and four toners.");
  await page
    .getByRole("button", { name: "Create opportunity", exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/crm\/(?!new)[^/]+$/);
  opportunityId = page.url().split("/").at(-1)!;
  await expect(
    page.getByRole("heading", { name: "Four toners for the office" }),
  ).toBeVisible();
  await page.getByLabel("Stage", { exact: true }).selectOption("QUALIFIED");
  await page.getByRole("button", { name: "Update stage" }).click();
  await expect(page.locator('.erp-stage-bar [aria-current="step"]')).toHaveText(
    "Qualified",
  );
  await page
    .locator("summary")
    .filter({ hasText: "Schedule an activity" })
    .click();
  await page
    .getByLabel("What needs to happen?")
    .fill("Call the office purchaser");
  await page
    .getByLabel("Due date & time (UAE)")
    .fill(new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 16));
  await page
    .getByRole("button", { name: "Schedule activity", exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: /Call the office purchaser/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Mark done", exact: true }).click();
  await expect(page.getByRole("cell", { name: /^Done/ })).toBeVisible();
  await page.getByRole("link", { name: "Create sales order" }).click();
  await expect(
    page.getByRole("button", { name: "Change customer" }),
  ).toHaveCount(0);
  await page.getByLabel("Find products", { exact: true }).fill(key);
  await page
    .getByRole("button", { name: "Find products", exact: true })
    .click();
  await page.getByRole("button", { name: /ERP verification toner/ }).click();
  await page.getByLabel(`Quantity for ${key}`).fill("4");
  await page
    .getByRole("button", { name: "Review order total", exact: true })
    .click();
  await page.getByLabel(/I confirmed these items/).check();
  await page
    .getByRole("button", { name: "Confirm direct order", exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/orders\//);
  const orderId = page.url().split("/").at(-1)!;
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  await expect(
    page.getByLabel("Ship quantity: ERP verification toner"),
  ).toHaveValue("4");
  await expect(page.getByLabel("Received amount (AED)")).toHaveValue(
    (order.total / 100).toFixed(2),
  );
  await page
    .getByLabel("Carrier / fulfilment method")
    .fill("Office hand delivery");
  await page.getByLabel("Ship quantity: ERP verification toner").fill("2");
  await page
    .getByRole("button", { name: "Review shipment", exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/proposals\//);
  const proposal = await db.proposal.findUniqueOrThrow({
    where: { id: page.url().split("/").at(-1)! },
  });
  expect(proposal.payload).toMatchObject({ items: [{ quantity: 2 }] });
  await page.getByRole("button", { name: "Approve & apply change" }).click();
  await expect
    .poll(
      async () =>
        (await db.order.findUniqueOrThrow({ where: { id: orderId } }))
          .fulfillmentStatus,
    )
    .toBe("PARTIAL");
  await page.goto(`/admin/orders/${orderId}`);
  await page.getByLabel("Bank / receipt reference").fill("ERP-TEST-RECEIPT");
  await page
    .getByLabel("Received amount (AED)")
    .fill((order.total / 100).toFixed(2));
  await page
    .getByRole("button", { name: "Review payment", exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/proposals\//);
  const receiptProposal = await db.proposal.findUniqueOrThrow({
    where: { id: page.url().split("/").at(-1)! },
  });
  expect(receiptProposal.payload).toMatchObject({
    amount: order.total,
    reference: "ERP-TEST-RECEIPT",
  });
  await expect(
    page.getByRole("heading", { name: "Record verified receipt" }),
  ).toBeVisible();
  await page.goto(`/admin/crm/${opportunityId}`);
  await expect(page.locator('.erp-stage-bar [aria-current="step"]')).toHaveText(
    "Won",
  );
  await expect(
    page.getByRole("link", { name: `Sales order · ${order.reference}` }),
  ).toBeVisible();
  await page.goto(`/admin/contacts/office/${officeId}`);
  await expect(
    page.getByRole("heading", { name: "Sales orders (1)" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: order.reference, exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("pipeline board/list, responsive app navigation and accessible ERP controls", async ({
  page,
}) => {
  await page.goto("/admin/crm");
  await page.getByLabel("Search opportunities").fill("Four toners");
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: /Four toners for the office/ }),
  ).toBeVisible();
  await page.screenshot({
    path: ".data/erp-pipeline-desktop.png",
    fullPage: true,
    caret: "initial",
  });
  const a11y = await new AxeBuilder({ page })
    .include("main")
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(a11y.violations).toEqual([]);
  await page.getByRole("link", { name: "List", exact: true }).click();
  await expect(
    page.getByRole("columnheader", { name: "Expected value" }),
  ).toBeVisible();
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/admin");
    await page.getByRole("button", { name: "Workspace menu" }).click();
    await page
      .getByRole("navigation", { name: "Admin workspace", exact: true })
      .getByRole("link", { name: "CRM", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Pipeline", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.goto(`/admin/crm/${opportunityId}`);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: ".data/erp-opportunity-mobile.png",
    fullPage: true,
    caret: "initial",
  });
});
test("Sales role can use office CRM but cannot open online contacts or order operations", async ({
  page,
}) => {
  await db.user.update({ where: { id: userId }, data: { role: "SALES" } });
  await page.goto("/admin/contacts?kind=account");
  await expect(
    page.getByRole("heading", { name: "Permission required." }),
  ).toBeVisible();
  await page.goto("/admin/crm?channel=ONLINE");
  await expect(
    page.getByRole("heading", { name: "Permission required." }),
  ).toBeVisible();
  await page.goto(`/admin/crm/${opportunityId}`);
  await expect(
    page.getByRole("heading", { name: "Four toners for the office" }),
  ).toBeVisible();
  const o = await db.order.findFirstOrThrow({
    where: { salesActorId: userId },
  });
  await page.goto(`/admin/orders/${o.id}`);
  await expect(
    page.getByRole("heading", { name: "Record verified payment" }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Ship quantity: ERP verification toner"),
  ).toHaveCount(0);
});
