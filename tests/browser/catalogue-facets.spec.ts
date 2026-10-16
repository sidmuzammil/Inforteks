import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test, type Locator } from "@playwright/test";
import { db } from "../../src/lib/db";

const key = `facets-browser-${Date.now()}-${randomUUID().slice(0, 8)}`;
const privateMarker = `${key}-excluded-facet`;
const privateCost = 91827364;
const names = {
  split: `${key} router with split configurations`,
  paid: `${key} eight-port wireless router`,
  quote: `${key} quote-only wireless router`,
  switch: `${key} sixteen-port switch`,
};
let localFixturesAllowed = false;
let brandId = "";
let categoryId = "";
let hiddenCategoryId = "";
let productIds: string[] = [];

test.beforeAll(async ({ baseURL }) => {
  const database = new URL(process.env.DATABASE_URL ?? "");
  const browser = new URL(baseURL ?? "");
  if (
    !["localhost", "127.0.0.1"].includes(database.hostname) ||
    database.pathname !== "/inforteks" ||
    !["localhost", "127.0.0.1"].includes(browser.hostname)
  )
    throw new Error("Catalogue facet fixtures require local development only.");
  localFixturesAllowed = true;

  // Commit the temporary fixture as one unit so setup failures leave no records.
  const fixture = await db.$transaction(async (tx) => {
    const brand = await tx.brand.create({
      data: { name: `${key} local fixture brand`, slug: key },
    });
    const category = await tx.category.create({
      data: {
        name: `${key} local networking fixture`,
        slug: key,
        attributes: {
          create: [
            { key: "ports", label: "Ports" },
            { key: "connection", label: "Connection" },
            { key: "wifi_standard", label: "Wi-Fi Standard" },
            { key: "speed", label: "Link speed", unit: "Mbps" },
            {
              key: "internal_note",
              label: "Non-filterable note",
              filterable: false,
            },
          ],
        },
      },
    });
    const hidden = await tx.category.create({
      data: {
        name: `${key} hidden local fixture`,
        slug: `${key}-hidden`,
        parentId: category.id,
        visible: false,
      },
    });
    const common = {
      description: "Temporary local browser fixture; not a retail listing.",
      brandId: brand.id,
      categoryId: category.id,
      status: "PUBLISHED",
      store: true,
    };
    const split = await tx.product.create({
      data: {
        ...common,
        name: names.split,
        slug: `${key}-split`,
        specs: { ports: 24, internal_note: "Not offered as a facet" },
        skus: {
          create: [
            {
              code: `${key}-split-wireless`,
              options: { ports: 12, connection: "Wireless" },
              specs: { ports: 4, wifi_standard: "Wi-Fi 6" },
              price: 10000,
              cost: privateCost,
            },
            {
              code: `${key}-split-wired`,
              options: { ports: 12, connection: "Wired" },
              specs: { ports: 8, wifi_standard: "Wi-Fi 5" },
              price: 12000,
            },
          ],
        },
      },
    });
    const paid = await tx.product.create({
      data: {
        ...common,
        name: names.paid,
        slug: `${key}-paid`,
        specs: { ports: 8, wifi_standard: "Wi-Fi 6" },
        skus: {
          create: {
            code: `${key}-paid`,
            options: { connection: "Wireless" },
            price: 24000,
            cost: privateCost,
          },
        },
      },
    });
    const quote = await tx.product.create({
      data: {
        ...common,
        name: names.quote,
        slug: `${key}-quote`,
        quoteOnly: true,
        specs: { ports: 8, wifi_standard: "Wi-Fi 7" },
        skus: {
          create: {
            code: `${key}-quote`,
            options: { connection: "Wireless" },
            price: null,
            cost: privateCost,
          },
        },
      },
    });
    const networkSwitch = await tx.product.create({
      data: {
        ...common,
        name: names.switch,
        slug: `${key}-switch`,
        specs: { ports: 16, speed: 1000, mount_type: "Rack" },
        skus: {
          create: {
            code: `${key}-switch`,
            options: { connection: "Wired" },
            price: 36000,
          },
        },
      },
    });
    const excludedIds: string[] = [];
    for (const reason of [
      "draft",
      "offline",
      "inactive",
      "unpriced",
      "hidden",
    ]) {
      const excluded = await tx.product.create({
        data: {
          ...common,
          name: `${key} excluded ${reason}`,
          slug: `${key}-${reason}`,
          status: reason === "draft" ? "DRAFT" : "PUBLISHED",
          store: reason !== "offline",
          categoryId: reason === "hidden" ? hidden.id : category.id,
          specs: { excluded_attribute: `${privateMarker}-${reason}` },
          skus: {
            create: {
              code: `${key}-${reason}`,
              active: reason !== "inactive",
              price: reason === "unpriced" ? null : 50000,
            },
          },
        },
      });
      excludedIds.push(excluded.id);
    }
    return {
      brandId: brand.id,
      categoryId: category.id,
      hiddenCategoryId: hidden.id,
      productIds: [
        split.id,
        paid.id,
        quote.id,
        networkSwitch.id,
        ...excludedIds,
      ],
    };
  });
  ({ brandId, categoryId, hiddenCategoryId, productIds } = fixture);
});

test.afterAll(async () => {
  try {
    if (!localFixturesAllowed || !categoryId) return;
    await db.$transaction(async (tx) => {
      await tx.sku.deleteMany({ where: { productId: { in: productIds } } });
      await tx.product.deleteMany({ where: { id: { in: productIds } } });
      await tx.attribute.deleteMany({ where: { categoryId } });
      await tx.category.delete({ where: { id: hiddenCategoryId } });
      await tx.category.delete({ where: { id: categoryId } });
      await tx.brand.delete({ where: { id: brandId } });
    });
  } finally {
    await db.$disconnect();
  }
});

function search(parameters: Record<string, string> = {}) {
  return `/search?${new URLSearchParams({ q: key, category: key, ...parameters })}`;
}

async function values(select: Locator) {
  return select
    .locator("option")
    .evaluateAll((options) =>
      options
        .map((option) => (option as HTMLOptionElement).value)
        .filter(Boolean),
    );
}

test("desktop facets follow category data, match one SKU and survive sort, paging and removal", async ({
  page,
}) => {
  const response = await page.goto(
    search({ sort: "newest", limit: "1", page: "2" }),
  );
  const html = await response!.text();
  expect(html).not.toContain(privateMarker);
  expect(html).not.toContain(String(privateCost));
  const form = page.locator(".catalogue-filter-form");
  await expect(form.getByLabel("Ports", { exact: true })).toBeVisible();
  expect(
    new Set(await values(form.getByLabel("Ports", { exact: true }))),
  ).toEqual(new Set(["4", "8", "16"]));
  expect(
    new Set(await values(form.getByLabel("Wi-Fi Standard", { exact: true }))),
  ).toEqual(new Set(["Wi-Fi 5", "Wi-Fi 6", "Wi-Fi 7"]));
  await expect(
    form
      .getByLabel("Link speed", { exact: true })
      .locator('option[value="1000"]'),
  ).toHaveText("1000 Mbps");
  await expect(form.getByLabel("Mount Type", { exact: true })).toBeVisible();
  await expect(
    form.getByLabel("Non-filterable note", { exact: true }),
  ).toHaveCount(0);
  await expect(form.locator('[name="spec.excluded_attribute"]')).toHaveCount(0);
  await expect(form.getByLabel("Memory", { exact: true })).toHaveCount(0);
  await expect(form.getByLabel("Storage", { exact: true })).toHaveCount(0);

  await form.getByLabel("Ports", { exact: true }).selectOption("8");
  await form.getByLabel("Connection", { exact: true }).selectOption("Wireless");
  await form
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get("q") === key &&
      url.searchParams.get("category") === key &&
      url.searchParams.get("sort") === "newest" &&
      url.searchParams.get("limit") === "1" &&
      url.searchParams.get("spec.ports") === "8" &&
      url.searchParams.get("spec.connection") === "Wireless" &&
      !url.searchParams.has("page"),
  );
  // The split router has each selected value, but on different SKUs.
  await expect(page.locator(".catalogue-result-count b")).toHaveText("2");

  await page
    .getByLabel("Sort products", { exact: true })
    .selectOption("price-asc");
  await page
    .locator(".catalogue-sort")
    .getByRole("button", { name: "Apply", exact: true })
    .click();
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get("sort") === "price-asc" &&
      url.searchParams.get("spec.ports") === "8" &&
      url.searchParams.get("spec.connection") === "Wireless",
  );
  await expect(page.locator(".catalogue-products")).toContainText(names.paid);
  expect(await page.content()).not.toContain(String(privateCost));
  await page.getByRole("link", { name: "Next page", exact: true }).click();
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get("page") === "2" &&
      url.searchParams.get("spec.ports") === "8" &&
      url.searchParams.get("spec.connection") === "Wireless" &&
      url.searchParams.get("sort") === "price-asc",
  );
  await expect(page.locator(".catalogue-products")).toContainText(names.quote);
  await expect(page.locator(".catalogue-products")).toContainText(
    "Request a quote",
  );
  await expect(page.locator(".catalogue-products")).not.toContainText(
    names.split,
  );

  await page.getByRole("link", { name: /Remove Ports.*8.*filter/ }).click();
  await expect(page).toHaveURL(
    (url) =>
      !url.searchParams.has("spec.ports") &&
      !url.searchParams.has("page") &&
      url.searchParams.get("spec.connection") === "Wireless" &&
      url.searchParams.get("q") === key &&
      url.searchParams.get("category") === key &&
      url.searchParams.get("sort") === "price-asc",
  );
  await expect(page.locator(".catalogue-result-count b")).toHaveText("3");
  await form.getByRole("link", { name: "Reset filters", exact: true }).click();
  await expect(page).toHaveURL(
    (url) =>
      ![...url.searchParams.keys()].some((parameter) =>
        parameter.startsWith("spec."),
      ) &&
      url.searchParams.get("q") === key &&
      url.searchParams.get("category") === key &&
      url.searchParams.get("sort") === "price-asc",
  );
  await expect(page.locator(".catalogue-result-count b")).toHaveText("4");
});

test("an empty facet combination retains controls and can be corrected", async ({
  page,
}) => {
  await page.goto(
    search({ "spec.ports": "16", "spec.connection": "Wireless" }),
  );
  await expect(
    page.getByRole("heading", { name: "No products found" }),
  ).toBeVisible();
  const form = page.locator(".catalogue-filter-form");
  await expect(form.getByLabel("Ports", { exact: true })).toHaveValue("16");
  await expect(form.getByLabel("Connection", { exact: true })).toHaveValue(
    "Wireless",
  );
  expect(
    new Set(await values(form.getByLabel("Ports", { exact: true }))),
  ).toEqual(new Set(["4", "8", "16"]));
  await form.getByLabel("Connection", { exact: true }).selectOption("Wired");
  await form
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect(page.locator(".catalogue-result-count b")).toHaveText("1");
  await expect(page.locator(".catalogue-products")).toContainText(names.switch);
});

test("mobile facets use a native modal and preserve scoped filters at narrow widths", async ({
  page,
}) => {
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(search({ sort: "price-desc", limit: "1", page: "2" }));
    const trigger = page.getByRole("button", { name: "Filters", exact: true });
    const dialog = page.getByRole("dialog", { name: "Product filters" });
    await trigger.click();
    await expect(dialog).toBeVisible();
    expect(
      await dialog.evaluate((element) => element.matches("dialog:modal")),
    ).toBe(true);
    await expect(
      dialog.getByRole("button", { name: "Close filters" }),
    ).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    expect(
      await dialog.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await dialog.getByLabel("Ports", { exact: true }).selectOption("8");
    await dialog
      .getByLabel("Connection", { exact: true })
      .selectOption("Wireless");
    await dialog
      .getByRole("button", { name: "Apply filters", exact: true })
      .click();
    await expect(page).toHaveURL(
      (url) =>
        url.searchParams.get("q") === key &&
        url.searchParams.get("category") === key &&
        url.searchParams.get("sort") === "price-desc" &&
        url.searchParams.get("spec.ports") === "8" &&
        url.searchParams.get("spec.connection") === "Wireless" &&
        !url.searchParams.has("page"),
    );
    await expect(page.locator(".catalogue-result-count b")).toHaveText("2");
    await trigger.click();
    await expect(dialog.getByLabel("Ports", { exact: true })).toHaveValue("8");
    await expect(dialog.getByLabel("Connection", { exact: true })).toHaveValue(
      "Wireless",
    );
    await page.keyboard.press("Escape");
    await page.getByRole("link", { name: /Remove Ports.*8.*filter/ }).click();
    await expect(page).toHaveURL(
      (url) =>
        !url.searchParams.has("spec.ports") &&
        url.searchParams.get("spec.connection") === "Wireless" &&
        url.searchParams.get("q") === key &&
        url.searchParams.get("category") === key &&
        url.searchParams.get("sort") === "price-desc",
    );
    await expect(page.locator(".catalogue-result-count b")).toHaveText("3");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
