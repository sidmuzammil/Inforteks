import "dotenv/config";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("search has scoped results, empty feedback, dismissal and no stale selection", async ({
  page,
}) => {
  await page.goto("/");
  const input = page.getByRole("combobox", { name: "Search products" });
  await page.getByLabel("Search department").selectOption("laptops");
  await input.fill("ASUS");
  await expect(page.locator(".search-results li").first()).toBeVisible();
  await input.press("ArrowDown");
  await input.fill("zz-no-product-92837");
  await expect(page.locator(".search-caption")).toContainText(
    "No matching products",
  );
  await expect(input).not.toHaveAttribute("aria-activedescendant");
  await input.press("Escape");
  await expect(page.locator(".search-panel")).toBeHidden();
  await input.fill("ASUS");
  await expect(page.locator(".search-results li").first()).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(input).toBeEmpty();
  await input.fill("ASUS");
  await page.getByRole("button", { name: "Submit search" }).click();
  await expect(page).toHaveURL(/category=laptops/);
  await page.getByLabel("Sort products").selectOption("price-asc");
  await page
    .locator(".catalogue-toolbar")
    .getByRole("button", { name: "Apply", exact: true })
    .click();
  await expect(page).toHaveURL(/category=laptops/);
});
test("every rendered shopping shelf card remains reachable at desktop and mobile widths", async ({
  page,
}) => {
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 950 });
    await page.goto("/");
    const shelves = page.locator(".marketplace-shelf").filter({
      has: page.locator(".marketplace-product-card"),
    });
    await expect(shelves.first()).toBeVisible();
    const cardCounts = await shelves.evaluateAll((sections) =>
      sections.map(
        (section) =>
          section.querySelectorAll(".marketplace-product-card").length,
      ),
    );
    // The local seed has full shelves; exercise cards beyond legacy CSS cutoffs.
    expect(Math.max(...cardCounts)).toBeGreaterThanOrEqual(5);
    for (const shelf of await shelves.all()) {
      for (const card of await shelf
        .locator(".marketplace-product-card")
        .all()) {
        await expect(card).toBeVisible();
        await card.scrollIntoViewIfNeeded();
        await expect(card).toBeInViewport({ ratio: 0.5 });
        const productLink = card.locator(".product-name");
        await expect(productLink).toBeVisible();
        await expect(productLink).toHaveAttribute("href", /^\/product\//);
      }
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("department navigation fits every viewport and keyboard focus returns when dismissed", async ({
  page,
}) => {
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: "Compare, 0 items", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "All departments" }).click();
    await expect(page.locator("#department-menu")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Close departments" }).click();
    await expect(page.locator("#department-menu")).toBeHidden();
    const departmentButton = page.getByRole("button", {
      name: "All departments",
    });
    await expect(departmentButton).toBeFocused();
    await page
      .getByRole("button", { name: "All departments" })
      .press("ArrowDown");
    await expect(
      page.locator("#department-menu").getByRole("link").first(),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator("#department-menu")).toBeHidden();
    await expect(departmentButton).toBeFocused();
  }
  const results = await new AxeBuilder({ page })
    .include(".site-header")
    .analyze();
  expect(
    results.violations.filter((v) =>
      ["critical", "serious"].includes(v.impact ?? ""),
    ),
  ).toEqual([]);
});

test("keyboard users reach earlier departments' children on desktop and mobile", async ({
  page,
}) => {
  const database = new URL(process.env.DATABASE_URL ?? "");
  if (
    !["localhost", "127.0.0.1"].includes(database.hostname) ||
    database.pathname !== "/inforteks"
  )
    throw new Error("Department fixtures require local development data.");
  const { db } = await import("../../src/lib/db");
  const key = `keyboard-department-${Date.now()}`;
  const parent = await db.category.create({
    data: {
      name: "Local keyboard department fixture",
      slug: key,
      visible: true,
      position: -1000,
      children: {
        create: {
          name: "Local keyboard child fixture",
          slug: `${key}-child`,
          visible: true,
        },
      },
    },
    include: { children: true },
  });
  const parents = [parent];
  try {
    parents.push(
      await db.category.create({
        data: {
          name: "Local keyboard second department fixture",
          slug: `${key}-second`,
          visible: true,
          position: -999,
          children: {
            create: {
              name: "Local keyboard second child fixture",
              slug: `${key}-second-child`,
              visible: true,
            },
          },
        },
        include: { children: true },
      }),
    );
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 844 });
      for (const [index, parent] of parents.entries()) {
        const child = parent.children[0];
        await page.goto("/");
        await page
          .getByRole("button", { name: "All departments" })
          .press("ArrowDown");
        const menu = page.locator("#department-menu");
        const parentLink = menu.locator(".mega-category-link").filter({
          hasText: parent.name,
        });
        const expand = menu.getByRole("button", {
          name: `Show ${parent.name} subcategories`,
        });
        if (index > 0) {
          // Move past the first parent's expand control (and its inline
          // mobile child) using the real keyboard tab order.
          for (let step = 0; step < (width > 640 ? 2 : 3); step++)
            await page.keyboard.press("Tab");
        }
        await expect(parentLink).toBeFocused();
        // This parent precedes other roots, so ordinary tabbing would change
        // the desktop panel before its child links could receive focus.
        expect(
          await menu.locator(".mega-category-link").count(),
        ).toBeGreaterThan(2);
        if (width > 640) {
          await expect(expand).toHaveAttribute(
            "aria-controls",
            "department-panel",
          );
          const childLink = menu
            .locator("#department-panel")
            .getByRole("link", {
              name: child.name,
              exact: true,
            });
          await parentLink.press("ArrowRight");
          await expect(childLink).toBeFocused();
          await childLink.press("ArrowLeft");
          await expect(parentLink).toBeFocused();
          await page.keyboard.press("Tab");
          await expect(expand).toBeFocused();
          await expand.press("Enter");
          await expect(childLink).toBeFocused();
          await childLink.press("Enter");
        } else {
          await expect(expand).toHaveAttribute(
            "aria-controls",
            `department-children-${parent.slug}`,
          );
          const childLink = menu
            .locator(`#department-children-${parent.slug}`)
            .getByRole("link", {
              name: child.name,
              exact: true,
            });
          await page.keyboard.press("Tab");
          await expect(expand).toBeFocused();
          await expect(childLink).toBeVisible();
          await expand.press("Enter");
          await expect(childLink).toBeHidden();
          await expand.press("Enter");
          await expect(childLink).toBeVisible();
          await page.keyboard.press("Tab");
          await expect(childLink).toBeFocused();
          await childLink.press("Enter");
        }
        await expect(page).toHaveURL(new RegExp(`/category/${child.slug}$`));
        await expect(
          page.getByRole("heading", { level: 1, name: child.name }),
        ).toBeVisible();
      }
    }
  } finally {
    for (const parent of parents) {
      await db.category.deleteMany({ where: { parentId: parent.id } });
      await db.category.delete({ where: { id: parent.id } });
    }
    await db.$disconnect();
  }
});

test("mobile filters keep keyboard focus inside the drawer and preserve the scoped search", async ({
  page,
}) => {
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/search?q=ASUS&category=laptops");
    const trigger = page.getByRole("button", { name: "Filters", exact: true });
    const filters = page.getByRole("dialog", { name: "Product filters" });
    await trigger.click();
    await expect(filters).toBeVisible();
    await expect(
      filters.getByRole("button", { name: "Close filters" }),
    ).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    expect(
      await filters.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(filters).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await filters.getByLabel("Minimum price", { exact: true }).fill("1");
    await filters.getByLabel("Maximum price", { exact: true }).fill("10000");
    await filters
      .getByRole("button", { name: "Apply filters", exact: true })
      .click();
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === "/search" &&
        url.searchParams.get("q") === "ASUS" &&
        url.searchParams.get("category") === "laptops" &&
        url.searchParams.get("min") === "1" &&
        url.searchParams.get("max") === "10000",
    );
    await expect(
      page.locator(".catalogue-products .product-card").first(),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Remove From AED 1 filter", exact: true })
      .click();
    await expect(page).toHaveURL(
      (url) =>
        !url.searchParams.has("min") &&
        url.searchParams.get("max") === "10000" &&
        url.searchParams.get("q") === "ASUS" &&
        url.searchParams.get("category") === "laptops",
    );
    await page
      .locator(".active-filters")
      .getByRole("link", { name: "Clear all", exact: true })
      .click();
    await expect(page).toHaveURL(
      (url) =>
        !url.searchParams.has("min") &&
        !url.searchParams.has("max") &&
        url.searchParams.get("q") === "ASUS" &&
        url.searchParams.get("category") === "laptops",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
