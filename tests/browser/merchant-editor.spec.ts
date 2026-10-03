import "dotenv/config";
import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import { auth } from "../../src/lib/auth";
import { db } from "../../src/lib/db";
const key = `merchant-browser-${Date.now()}`;
const email = `${key}@example.test`,
  password = randomBytes(24).toString("base64url");
let userId = "";
test.beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/inforteks"
  )
    throw new Error("Local development fixtures only.");
  const result = await auth.api.signUpEmail({
    body: { email, password, name: "Merchant test owner" },
  });
  userId = result.user.id;
  await db.user.update({ where: { id: userId }, data: { role: "OWNER" } });
});
test.afterAll(async () => {
  const products = await db.product.findMany({
    where: { slug: { startsWith: key } },
    include: { media: true },
  });
  const sections = await db.homeSection.findMany({
    where: { title: { startsWith: key } },
    include: { assets: true, bannerMedia: true },
  });
  const media = [
    ...products.flatMap((p) => p.media),
    ...sections.flatMap((s) => [
      ...s.assets,
      ...(s.bannerMedia ? [s.bannerMedia] : []),
    ]),
  ];
  await db.homeSection.deleteMany({
    where: { id: { in: sections.map((s) => s.id) } },
  });
  await db.media.deleteMany({ where: { id: { in: media.map((m) => m.id) } } });
  await db.sku.deleteMany({
    where: { productId: { in: products.map((p) => p.id) } },
  });
  await db.product.deleteMany({
    where: { id: { in: products.map((p) => p.id) } },
  });
  for (const m of media)
    await rm(`${process.env.UPLOAD_DIR ?? ".data/uploads"}/${m.key}`, {
      force: true,
    });
  await db.category.deleteMany({ where: { slug: { startsWith: key } } });
  await db.brand.deleteMany({ where: { slug: { startsWith: key } } });
  await db.auditEvent.deleteMany({ where: { actorId: userId } });
  await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
});
test.beforeEach(async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await expect(page).toHaveURL(/\/admin$/);
});
test("merchant creates taxonomy, uploads images in the new product form, and publishes a featured sale product", async ({
  page,
}) => {
  await page.goto("/admin/products/new");
  await page.getByLabel("Product name", { exact: true }).fill(key);
  await page
    .getByLabel("Product description", { exact: true })
    .fill("A local test of the complete merchant listing workflow.");
  await page.getByLabel("Feature on homepage").check();
  await page.getByRole("button", { name: "Create brand", exact: true }).click();
  await page.getByLabel("New brand name").fill(`${key} brand`);
  await page.getByRole("button", { name: "Save brand", exact: true }).click();
  await expect(page.getByLabel("Brand", { exact: true })).not.toHaveValue("");
  await page
    .getByRole("button", { name: "Create category", exact: true })
    .click();
  await page.getByLabel("New category name").fill(`${key} category`);
  await page
    .getByRole("button", { name: "Save category", exact: true })
    .click();
  await expect(page.getByLabel("Category", { exact: true })).toHaveValue(/\S+/);
  await page.getByLabel("SKU code", { exact: true }).fill(key);
  await page.getByLabel("Price (AED)", { exact: true }).fill("799.95");
  await page.getByLabel("Previous price (AED)", { exact: true }).fill("999.95");
  await expect(page.locator(".price-preview del")).toContainText("999.95");
  await page
    .getByLabel("Choose product images")
    .setInputFiles(["public/brand/inforteks.png", "public/brand/hero.png"]);
  await page
    .getByLabel("Image description", { exact: true })
    .fill("Local product image");
  await page.getByRole("button", { name: "Create product draft" }).click();
  await expect(page).toHaveURL(
    (url) =>
      /^\/admin\/products\/[^/]+$/.test(url.pathname) &&
      !url.pathname.endsWith("/new"),
  );
  await expect(page.locator(".thumbnails img")).toHaveCount(2);
  const product = await db.product.findUniqueOrThrow({
    where: { slug: key },
    include: { skus: true, media: { orderBy: { createdAt: "asc" } } },
  });
  expect(product.featured).toBe(true);
  await expect(page.locator(".thumbnails img").first()).toHaveAttribute(
    "src",
    `/media/${product.media[0].id}`,
  );
  expect(product.skus[0].compareAt).toBe(99995);
  await page
    .getByRole("button", { name: "Publish product", exact: true })
    .click();
  await page.getByRole("button", { name: "Approve & apply change" }).click();
  await expect(page.getByText(/Status: APPROVED/)).toBeVisible();
  await page.goto(`/product/${key}`);
  await expect(page.locator("del")).toContainText("999.95");
  await page.goto("/offers");
  await expect(
    page.locator(".product-card").filter({ hasText: key }).locator("del"),
  ).toContainText("999.95");
  const featured = await page.request.get(
    `/api/v1/storefront/products?featured=true&q=${key}`,
  );
  expect(
    (await featured.json()).data.products.some(
      (p: { id: string }) => p.id === product.id,
    ),
  ).toBe(true);
  await page.goto(`/admin/products/${product.id}`);
  await page
    .locator("#pricing")
    .getByLabel("Price (AED)", { exact: true })
    .fill("749.95");
  await page
    .locator("#pricing")
    .getByRole("button", { name: "Preview price change" })
    .click();
  await page.getByRole("button", { name: "Approve & apply change" }).click();
  await expect(page.getByText(/Status: APPROVED/)).toBeVisible();
  await page.goto(`/product/${key}`);
  await expect(page.getByText(/749.95/).first()).toBeVisible();
});
test("isolated desktop and mobile HTML previews stay private until explicitly published", async ({
  page,
  request,
}) => {
  await page.goto("/admin/home-sections/new");
  await page.getByLabel("Headline", { exact: true }).fill(`${key} HTML`);
  await page.getByLabel("Section type", { exact: true }).selectOption("html");
  await page
    .getByLabel("HTML banner image file")
    .setInputFiles("public/brand/inforteks.png");
  await page
    .getByLabel("HTML banner image description")
    .fill("Private HTML banner image");
  await page.getByRole("button", { name: "Upload image", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("uploaded privately");
  const imagePath = await page.locator(".banner-preview code").innerText();
  expect((await request.get(imagePath)).status()).toBe(404);
  await page
    .getByLabel("Banner HTML", { exact: true })
    .fill(
      `<section style="background-color:#14345a;color:#ffffff;padding:32px"><h2>${key} campaign</h2><img src="${imagePath}" alt="Private HTML banner image"><a href="/offers">Shop campaign</a><script>document.body.dataset.compromised='yes'</script></section>`,
    );
  await page
    .getByRole("button", { name: "Preview this section", exact: true })
    .click();
  const frame = page.frameLocator(
    'iframe[title="Selected homepage section preview"]',
  );
  await expect(
    frame.getByRole("heading", { name: `${key} campaign` }),
  ).toBeVisible();
  await expect(
    frame.getByRole("heading", { name: `${key} campaign` }),
  ).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(frame.locator("header")).toHaveCount(0);
  await expect(frame.locator("script")).toHaveCount(0);
  await expect(
    frame.getByRole("img", { name: "Private HTML banner image" }),
  ).toBeVisible();
  await frame.getByRole("link", { name: "Shop campaign" }).click();
  await expect(page).toHaveURL(/\/home-sections\/new$/);
  await page.getByLabel("Preview size").selectOption("390");
  await page.screenshot({
    path: ".data/screenshots/merchant-section-preview.png",
    fullPage: true,
  });
  await expect(frame.locator("body")).not.toHaveAttribute(
    "data-compromised",
    "yes",
  );
  await page
    .getByRole("button", { name: "Save homepage section", exact: true })
    .click();
  await expect(page).not.toHaveURL(/\/new$/);
  expect((await request.get(imagePath)).status()).toBe(404);
  await page.getByLabel("Visible", { exact: true }).check();
  await page
    .getByRole("button", { name: "Save homepage section", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Homepage section saved",
  );
  expect((await request.get(imagePath)).status()).toBe(200);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: `${key} campaign` }),
  ).toBeVisible();
});
test("full hero preview includes editable side banners without changing the storefront", async ({
  page,
}) => {
  await page.goto("/admin/home-sections/new");
  await page.getByLabel("Headline", { exact: true }).fill(`${key} hero`);
  await page
    .getByLabel("Eyebrow text", { exact: true })
    .fill("AN EDITABLE HERO");
  await page.locator("details").first().locator("summary").click();
  await page
    .getByLabel("Side banner 1 headline", { exact: true })
    .fill("My side campaign");
  await page
    .getByRole("button", { name: "Preview this section", exact: true })
    .click();
  const frame = page.frameLocator(
    'iframe[title="Selected homepage section preview"]',
  );
  await expect(
    frame.getByRole("heading", { name: `${key} hero` }),
  ).toBeVisible();
  await expect(
    frame.getByRole("heading", { name: "My side campaign" }),
  ).toBeVisible();
  await expect(frame.locator(".hero-grid")).toHaveCount(1);
  await expect(frame.locator(".editorial-banner")).toHaveCount(0);
  expect(await db.homeSection.count({ where: { title: `${key} hero` } })).toBe(
    0,
  );
});
