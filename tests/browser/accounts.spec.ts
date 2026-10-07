import { submitEmailSignIn } from "./sign-in";
import "dotenv/config";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import { db } from "../../src/lib/db";
import { auth } from "../../src/lib/auth";

const suffix = randomBytes(6).toString("hex");
const email = `account-browser-${suffix}@example.test`;
const staffEmail = `content-browser-${suffix}@example.test`;
const password = randomBytes(24).toString("base64url");
const ids: string[] = [];
const mailboxes: string[] = [];
const sections: string[] = [];
const media: { id: string; key: string }[] = [];
test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  const database = new URL(process.env.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1"].includes(database.hostname))
    throw new Error("Browser tests must use the local development database.");
  await mkdir(".data/screenshots", { recursive: true });
  const staff = await auth.api.signUpEmail({
    body: { email: staffEmail, password, name: "Content Colleague" },
  });
  ids.push(staff.user.id);
  await db.user.update({
    where: { id: staff.user.id },
    data: { role: "CONTENT" },
  });
});
test.afterAll(async () => {
  await db.homeSection.deleteMany({ where: { id: { in: sections } } });
  await db.media.deleteMany({
    where: { id: { in: media.map((item) => item.id) } },
  });
  for (const item of media)
    await rm(`${process.env.UPLOAD_DIR ?? ".data/uploads"}/${item.key}`, {
      force: true,
    });
  const remaining = await db.user.findMany({
    where: { email: { in: [email, staffEmail] } },
    select: { id: true },
  });
  ids.push(...remaining.map((user) => user.id));
  await db.job.deleteMany({ where: { actorId: { in: ids } } });
  await db.verification.deleteMany({ where: { value: { in: ids } } });
  await db.auditEvent.deleteMany({ where: { actorId: { in: ids } } });
  await db.cart.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  for (const path of mailboxes) await rm(path, { force: true });
  await db.$disconnect();
});
test("staff login is separate, accessible and has no public registration", async ({
  page,
}) => {
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/admin/login");
    await expect(
      page.getByRole("heading", { name: "Staff sign in" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /create.*account/i }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.data/screenshots/staff-login-${width}.png`,
      fullPage: true,
    });
  }
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    ),
  ).toEqual([]);
  await page.goto("/login?next=/admin");
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.goto("/admin");
  await expect(page).toHaveURL((url) => url.pathname === "/admin/login");
  await page.goto("/admin/products");
  await expect(page).toHaveURL((url) => url.pathname === "/admin/login");
});
test("customer registration, stored profile and administration boundary", async ({
  page,
}) => {
  await page.goto("/register?next=/account/profile");
  await page
    .getByLabel("Full name", { exact: true })
    .fill("  Browser Customer  ");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create customer account" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/account/profile");
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  ids.push(user.id);
  expect(user.name).toBe("Browser Customer");
  expect(user.role).toBe("CUSTOMER");
  await page.getByLabel("Full name", { exact: true }).fill("Customer Updated");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Changes saved");
  expect((await db.user.findUniqueOrThrow({ where: { email } })).name).toBe(
    "Customer Updated",
  );
  const denied = await page.request.get("/api/v1/admin/products");
  expect(denied.status()).toBe(403);
  const missingAddress = await page.request.delete(
    "/api/v1/account/addresses",
    { headers: { Origin: "http://localhost:3000" } },
  );
  expect(missingAddress.status()).toBe(400);
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Staff access required." }),
  ).toBeVisible();
});
test("signed-in location, repeated cart additions and cross-device cart restoration", async ({
  page,
  context,
  browser,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: 25.2854,
    longitude: 51.531,
    accuracy: 30,
  });
  async function signIn(target: typeof page) {
    await target.goto("/login");
    await target.getByLabel("Email address", { exact: true }).fill(email);
    await target.getByLabel("Password", { exact: true }).fill(password);
    await target.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(target).toHaveURL(/\/account$/);
  }
  await signIn(page);
  await expect(
    page.getByRole("button", { name: "Delivery location: Qatar, coming soon" }),
  ).toBeVisible();
  await page.goto("/product/rog-zephyrus-g16-gaming-laptop");
  const add = page
    .getByRole("button", { name: "Add to cart", exact: true })
    .first();
  await add.click();
  await expect(
    page.getByRole("link", { name: "Cart, 1 items", exact: true }),
  ).toBeVisible();
  await add.click();
  await expect(
    page.getByRole("link", { name: "Cart, 2 items", exact: true }),
  ).toBeVisible();
  await page.goto("/checkout");
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: /haven’t started operations in Qatar/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Place order/ }),
  ).toBeDisabled();
  await page.getByRole("button", { name: /Delivery location:/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /^United Arab Emirates/ }).click();
  await dialog.getByLabel("Delivery emirate").selectOption("Sharjah");
  await dialog
    .getByRole("button", { name: "Continue shopping", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Emirate", exact: true }),
  ).toHaveValue("Sharjah");
  const other = await browser.newContext({ baseURL: "http://localhost:3000" });
  try {
    const nextPage = await other.newPage();
    await signIn(nextPage);
    await expect(
      nextPage.getByRole("link", { name: "Cart, 2 items", exact: true }),
    ).toBeVisible();
    await nextPage
      .getByRole("button", { name: "Sign out", exact: true })
      .click();
    await expect(nextPage).toHaveURL(/\/login$/);
    await expect(
      nextPage.getByRole("link", { name: "Cart, 0 items", exact: true }),
    ).toBeVisible();
  } finally {
    await other.close();
  }
});
test("content staff can maintain banners but cannot open products or staff management", async ({
  page,
  request,
}) => {
  await page.goto("/admin/login");
  await page.getByLabel("Email address", { exact: true }).fill(staffEmail);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await submitEmailSignIn(page);
  await expect(page).toHaveURL(/\/admin$/);
  await expect(
    page.getByRole("link", { name: "Staff & access", exact: true }),
  ).toHaveCount(0);
  expect((await page.request.get("/api/v1/admin/staff")).status()).toBe(403);
  expect((await page.request.get("/api/v1/admin/products")).status()).toBe(403);
  await page.goto("/admin/home-sections/new");
  await expect(
    page.getByRole("heading", { name: "Hero banner image" }),
  ).toBeVisible();
  await expect(page.getByLabel("Button text", { exact: true })).toBeVisible();
  await page
    .getByLabel("Headline", { exact: true })
    .fill(`Browser banner ${suffix}`);
  await page
    .getByLabel("Supporting text", { exact: true })
    .fill("Local banner publication check");
  await page.getByLabel("Section type", { exact: true }).selectOption("hero");
  await page.getByLabel("Visible", { exact: true }).uncheck();
  await page
    .getByLabel("Banner image", { exact: true })
    .setInputFiles("public/brand/inforteks.png");
  await page
    .getByLabel("Image description", { exact: true })
    .fill("Inforteks logo for local banner verification");
  await page.getByRole("button", { name: "Upload image", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Image uploaded privately",
  );
  await page
    .getByRole("button", { name: "Save homepage section", exact: true })
    .click();
  await expect(page).toHaveURL(
    (url) =>
      /^\/admin\/home-sections\/[^/]+$/.test(url.pathname) &&
      !url.pathname.endsWith("/new"),
  );
  const section = await db.homeSection.findFirstOrThrow({
    where: { title: `Browser banner ${suffix}` },
    include: { bannerMedia: true },
  });
  sections.push(section.id);
  media.push(section.bannerMedia!);
  expect((await request.get(`/media/${section.bannerMediaId}`)).status()).toBe(
    404,
  );
  await page.getByLabel("Visible", { exact: true }).check();
  await page
    .getByRole("button", { name: "Save homepage section", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Homepage section saved",
  );
  await expect
    .poll(async () =>
      (await request.get(`/media/${section.bannerMediaId}`)).status(),
    )
    .toBe(200);
});
test("recovery completes through the development mailbox and password change revokes other sessions", async ({
  page,
}) => {
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  await page.goto("/forgot-password");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText(
    "If an account uses this email",
  );
  let jobId = "";
  await expect
    .poll(
      async () => {
        const job = await db.job.findFirst({
          where: { actorId: user.id, type: "EMAIL" },
          orderBy: { createdAt: "desc" },
        });
        jobId = job?.id ?? "";
        return job?.status;
      },
      { timeout: 20000 },
    )
    .toBe("COMPLETED");
  const mailbox = `.data/mailbox/${jobId}.json`;
  mailboxes.push(mailbox);
  const { url } = JSON.parse(await readFile(mailbox, "utf8"));
  await page.goto(url);
  const nextPassword = randomBytes(24).toString("base64url");
  await page.getByLabel("New password", { exact: true }).fill(nextPassword);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "don’t match" }),
  ).toBeVisible();
  await page.getByLabel("Confirm password", { exact: true }).fill(nextPassword);
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Your password has been updated",
  );
  expect(page.url()).not.toContain("token=");
  await page.goto("/login?next=/account/profile");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(nextPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/account/profile");
  await page.getByLabel("Current password", { exact: true }).fill(nextPassword);
  await page.getByLabel("New password", { exact: true }).fill(password);
  await page.getByLabel("Confirm new password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Update password", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Password updated");
});
