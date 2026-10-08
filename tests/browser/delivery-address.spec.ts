import "dotenv/config";
import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { db } from "../../src/lib/db";
import { auth } from "../../src/lib/auth";
const suffix = randomBytes(6).toString("hex");
const email = `address-browser-${suffix}@example.test`;
const password = randomBytes(24).toString("base64url");
let userId = "";
test.beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/inforteks"
  )
    throw new Error("Use the local development database.");
  const user = await auth.api.signUpEmail({
    body: { email, password, name: "Address Browser Customer" },
  });
  userId = user.user.id;
});
test.afterAll(async () => {
  if (userId) {
    await db.cart.deleteMany({ where: { userId } });
    await db.user.delete({ where: { id: userId } });
  }
  await db.$disconnect();
});
test.beforeEach(async ({ page }) => {
  await page.goto("/login?next=/account/addresses");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/account/addresses");
});
test("delivery pin requires confirmation, addresses persist/edit and saved details fill checkout", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: 25.1972,
    longitude: 55.2744,
    accuracy: 18,
  });
  await page
    .getByLabel("Full name", { exact: true })
    .fill("Delivery Browser Customer");
  await page
    .getByLabel("UAE mobile number", { exact: true })
    .fill("+971501234567");
  await page.getByLabel("City", { exact: true }).fill("Dubai");
  await page
    .getByLabel("Area / neighbourhood", { exact: true })
    .fill("Downtown Dubai");
  await page
    .getByLabel("Zone / district (optional)", { exact: true })
    .fill("Business district");
  await page
    .getByLabel("Building, street & apartment", { exact: true })
    .fill("Test tower, apartment 24");
  await page
    .getByRole("button", {
      name: "Use my current delivery location",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("link", { name: "Check delivery pin in Google Maps" }),
  ).toHaveAttribute("href", /25\.1972,55\.2744/);
  await page
    .getByRole("button", { name: "Save delivery address", exact: true })
    .click();
  expect(await db.address.count({ where: { userId } })).toBe(0);
  await page.getByRole("checkbox", { name: /I checked the pin/ }).check();
  await page
    .getByRole("button", { name: "Save delivery address", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Delivery address saved.",
  );
  const saved = await db.address.findFirstOrThrow({ where: { userId } });
  expect(saved).toMatchObject({
    area: "Downtown Dubai",
    zone: "Business district",
    postalCode: null,
    location: {
      latitude: 25.1972,
      longitude: 55.2744,
      accuracy: 18,
      confirmed: true,
    },
  });
  await page.reload();
  await expect(
    page.getByRole("button", { name: /Delivery location:.*Downtown Dubai/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit address", exact: true }).click();
  await expect(
    page.getByLabel("Area / neighbourhood", { exact: true }),
  ).toHaveValue("Downtown Dubai");
  await expect(
    page.getByRole("checkbox", { name: /I checked the pin/ }),
  ).not.toBeChecked();
  await page
    .getByRole("button", { name: "Remove delivery pin", exact: true })
    .click();
  await page
    .getByLabel("Area / neighbourhood", { exact: true })
    .fill("Al Barsha");
  await page
    .getByRole("button", { name: "Save delivery address", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Delivery address saved.",
  );
  expect(
    await db.address.findUnique({ where: { id: saved.id } }),
  ).toMatchObject({ area: "Al Barsha", location: null });
  await page.goto("/product/rog-zephyrus-g16-gaming-laptop");
  await page
    .getByRole("button", { name: "Add to cart", exact: true })
    .first()
    .click();
  await expect(page.getByRole("status")).toContainText("Added to your cart");
  await page.goto("/checkout");
  await page
    .getByLabel("Saved delivery address", { exact: true })
    .selectOption(saved.id);
  await expect(
    page.getByRole("button", { name: /Delivery location:.*Al Barsha/ }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Area / neighbourhood", { exact: true }),
  ).toHaveValue("Al Barsha");
  await expect(
    page.getByLabel("Building, street & apartment", { exact: true }),
  ).toHaveValue("Test tower, apartment 24");
  await page.setViewportSize({ width: 390, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".data/screenshots/delivery-address-mobile.png",
    fullPage: true,
  });
});
test("automatic suggestions require a click and leave missing postal codes blank; permission denial allows manual entry", async ({
  page,
  context,
}) => {
  let requests = 0;
  const capability = Promise.withResolvers<void>();
  await page.route("**/api/v1/storefront/location", async (route) => {
    if (route.request().method() === "GET") {
      await capability.promise;
      return route.fulfill({ json: { data: { enabled: true } } });
    }
    requests++;
    expect(route.request().postDataJSON().consent).toBe(true);
    return route.fulfill({
      json: {
        data: {
          suggestion: {
            emirate: "Dubai",
            city: "Dubai",
            area: "Downtown Dubai",
            line1: "Example Street",
          },
          attribution: "Google Maps",
        },
      },
    });
  });
  await page.reload();
  const detect = page.getByRole("button", {
    name: "Use my current delivery location",
    exact: true,
  });
  // A slow capability response must not let a click capture lookup=false and
  // silently skip address suggestions after discovering that lookup is enabled.
  await expect(detect).toBeDisabled();
  capability.resolve();
  await expect(detect).toBeEnabled();
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: 25.1972,
    longitude: 55.2744,
    accuracy: 15,
  });
  expect(requests).toBe(0);
  await detect.click();
  await expect(
    page.getByLabel("Area / neighbourhood", { exact: true }),
  ).toHaveValue("Downtown Dubai");
  await expect(
    page.getByLabel("Postal / ZIP code (if applicable)", { exact: true }),
  ).toHaveValue("");
  expect(requests).toBe(1);
  await page.getByRole("checkbox", { name: /I checked the pin/ }).check();
  await page
    .getByLabel("Building, street & apartment", { exact: true })
    .fill("Customer-confirmed building, apartment 22");
  await expect(
    page.getByRole("checkbox", { name: /I checked the pin/ }),
  ).not.toBeChecked();
  await page
    .getByRole("button", { name: "Remove delivery pin", exact: true })
    .click();
  await page.evaluate(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (_success: unknown, error: (e: unknown) => void) =>
          error({ code: 1 }),
      },
    });
  });
  await page
    .getByRole("button", {
      name: "Use my current delivery location",
      exact: true,
    })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Location wasn’t shared",
  );
  await expect(
    page.getByLabel("Area / neighbourhood", { exact: true }),
  ).toBeEnabled();
  expect(
    (
      await page.request.post("/api/v1/storefront/location", {
        headers: { Origin: "https://unrelated.example" },
        data: { latitude: 25, longitude: 55, consent: true },
      })
    ).status(),
  ).toBe(403);
});
