import "dotenv/config";
import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { auth } from "../../src/lib/auth";
import { db } from "../../src/lib/db";
import { submitEmailSignIn } from "./sign-in";

const email = `payment-settings-${randomUUID()}@example.test`;
const password = randomUUID();
let userId = "";

test.beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    url.pathname !== "/inforteks" ||
    !["127.0.0.1", "localhost"].includes(url.hostname)
  )
    throw new Error(
      "Payment settings fixtures require the local development database.",
    );
  userId = (
    await auth.api.signUpEmail({
      body: { name: "Local payment settings", email, password },
    })
  ).user.id;
  await db.user.update({ where: { id: userId }, data: { role: "OWNER" } });
});

test.afterAll(async () => {
  if (userId) await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
});

test("payment setup reflects enabled checkout methods, keeps unavailable providers disabled and remains permission protected", async ({
  page,
}) => {
  const methodsResponse = await page.request.get(
    "/api/v1/storefront/payment-methods",
  );
  expect(methodsResponse.status()).toBe(200);
  const methods: string[] = (await methodsResponse.json()).data;
  await page.goto("/admin/login");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await submitEmailSignIn(page);
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/admin/settings");

  const setup = page.getByRole("region", { name: "Payment setup" });
  await expect(setup).toBeVisible();
  const offline = setup.getByRole("article", { name: "Offline payments" });
  await expect(
    offline.getByText(methods.includes("OFFLINE") ? "Enabled" : "Disabled", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    setup.getByText("Development simulator enabled", { exact: true }),
  ).toHaveCount(methods.includes("SIMULATOR") ? 1 : 0);
  for (const name of ["Card setup unavailable", "Refund setup unavailable"])
    await expect(setup.getByRole("button", { name })).toBeDisabled();
  await expect(setup.locator("input, select, textarea, form")).toHaveCount(0);
  await expect(setup).toContainText("Quote-only products create an inquiry");

  await page
    .getByText("What is needed before accepting card payments?", {
      exact: true,
    })
    .focus();
  await page.keyboard.press("Enter");
  await expect(
    setup.getByText(
      "Provider credentials are never entered or saved on this page.",
      { exact: true },
    ),
  ).toBeVisible();

  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const a11y = await new AxeBuilder({ page })
      .include('[aria-labelledby="payment-setup-title"]')
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(a11y.violations).toEqual([]);
    if (width === 1440 || width === 390)
      await setup.screenshot({
        path: `.data/payment-settings-${width === 1440 ? "desktop" : "mobile"}.png`,
      });
  }

  await db.user.update({ where: { id: userId }, data: { role: "SALES" } });
  await page.goto("/admin/settings");
  await expect(
    page.getByRole("heading", { name: "Permission required." }),
  ).toBeVisible();
  await expect(setup).toHaveCount(0);
});
