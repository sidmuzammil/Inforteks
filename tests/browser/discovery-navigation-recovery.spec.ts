import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { db } from "../../src/lib/db";

const key = `discovery-recovery-${Date.now()}-${randomUUID().slice(0, 8)}`;
const productName = `Temporary local networking fixture ${key}`;
let localFixturesAllowed = false;
let brandId = "";
let categoryId = "";
let productId = "";
let skuId = "";

test.beforeAll(async ({ baseURL }) => {
  const database = new URL(process.env.DATABASE_URL ?? "");
  const browser = new URL(baseURL ?? "");
  if (
    !["localhost", "127.0.0.1"].includes(database.hostname) ||
    database.pathname !== "/inforteks" ||
    !["localhost", "127.0.0.1"].includes(browser.hostname)
  )
    throw new Error(
      "Discovery recovery fixtures require local development only.",
    );
  localFixturesAllowed = true;

  const fixture = await db.$transaction(async (tx) => {
    const brand = await tx.brand.create({
      data: { name: `${key} local fixture brand`, slug: key },
    });
    const category = await tx.category.create({
      data: {
        name: `${key} local fixture department`,
        slug: key,
        attributes: {
          create: [
            { key: "ports", label: "Ports" },
            { key: "connection", label: "Connection" },
            { key: "link_speed", label: "Link speed", unit: "Mbps" },
          ],
        },
      },
    });
    const product = await tx.product.create({
      data: {
        name: productName,
        slug: key,
        description: "Temporary local browser fixture, not a retail listing.",
        brandId: brand.id,
        categoryId: category.id,
        status: "PUBLISHED",
        store: true,
        specs: { ports: 24, link_speed: 100 },
        media: {
          create: {
            key: `illustrations/network.svg?${key}`,
            alt: "Local browser fixture network illustration",
            mime: "image/svg+xml",
            public: true,
          },
        },
        skus: {
          create: {
            code: key,
            options: { ports: 12, connection: "SFP", link_speed: 2500 },
            specs: { link_speed: 1000 },
            price: 20000,
          },
        },
      },
      include: { skus: true },
    });
    return {
      brandId: brand.id,
      categoryId: category.id,
      productId: product.id,
      skuId: product.skus[0].id,
    };
  });
  ({ brandId, categoryId, productId, skuId } = fixture);
});

test.afterAll(async () => {
  try {
    if (!localFixturesAllowed || !productId) return;
    await db.$transaction(async (tx) => {
      await tx.media.deleteMany({ where: { productId } });
      await tx.sku.deleteMany({ where: { productId } });
      await tx.product.delete({ where: { id: productId } });
      await tx.attribute.deleteMany({ where: { categoryId } });
      await tx.category.delete({ where: { id: categoryId } });
      await tx.brand.delete({ where: { id: brandId } });
    });
  } finally {
    await db.$disconnect();
  }
});

test("category discovery and product specifications show the same effective SKU facts", async ({
  page,
}) => {
  for (const width of [1440, 390]) {
    await test.step(`Facet-to-product journey at ${width}px`, async () => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/category/${key}`);
      if (width < 960)
        await page
          .getByRole("button", { name: "Filters", exact: true })
          .click();
      const filters = page.locator(".catalogue-filter-form");
      await filters.getByLabel("Ports", { exact: true }).selectOption("12");
      await filters
        .getByLabel("Connection", { exact: true })
        .selectOption("SFP");
      await expect(
        filters
          .getByLabel("Link speed", { exact: true })
          .locator('option[value="1000"]'),
      ).toHaveText("1000 Mbps");
      await filters
        .getByRole("button", { name: "Apply filters", exact: true })
        .click();
      await expect(page).toHaveURL(
        (url) =>
          url.pathname === `/category/${key}` &&
          url.searchParams.get("spec.ports") === "12" &&
          url.searchParams.get("spec.connection") === "SFP",
      );
      await expect(page.locator(".catalogue-result-count b")).toHaveText("1");
      await page
        .locator(".catalogue-products")
        .getByRole("link", {
          name: productName,
          exact: true,
        })
        .click();
      await expect(page).toHaveURL(
        (url) =>
          url.pathname === `/product/${key}` &&
          url.searchParams.get("sku") === skuId,
      );
      const table = page.locator(".product-spec-table");
      for (const [label, value] of [
        [/^ports$/i, "12"],
        [/^connection$/i, "SFP"],
        [/^link speed$/i, "1000"],
      ] as const) {
        const row = table.getByRole("row").filter({
          has: page.getByRole("rowheader", { name: label }),
        });
        await expect(row.getByRole("cell")).toHaveText(value);
      }
    });
  }
});

async function highlightFixture(page: Page) {
  await page.goto("/search");
  const input = page.getByRole("combobox", { name: "Search products" });
  await input.fill(key);
  const suggestions = page.locator(".search-results").getByRole("option");
  await expect(suggestions).toHaveCount(1);
  await expect(suggestions.first()).toContainText(productName);
  await input.press("ArrowDown");
  await expect(input).toHaveAttribute("aria-activedescendant", /^suggestion-/);
  return input;
}

async function expectFullSearch(page: Page) {
  await expect(page).toHaveURL(
    (url) => url.pathname === "/search" && url.searchParams.get("q") === key,
  );
  await expect(page.locator(".catalogue-products")).toContainText(productName);
}

test("explicit search ignores suggestion highlights while input Enter opens the active suggestion", async ({
  page,
}) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await test.step(`Explicit search while suggestions are open at ${width}px`, async () => {
      await highlightFixture(page);
      await expect(page.locator(".search-panel")).toBeVisible();
      await page.getByRole("button", { name: "Submit search" }).click();
      await expectFullSearch(page);
    });

    await test.step(`Explicit search after outside dismissal at ${width}px`, async () => {
      await highlightFixture(page);
      // The mobile suggestion panel overlays the page heading; the header's
      // empty outer margin remains a real pointer target outside the form.
      await page.locator(".site-header").click({ position: { x: 1, y: 1 } });
      await expect(page.locator(".search-panel")).toBeHidden();
      await page.getByRole("button", { name: "Submit search" }).click();
      await expectFullSearch(page);
    });

    await test.step(`Keyboard activation of the search button at ${width}px`, async () => {
      const input = await highlightFixture(page);
      await input.press("Tab");
      await expect(
        page.getByRole("button", { name: "Clear search" }),
      ).toBeFocused();
      await page.keyboard.press("Tab");
      const submit = page.getByRole("button", { name: "Submit search" });
      await expect(submit).toBeFocused();
      await submit.press("Enter");
      await expectFullSearch(page);
    });

    await test.step(`Input Enter selects the visible suggestion at ${width}px`, async () => {
      const input = await highlightFixture(page);
      await input.press("Enter");
      await expect(page).toHaveURL(
        (url) =>
          url.pathname === `/product/${key}` &&
          url.searchParams.get("sku") === skuId,
      );
      await expect(
        page.getByRole("heading", { level: 1, name: productName }),
      ).toBeVisible();
    });
  }
});

test("a manual emirate choice survives a delayed location-detection result", async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.geolocation, "getCurrentPosition", {
      configurable: true,
      value: (success: PositionCallback) => {
        (
          window as unknown as { __resolveDiscoveryLocation: () => void }
        ).__resolveDiscoveryLocation = () =>
          success({
            coords: {
              latitude: 25.2048,
              longitude: 55.2708,
              accuracy: 10,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
              toJSON: () => ({}),
            },
            timestamp: Date.now(),
            toJSON: () => ({}),
          });
      },
    });
  });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/search");
  await page.getByRole("button", { name: /Delivery location:/ }).click();
  const dialog = page.getByRole("dialog", { name: "Your delivery location" });
  await dialog
    .getByRole("button", { name: "Use my location", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Finding your location…", exact: true }),
  ).toBeDisabled();
  await dialog
    .getByLabel("Delivery emirate", { exact: true })
    .selectOption("Sharjah");
  await page.evaluate(async () => {
    const resolve = (
      window as unknown as { __resolveDiscoveryLocation?: () => void }
    ).__resolveDiscoveryLocation;
    if (!resolve)
      throw new Error("The fixture location callback was not registered.");
    await resolve();
  });
  const cookie = (await context.cookies()).find(
    ({ name }) => name === "ift-location",
  );
  expect(JSON.parse(decodeURIComponent(cookie?.value ?? "{}"))).toEqual({
    country: "AE",
    emirate: "Sharjah",
    source: "manual",
  });
  await expect(
    dialog.getByLabel("Delivery emirate", { exact: true }),
  ).toHaveValue("Sharjah");
  await expect(
    dialog.getByRole("button", { name: "Use my location", exact: true }),
  ).toBeEnabled();
  await dialog
    .getByRole("button", { name: "Continue shopping", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Delivery location: UAE, Sharjah",
      exact: true,
    }),
  ).toBeVisible();
});

test("the enlarged product image dialog has an accessible name and returns keyboard focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`/product/${key}?sku=${skuId}`);
  const trigger = page.getByRole("button", {
    name: "Enlarge product image",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleName(`Product image: ${productName}`);
  const accessibility = await new AxeBuilder({ page })
    .include(".image-dialog[open]")
    .analyze();
  expect(
    accessibility.violations.filter(({ impact }) =>
      ["critical", "serious"].includes(impact ?? ""),
    ),
  ).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});
