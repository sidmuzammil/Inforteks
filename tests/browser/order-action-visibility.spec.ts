import "dotenv/config";
import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { auth } from "../../src/lib/auth";
import { db } from "../../src/lib/db";
import { submitEmailSignIn } from "./sign-in";

const key = `order-actions-${randomUUID()}`;
const email = `${key}@example.test`;
const password = randomUUID();
let localFixtures = false;
let userId = "",
  productId = "",
  categoryId = "",
  brandId = "",
  orderId = "";

test.beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    url.pathname !== "/inforteks" ||
    !["127.0.0.1", "localhost"].includes(url.hostname)
  )
    throw new Error(
      "Order action fixtures require the local development database.",
    );
  localFixtures = true;
  userId = (
    await auth.api.signUpEmail({
      body: { name: "Local order actions", email, password },
    })
  ).user.id;
  await db.user.update({ where: { id: userId }, data: { role: "MANAGER" } });
  brandId = (await db.brand.create({ data: { name: key, slug: key } })).id;
  categoryId = (await db.category.create({ data: { name: key, slug: key } }))
    .id;
  const product = await db.product.create({
    data: {
      name: "Local order action fixture",
      slug: key,
      brandId,
      categoryId,
      demo: true,
      skus: { create: { code: key, price: 10000, onHand: 8 } },
    },
    include: { skus: true },
  });
  productId = product.id;
  const order = await db.order.create({
    data: {
      reference: key,
      guestTokenHash: randomUUID(),
      email,
      address: {
        name: "Local order buyer",
        phone: "+971501234567",
        emirate: "Dubai",
        city: "Dubai",
        area: "Local area",
        line1: "Local test building",
      },
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
          skuId: product.skus[0].id,
          snapshot: { name: product.name, sku: key, options: {} },
          quantity: 4,
          unitPrice: 10000,
          total: 40000,
        },
      },
    },
  });
  orderId = order.id;
});

test.afterAll(async () => {
  if (!localFixtures) return;
  if (orderId) {
    await db.orderItem.deleteMany({ where: { orderId } });
    await db.order.delete({ where: { id: orderId } });
  }
  if (productId) await db.sku.deleteMany({ where: { productId } });
  if (productId) await db.product.delete({ where: { id: productId } });
  if (brandId) await db.brand.delete({ where: { id: brandId } });
  if (categoryId) await db.category.delete({ where: { id: categoryId } });
  if (userId) await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
});

test("order actions follow current status, remaining quantities and existing operation permissions", async ({
  page,
}) => {
  await page.goto("/admin/login");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await submitEmailSignIn(page);
  await expect(page).toHaveURL(/\/admin$/);

  const cases = [
    {
      name: "unshipped active order",
      status: "PLACED",
      fulfilled: 0,
      fulfillmentStatus: "UNFULFILLED",
      paymentStatus: "PENDING",
      paymentMethod: "OFFLINE",
      expected: [1, 1, 1],
    },
    {
      name: "partially shipped order",
      status: "PROCESSING",
      fulfilled: 2,
      fulfillmentStatus: "PARTIAL",
      paymentStatus: "PENDING",
      paymentMethod: "OFFLINE",
      expected: [1, 0, 1],
    },
    {
      name: "expired order",
      status: "EXPIRED",
      fulfilled: 0,
      fulfillmentStatus: "UNFULFILLED",
      paymentStatus: "PENDING",
      paymentMethod: "OFFLINE",
      expected: [0, 0, 0],
    },
    {
      name: "cancelled order",
      status: "CANCELLED",
      fulfilled: 0,
      fulfillmentStatus: "UNFULFILLED",
      paymentStatus: "PENDING",
      paymentMethod: "OFFLINE",
      expected: [0, 0, 0],
    },
    {
      name: "completed unpaid order",
      status: "COMPLETED",
      fulfilled: 4,
      fulfillmentStatus: "FULFILLED",
      paymentStatus: "PENDING",
      paymentMethod: "OFFLINE",
      expected: [0, 0, 1],
    },
    {
      name: "no remaining quantities despite an old aggregate label",
      status: "PROCESSING",
      fulfilled: 4,
      fulfillmentStatus: "PARTIAL",
      paymentStatus: "PENDING",
      paymentMethod: "OFFLINE",
      expected: [0, 0, 1],
    },
    {
      name: "paid unshipped order",
      status: "PLACED",
      fulfilled: 0,
      fulfillmentStatus: "UNFULFILLED",
      paymentStatus: "PAID",
      paymentMethod: "OFFLINE",
      expected: [1, 1, 0],
    },
    {
      name: "non-offline payment",
      status: "PLACED",
      fulfilled: 0,
      fulfillmentStatus: "UNFULFILLED",
      paymentStatus: "PENDING",
      paymentMethod: "SIMULATOR",
      expected: [1, 1, 0],
    },
  ];
  const buttons = ["Review shipment", "Review cancellation", "Review payment"];
  for (const scenario of cases) {
    await db.order.update({
      where: { id: orderId },
      data: {
        status: scenario.status,
        fulfillmentStatus: scenario.fulfillmentStatus,
        paymentStatus: scenario.paymentStatus,
        paymentMethod: scenario.paymentMethod,
      },
    });
    await db.orderItem.updateMany({
      where: { orderId },
      data: { fulfilled: scenario.fulfilled },
    });
    await page.goto(`/admin/online-store/orders/${orderId}`);
    await expect(
      page.getByRole("heading", { name: key, exact: true }),
    ).toBeVisible();
    for (const [index, name] of buttons.entries())
      await expect
        .soft(
          page.getByRole("button", { name, exact: true }),
          `${scenario.name}: ${name}`,
        )
        .toHaveCount(scenario.expected[index], { timeout: 1000 });
  }

  await db.order.update({
    where: { id: orderId },
    data: {
      status: "PLACED",
      fulfillmentStatus: "UNFULFILLED",
      paymentStatus: "PENDING",
      paymentMethod: "OFFLINE",
    },
  });
  await db.orderItem.updateMany({ where: { orderId }, data: { fulfilled: 0 } });
  await db.user.update({ where: { id: userId }, data: { role: "SUPPORT" } });
  await page.goto(`/admin/online-store/orders/${orderId}`);
  await expect(
    page.getByRole("button", { name: "Review shipment", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review cancellation", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review payment", exact: true }),
  ).toHaveCount(0);

  await db.order.update({
    where: { id: orderId },
    data: {
      channel: "DIRECT",
      businessSnapshot: { company: "Local action visibility office" },
    },
  });
  await db.user.update({ where: { id: userId }, data: { role: "SALES" } });
  await page.goto(`/admin/direct-sales/orders/${orderId}`);
  await expect(
    page.getByRole("heading", { name: key, exact: true }),
  ).toBeVisible();
  for (const name of buttons)
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(
      0,
    );
  expect(await db.proposal.count({ where: { targetId: orderId } })).toBe(0);
  expect(await db.payment.count({ where: { orderId } })).toBe(0);
  expect(await db.shipment.count({ where: { orderId } })).toBe(0);
});
