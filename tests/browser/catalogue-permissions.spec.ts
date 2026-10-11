import "dotenv/config";
import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { auth } from "../../src/lib/auth";
import { db } from "../../src/lib/db";
import { submitEmailSignIn } from "./sign-in";

const key = `preview-permissions-${randomUUID()}`;
const email = `${key}@example.test`,
  password = randomUUID();
let userId = "",
  productId = "",
  categoryId = "",
  brandId = "";
test.beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    url.pathname !== "/inforteks" ||
    !["127.0.0.1", "localhost"].includes(url.hostname)
  )
    throw new Error("Local development fixtures only.");
  userId = (
    await auth.api.signUpEmail({
      body: { name: "Preview editor", email, password },
    })
  ).user.id;
  await db.user.update({ where: { id: userId }, data: { role: "EDITOR" } });
  brandId = (await db.brand.create({ data: { name: key, slug: key } })).id;
  categoryId = (await db.category.create({ data: { name: key, slug: key } }))
    .id;
  productId = (
    await db.product.create({
      data: {
        name: "Private networking draft",
        slug: key,
        brandId,
        categoryId,
        skus: {
          create: {
            code: key,
            price: 15321,
            compareAt: 25432,
            onHand: 19,
            reserved: 3,
          },
        },
      },
    })
  ).id;
});
test.afterAll(async () => {
  await db.proposal.deleteMany({ where: { actorId: userId } });
  await db.auditEvent.deleteMany({ where: { actorId: userId } });
  if (productId) await db.sku.deleteMany({ where: { productId } });
  if (productId) await db.product.delete({ where: { id: productId } });
  if (brandId) await db.brand.delete({ where: { id: brandId } });
  if (categoryId) await db.category.delete({ where: { id: categoryId } });
  if (userId) await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
});
test("Catalogue staff can prepare, review and approve a price change without AI access", async ({
  page,
}) => {
  await db.user.update({ where: { id: userId }, data: { role: "CATALOG" } });
  await page.goto("/admin/login");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await submitEmailSignIn(page);
  await expect(page).toHaveURL(/\/admin$/);
  expect((await page.request.get("/api/v1/admin/ai/runs")).status()).toBe(403);
  await page.goto(`/admin/products/${productId}`);
  await page.getByLabel("Price (AED)", { exact: true }).fill("123.45");
  await page
    .getByRole("button", { name: "Preview price change", exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/proposals\//);
  await expect(
    page.getByRole("heading", { name: "Review the exact change." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Approve & apply change", exact: true })
    .click();
  await expect(page.locator(".proposal-card .form-help")).toContainText(
    "Status: APPROVED",
  );
  expect((await db.sku.findFirstOrThrow({ where: { productId } })).price).toBe(
    12345,
  );
  await page.goto("/admin/proposals");
  await expect(
    page.getByRole("heading", { name: "Approvals", exact: true }),
  ).toBeVisible();
  expect((await page.request.get("/api/v1/admin/ai/runs")).status()).toBe(403);
});
test("editor draft preview hides restricted values at desktop and mobile widths", async ({
  page,
}) => {
  await db.user.update({ where: { id: userId }, data: { role: "EDITOR" } });
  await db.sku.updateMany({
    where: { productId },
    data: { price: 15321, compareAt: 25432 },
  });
  await page.goto("/admin/login");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await submitEmailSignIn(page);
  await expect(page).toHaveURL(/\/admin$/);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 950 });
    const response = await page.goto(`/admin/products/${productId}/preview`);
    expect(response?.status()).toBe(200);
    await expect(
      page.getByText("Price restricted", { exact: true }),
    ).toBeVisible();
    // Check the response as well as rendered text: Gallery is a client component.
    const html = await response!.text();
    expect(html).not.toMatch(/(?:price|compareAt)\\?":(?:15321|25432)/);
    expect(html).not.toContain("153.21");
    expect(html).not.toContain("254.32");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  expect(
    (await page.request.get(`/api/v1/storefront/products/${key}`)).status(),
  ).toBe(404);
});
