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
test("mobile department panel stays within the viewport and keyboard can close it", async ({
  page,
}) => {
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await page.getByRole("button", { name: "All departments" }).click();
    await expect(page.locator("#department-menu")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Close departments" }).click();
    await expect(page.locator("#department-menu")).toBeHidden();
    await page
      .getByRole("button", { name: "All departments" })
      .press("ArrowDown");
    await page.keyboard.press("Escape");
    await expect(page.locator("#department-menu")).toBeHidden();
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
