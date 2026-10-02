import "dotenv/config";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { db } from "../../src/lib/db";
import { auth } from "../../src/lib/auth";

const suffix = randomBytes(6).toString("hex");
const email = `google-browser-${suffix}@example.test`;
const states: string[] = [];
test.beforeAll(async () => {
  if (
    !["localhost", "127.0.0.1"].includes(
      new URL(process.env.DATABASE_URL ?? "").hostname,
    )
  )
    throw new Error("Browser tests require local development data");
  await mkdir(".data/screenshots", { recursive: true });
});
test.afterAll(async () => {
  const context = await auth.$context;
  for (const state of states)
    await context.internalAdapter.deleteVerificationByIdentifier(
      `auth-state:${state}`,
    );
  await db.user.deleteMany({ where: { email } });
  await db.$disconnect();
});
test("Google button is accessible on customer pages, absent for staff, and hands off to Google", async ({
  page,
}) => {
  for (const path of ["/login", "/register"]) {
    await page.goto(path);
    const configured = await page
      .getByRole("button", { name: "Continue with Google", exact: true })
      .count();
    test.skip(
      !configured,
      "Run with local-only Google test credentials to verify the enabled interface.",
    );
    await expect(
      page.getByRole("button", { name: "Continue with Google", exact: true }),
    ).toBeVisible();
  }
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.goto("/login?next=/checkout");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(
    accessibility.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    ),
  ).toEqual([]);
  await page.screenshot({
    path: ".data/screenshots/google-login-mobile.png",
    fullPage: true,
  });
  let providerUrl: URL | undefined;
  await page.route("https://accounts.google.com/**", async (route) => {
    providerUrl = new URL(route.request().url());
    states.push(providerUrl.searchParams.get("state")!);
    await route.fulfill({
      contentType: "text/html",
      body: "<h1>Intercepted Google handoff for local test</h1>",
    });
  });
  await page
    .getByRole("button", { name: "Continue with Google", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Intercepted Google handoff for local test",
    }),
  ).toBeVisible();
  expect(providerUrl?.searchParams.get("redirect_uri")).toBe(
    "http://localhost:3000/api/auth/callback/google",
  );
  expect(providerUrl?.searchParams.get("code_challenge_method")).toBe("S256");
  await page.goto("http://localhost:3000/admin/login");
  await expect(page.getByRole("button", { name: /Google/ })).toHaveCount(0);
  await page.goto("http://localhost:3000/login?error=account_not_linked");
  await expect(
    page.getByRole("alert").filter({ hasText: "existing password" }),
  ).toBeVisible();
});
test("Google-only customers are not asked for a nonexistent store password", async ({
  page,
}) => {
  const response = await page.request.post("/api/auth/sign-up/email", {
    headers: { Origin: "http://localhost:3000" },
    data: {
      name: "Google Browser Customer",
      email,
      password: randomBytes(24).toString("base64url"),
    },
  });
  expect(response.ok()).toBe(true);
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  // Model a provider-only customer locally; real OAuth handshakes are integration-tested.
  await db.account.deleteMany({ where: { userId: user.id } });
  await db.account.create({
    data: {
      id: `browser-${suffix}`,
      userId: user.id,
      accountId: `browser-${suffix}`,
      providerId: "google",
    },
  });
  await db.user.update({
    where: { id: user.id },
    data: { emailVerified: true },
  });
  await page.goto("/account/profile");
  await expect(
    page.getByText("You sign in with Google.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Current password", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Sign out other devices" }),
  ).toBeVisible();
  expect((await page.request.get("/api/v1/admin/products")).status()).toBe(403);
});
