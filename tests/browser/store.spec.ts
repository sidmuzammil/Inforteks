import "dotenv/config";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { auth } from "../../src/lib/auth";
import { db } from "../../src/lib/db";
import { actorForUser } from "../../src/domains/identity";
import { propose, approve } from "../../src/domains/approvals";
const suffix = Date.now().toString();
const email = `browser-owner-${suffix}@example.test`;
const password = randomBytes(24).toString("base64url");
let userId: string;
test.beforeAll(async () => {
  await mkdir(".data/screenshots", { recursive: true });
  const user = await auth.api.signUpEmail({
    body: { email, password, name: "Development Owner" },
  });
  userId = user.user.id;
  await db.user.update({ where: { id: userId }, data: { role: "OWNER" } });
});
test.afterAll(async () => {
  if (userId) {
    const actor = await actorForUser(userId);
    for (const o of await db.order.findMany({
      where: {
        email: "browser-guest@example.test",
        demo: true,
        status: "PLACED",
        fulfillmentStatus: "UNFULFILLED",
      },
    })) {
      const p = await propose(actor, "order.cancel", o.id, {
        reason: "Browser verification cleanup",
      });
      await approve(actor, p.id);
    }
    for (const p of await db.product.findMany({
      where: { slug: { startsWith: "browser-test-" }, status: "PUBLISHED" },
    })) {
      const proposal = await propose(actor, "product.archive", p.id, {});
      await approve(actor, proposal.id);
    }
    await db.user.delete({ where: { id: userId } });
  }
  await db.$disconnect();
});
test("storefront layouts, navigation and images at four viewport widths", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 950 });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "A new level of possibility." }),
    ).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect(
      await page
        .locator("img")
        .evaluateAll((imgs) =>
          (imgs as HTMLImageElement[])
            .filter((i) => i.complete && !i.naturalWidth)
            .map((i) => i.src),
        ),
    ).toEqual([]);
    await page.screenshot({
      path: `.data/screenshots/home-${width}.png`,
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "All departments" }).click();
  await expect(page.locator("#department-menu")).toBeVisible();
  await page
    .locator("#department-menu")
    .getByRole("link", { name: "Laptops", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Laptops", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("selected SKU, guest cart, server quote and protected order confirmation", async ({
  page,
  browser,
}) => {
  await page.goto("/product/rog-zephyrus-g16-gaming-laptop");
  await page
    .getByRole("button", { name: "32 ram / 1024 storage", exact: true })
    .click();
  await expect(page).toHaveURL(/sku=/);
  await page.getByRole("button", { name: "Add to cart", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Added to your cart");
  await page.goto("/cart");
  await expect(
    page.getByRole("heading", { name: "Your shopping cart" }),
  ).toBeVisible();
  await expect(page.getByText(/DEMO-LAPTO-001-32/)).toBeVisible();
  await page.getByRole("link", { name: "Continue to checkout" }).click();
  await page
    .getByLabel("Email address", { exact: true })
    .fill("browser-guest@example.test");
  await page
    .getByLabel("Full name", { exact: true })
    .fill("Browser Test Guest");
  await page.getByLabel("UAE mobile number").fill("+971501234567");
  await page.getByLabel("City / area").fill("Dubai");
  await page
    .getByLabel("Building, street & apartment")
    .fill("Development Building 1");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Place order", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your order is in." }),
  ).toBeVisible();
  await expect(
    page.getByText("Development order — no money has been transferred.", {
      exact: false,
    }),
  ).toBeVisible();
  const url = page.url();
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto(url);
  await expect(
    otherPage.getByRole("heading", { name: "Let’s find your way back." }),
  ).toBeVisible();
  await expect(otherPage.locator("main")).not.toContainText("ROG Zephyrus");
  await other.close();
});
test("owner creates two-SKU product, uploads image, adjusts stock and publishes", async ({
  page,
}) => {
  await page.goto("/admin/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Sign in to workspace", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your store, at a glance." }),
  ).toBeVisible();
  await expect(page.locator(".metric-card").first()).not.toContainText(
    "Restricted",
  );
  await page.screenshot({
    path: ".data/screenshots/admin-overview.png",
    fullPage: true,
  });
  await page.goto("/admin/products/new");
  await page
    .getByLabel("Product name", { exact: true })
    .fill(`Browser test laptop ${suffix}`);
  await page
    .getByLabel("URL slug", { exact: false })
    .fill(`browser-test-${suffix}`);
  await page
    .getByLabel("Product description")
    .fill(
      "An original development product for the verified admin to storefront flow.",
    );
  const laptop = await db.category.findUniqueOrThrow({
    where: { slug: "laptops" },
  });
  await page.getByLabel("Category", { exact: true }).selectOption(laptop.id);
  await page.getByLabel("SKU code").fill(`BROWSER-${suffix}-A`);
  await page.getByLabel("Price (AED)").fill("1999.50");
  await page.getByRole("button", { name: "Add variant" }).click();
  await page.getByLabel("SKU code").nth(1).fill(`BROWSER-${suffix}-B`);
  await page.getByLabel("Price (AED)").nth(1).fill("2199.50");
  await page.getByRole("button", { name: "Create product draft" }).click();
  await expect(
    page.getByRole("heading", { name: `Browser test laptop ${suffix}` }),
  ).toBeVisible();
  await page
    .getByLabel("Product image", { exact: false })
    .setInputFiles("public/brand/hero.png");
  await page
    .getByLabel("Alternative text")
    .fill("Development test laptop illustration");
  await page.getByRole("button", { name: "Upload image" }).click();
  await expect(page.locator(".thumbnails img")).toHaveCount(1);
  const adjustment = page.locator("#inventory form").first();
  await adjustment.getByLabel("Quantity adjustment").fill("3");
  await adjustment
    .getByLabel("Reason", { exact: false })
    .fill("Initial verified development stock");
  await adjustment.getByRole("button", { name: "Preview adjustment" }).click();
  await expect(
    page.getByRole("heading", { name: "Review the exact change." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Approve & apply change" }).click();
  await expect(page.getByText(/Status: APPROVED/)).toBeVisible();
  const p = await db.product.findUniqueOrThrow({
    where: { slug: `browser-test-${suffix}` },
  });
  await page.goto(`/admin/products/${p.id}`);
  await page
    .getByRole("button", { name: "Publish product", exact: true })
    .click();
  await page.getByRole("button", { name: "Approve & apply change" }).click();
  await expect(page.getByText(/Status: APPROVED/)).toBeVisible();
  await page.goto(`/product/browser-test-${suffix}`);
  await expect(
    page.getByRole("heading", { name: `Browser test laptop ${suffix}` }),
  ).toBeVisible();
  await expect(
    page.getByText("AED 1,999.50", { exact: false }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: ".data/screenshots/product-desktop.png",
    fullPage: true,
  });
  const api = await page.request.get(
    `/api/v1/storefront/search?q=BROWSER-${suffix}-A`,
  );
  expect((await api.json()).data.total).toBe(1);
  const noOrigin = await page.request.post("/api/v1/admin/products", {
    headers: { Origin: "https://untrusted.example" },
    data: {},
  });
  expect(noOrigin.status()).toBe(403);
});
test("key page templates load and accessibility checks expose no serious violations", async ({
  page,
}) => {
  for (const path of [
    "/categories",
    "/brands",
    "/category/laptops",
    "/search?q=laptop",
    "/offers",
    "/new-arrivals",
    "/collection/work-smarter",
    "/wishlist",
    "/compare",
    "/login",
    "/register",
    "/forgot-password",
    "/track-order",
    "/contact",
    "/faq",
    "/about",
    "/shipping-delivery",
    "/returns-refunds",
    "/privacy-policy",
    "/terms-conditions",
  ]) {
    const r = await page.goto(path);
    expect(r?.status(), path).toBe(200);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      path,
    ).toBe(true);
  }
  await page.goto("/login");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    results.violations
      .filter((v) => ["critical", "serious"].includes(v.impact ?? ""))
      .map((v) => ({ id: v.id, description: v.description })),
  ).toEqual([]);
});

test("account wishlist restores in a new browser and clears on sign out", async ({
  page,
  browser,
}) => {
  const product = await db.product.findFirstOrThrow({
    where: { status: "PUBLISHED", demo: true },
    include: { skus: true },
  });
  async function signIn(target: typeof page) {
    await target.goto("/login");
    await target.getByLabel("Email address").fill(email);
    await target.getByLabel("Password", { exact: true }).fill(password);
    await target.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(target).toHaveURL(/\/account$/);
  }
  await signIn(page);
  await page.goto(`/product/${product.slug}`);
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(localStorage).some((k) => k.startsWith("ift-wishlist:")),
      ),
    )
    .toBe(true);
  await page
    .getByRole("button", { name: "Save to wishlist", exact: true })
    .click();
  await expect.poll(() => db.wishlistItem.count({ where: { userId } })).toBe(1);
  const other = await browser.newContext({ baseURL: "http://localhost:3000" });
  const nextPage = await other.newPage();
  try {
    await signIn(nextPage);
    await nextPage.goto("/wishlist");
    await expect(nextPage.locator(".comparison-table")).toContainText(
      product.name,
    );
    await nextPage.goto("/account");
    await nextPage
      .getByRole("button", { name: "Sign out", exact: true })
      .click();
    await expect(nextPage).toHaveURL(/\/login$/);
    await nextPage.goto("/wishlist");
    await expect(
      nextPage.getByRole("heading", { name: "Room for your next favorite" }),
    ).toBeVisible();
  } finally {
    await other.close();
  }
});
