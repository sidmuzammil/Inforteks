import { expect, test, type Page } from "@playwright/test";

// Browser cases share one local/CI IP. Exercise the real rate-limit response
// and honor its bounded retry window; never alter production auth limits.
export async function submitEmailSignIn(
  page: Page,
  button = "Sign in to workspace",
) {
  async function submit() {
    const response = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/auth/sign-in/email" &&
        r.request().method() === "POST",
    );
    await page.getByRole("button", { name: button, exact: true }).click();
    return response;
  }
  let response = await submit();
  if (response.status() === 429) {
    await expect(
      page.getByRole("alert").filter({ hasText: "Too many attempts" }),
    ).toContainText("Too many attempts");
    const seconds = Number(response.headers()["x-retry-after"]);
    expect(Number.isFinite(seconds) && seconds >= 0 && seconds <= 60).toBe(
      true,
    );
    test.setTimeout(test.info().timeout + 65000);
    console.log(
      "Sign-in returned HTTP 429; respecting the server retry window.",
    );
    await page.waitForTimeout(seconds * 1000 + 500);
    response = await submit();
  }
  expect(response.status(), "Email sign-in HTTP status").toBe(200);
}
