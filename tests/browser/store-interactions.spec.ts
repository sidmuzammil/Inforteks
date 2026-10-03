import { test, expect } from "@playwright/test";

test("department navigation supports hover, pointer travel, outside click and keyboard", async ({
  page,
}) => {
  await page.goto("/");
  const button = page.getByRole("button", { name: "All departments" });
  const menu = page.locator("#department-menu");
  await button.hover();
  await expect(menu).toBeVisible();
  await menu.getByRole("link", { name: "Laptops", exact: true }).hover();
  await expect(menu).toBeVisible();
  await page.getByRole("combobox", { name: "Search products" }).hover();
  await expect(menu).toBeHidden();
  await button.focus();
  await page.keyboard.press("ArrowDown");
  await expect(menu.locator("a").first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(button).toBeFocused();
  await button.click();
  await expect(menu).toBeVisible();
  await page.getByRole("combobox", { name: "Search products" }).click();
  await expect(menu).toBeHidden();
});
test("country picker remembers selection and explains countries that are coming soon", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: /Delivery location:/ }).click();
  const dialog = page.getByRole("dialog", { name: "Your delivery location" });
  for (const country of ["Saudi Arabia", "Qatar", "Oman"]) {
    await dialog
      .getByRole("button", { name: new RegExp(`^${country}`) })
      .click();
    await expect(dialog.getByRole("status")).toContainText(
      `haven’t started operations in ${country}`,
    );
  }
  await dialog
    .getByRole("button", { name: "Browse the UAE catalogue" })
    .click();
  await expect(
    page.getByRole("button", { name: /Delivery location: Oman, coming soon/ }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /Delivery location: Oman/ }).click();
  await dialog.getByRole("button", { name: /^United Arab Emirates/ }).click();
  await dialog.getByLabel("Delivery emirate").selectOption("Sharjah");
  await dialog
    .getByRole("button", { name: "Continue shopping", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Delivery location: UAE, Sharjah" }),
  ).toBeVisible();
  await page.context().addCookies([
    {
      name: "ift-location",
      value: encodeURIComponent(
        JSON.stringify({
          country: "AE",
          emirate: "Dubai",
          area: "Neighbourhood".repeat(7),
          source: "manual",
        }),
      ),
      url: "http://localhost:3000",
    },
  ]);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.reload();
  await expect(
    page.getByRole("button", { name: /Delivery location:.*Neighbourhood/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("permission-based detection suggests Qatar without saving coordinates", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: 25.2854,
    longitude: 51.531,
    accuracy: 30,
  });
  const response = await page.goto("/");
  expect(response?.headers()["permissions-policy"]).toContain(
    "geolocation=(self)",
  );
  await page.getByRole("button", { name: /Delivery location:/ }).click();
  await page.getByRole("button", { name: "Use my location" }).click();
  await expect(page.getByRole("dialog").getByRole("status")).toContainText(
    "haven’t started operations in Qatar",
  );
  const cookie = (await context.cookies()).find(
    (cookie) => cookie.name === "ift-location",
  );
  expect(JSON.parse(decodeURIComponent(cookie!.value))).toEqual({
    country: "QA",
    source: "detected",
  });
});
test("comparison is available on mobile, distinguishes configurations and tolerates damaged saved state", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 950 });
  await page.goto("/product/rog-zephyrus-g16-gaming-laptop");
  await page
    .getByRole("button", { name: "Compare product", exact: true })
    .click();
  await page
    .getByRole("button", { name: "32 ram / 1024 storage", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Compare product", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Compare, 2 items", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "At a glance" }),
  ).toBeVisible();
  const table = page.getByRole("table");
  await expect(table.locator("thead th")).toHaveCount(3);
  await expect(
    table.getByRole("rowheader", { name: "ram", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Show differences only").check();
  await expect(
    table.getByRole("rowheader", { name: "Brand", exact: true }),
  ).toHaveCount(0);
  await expect(
    table.getByRole("rowheader", { name: "ram", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Refresh prices" }).click();
  await page.reload();
  await expect(table.locator("thead th")).toHaveCount(3);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".data/screenshots/comparison-mobile.png",
    fullPage: true,
  });
  await page.evaluate(() =>
    localStorage.setItem(
      "ift-compare",
      JSON.stringify([null, {}, { skuId: 123 }]),
    ),
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Make an informed choice" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
