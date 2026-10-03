import { expect, test } from "@playwright/test";

test("auth HTTP responses keep their privacy headers through Next.js", async ({
  request,
}) => {
  const session = await request.get("/api/auth/get-session");
  expect(session.status()).toBe(200);

  const forbidden = await request.post("/api/auth/sign-in/social", {
    headers: { Origin: "https://invalid.example" },
    data: { provider: "google" },
  });
  expect(forbidden.status()).toBe(403);

  const callback = await request.get(
    "/api/auth/callback/google?error=access_denied",
    { maxRedirects: 0 },
  );
  expect(callback.status()).toBe(302);

  for (const response of [session, forbidden, callback]) {
    expect(response.headers()["referrer-policy"]).toBe("no-referrer");
    expect(response.headers()["cache-control"]).toBe("no-store");
  }
});
