import "dotenv/config";
import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { auth } from "../../src/lib/auth";
import { db } from "../../src/lib/db";
import { actorForUser } from "../../src/domains/identity";
import { propose } from "../../src/domains/approvals";
import { submitEmailSignIn } from "./sign-in";

const key = `approval-recovery-${randomUUID()}`;
const email = `${key}@example.test`;
const password = randomUUID();
let localFixtures = false;
let userId = "",
  productId = "",
  categoryId = "",
  brandId = "",
  skuId = "";

test.beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    url.pathname !== "/inforteks" ||
    !["127.0.0.1", "localhost"].includes(url.hostname)
  )
    throw new Error(
      "Approval recovery fixtures require the local development database.",
    );
  localFixtures = true;
  userId = (
    await auth.api.signUpEmail({
      body: { name: "Local approval recovery", email, password },
    })
  ).user.id;
  await db.user.update({ where: { id: userId }, data: { role: "INVENTORY" } });
  brandId = (await db.brand.create({ data: { name: key, slug: key } })).id;
  categoryId = (await db.category.create({ data: { name: key, slug: key } }))
    .id;
  const product = await db.product.create({
    data: {
      name: "Local approval recovery fixture",
      slug: key,
      brandId,
      categoryId,
      demo: true,
      skus: { create: { code: key, price: 10000, onHand: 5 } },
    },
    include: { skus: true },
  });
  productId = product.id;
  skuId = product.skus[0].id;
});

test.afterAll(async () => {
  if (!localFixtures) return;
  if (userId) {
    await db.inventoryMovement.deleteMany({ where: { actorId: userId } });
    await db.proposal.deleteMany({ where: { actorId: userId } });
    await db.auditEvent.deleteMany({ where: { actorId: userId } });
  }
  if (productId) await db.sku.deleteMany({ where: { productId } });
  if (productId) await db.product.delete({ where: { id: productId } });
  if (brandId) await db.brand.delete({ where: { id: brandId } });
  if (categoryId) await db.category.delete({ where: { id: categoryId } });
  if (userId) await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
});

for (const decision of ["approve", "reject"] as const) {
  test(`lost ${decision} response reads the committed decision without replaying the mutation`, async ({
    page,
  }) => {
    const before = await db.sku.findUniqueOrThrow({ where: { id: skuId } });
    const proposal = await propose(
      await actorForUser(userId),
      "inventory.adjust",
      skuId,
      { delta: 2, reason: "Local interrupted decision regression" },
    );
    const terminal = decision === "approve" ? "APPROVED" : "REJECTED";
    await page.goto("/admin/login");
    await page.getByLabel("Email address", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await submitEmailSignIn(page);
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto(`/admin/proposals/${proposal.id}`);
    await expect(page.locator(".proposal-card > .form-help")).toContainText(
      "Status: PENDING",
    );
    let mutationRequests = 0;
    await page.route(
      `**/api/v1/admin/proposals/${proposal.id}/${decision}`,
      async (route) => {
        mutationRequests++;
        // Execute the actual authenticated POST, then lose only its response.
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        expect(
          await db.proposal.findUniqueOrThrow({ where: { id: proposal.id } }),
        ).toMatchObject({ status: terminal });
        await route.abort("failed");
      },
    );
    await page
      .getByRole("button", {
        name: decision === "approve" ? "Approve & apply change" : "Reject",
        exact: true,
      })
      .click();
    await expect(page.locator(".proposal-card > .form-help")).toContainText(
      `Status: ${terminal}`,
    );
    await expect(
      page.getByRole("button", { name: "Approve & apply change", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Reject", exact: true }),
    ).toHaveCount(0);
    expect(mutationRequests).toBe(1);
    expect(
      await db.sku.findUniqueOrThrow({ where: { id: skuId } }),
    ).toMatchObject({
      onHand: before.onHand + (decision === "approve" ? 2 : 0),
      version: before.version + (decision === "approve" ? 1 : 0),
    });
    expect(
      await db.inventoryMovement.count({ where: { reference: proposal.id } }),
    ).toBe(decision === "approve" ? 1 : 0);
    expect(
      await db.auditEvent.count({
        where: {
          proposalId: proposal.id,
          operation:
            decision === "approve" ? "inventory.adjust" : "proposal.reject",
        },
      }),
    ).toBe(1);
  });
}

test("an interrupted decision that did not reach the server stays pending without automatic retry", async ({
  page,
}) => {
  const before = await db.sku.findUniqueOrThrow({ where: { id: skuId } });
  const proposal = await propose(
    await actorForUser(userId),
    "inventory.adjust",
    skuId,
    { delta: 2, reason: "Local uncommitted decision regression" },
  );
  await page.goto("/admin/login");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await submitEmailSignIn(page);
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto(`/admin/proposals/${proposal.id}`);
  let mutationRequests = 0;
  await page.route(
    `**/api/v1/admin/proposals/${proposal.id}/approve`,
    async (route) => {
      mutationRequests++;
      await route.abort("failed");
    },
  );
  const refreshed = page.waitForResponse((response) => {
    const request = response.request();
    return (
      new URL(response.url()).pathname === `/admin/proposals/${proposal.id}` &&
      request.method() === "GET" &&
      request.headers().rsc === "1"
    );
  });
  await page
    .getByRole("button", { name: "Approve & apply change", exact: true })
    .click();
  expect((await refreshed).status()).toBe(200);
  await expect(page.locator(".proposal-card > .form-help")).toContainText(
    "Status: PENDING",
  );
  await expect(
    page.locator(".proposal-actions").getByRole("alert"),
  ).toContainText("connection was interrupted");
  await expect(
    page.getByRole("button", { name: "Approve & apply change", exact: true }),
  ).toBeEnabled();
  expect(mutationRequests).toBe(1);
  expect(
    await db.proposal.findUniqueOrThrow({ where: { id: proposal.id } }),
  ).toMatchObject({ status: "PENDING", approverId: null });
  expect(await db.sku.findUniqueOrThrow({ where: { id: skuId } })).toEqual(
    before,
  );
  expect(
    await db.inventoryMovement.count({ where: { reference: proposal.id } }),
  ).toBe(0);
  expect(
    await db.auditEvent.count({
      where: { proposalId: proposal.id, operation: "inventory.adjust" },
    }),
  ).toBe(0);
});
