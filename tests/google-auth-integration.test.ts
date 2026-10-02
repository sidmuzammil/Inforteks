import "dotenv/config";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "../src/lib/db";
import { actorForUser } from "../src/domains/identity";

const suffix = randomBytes(8).toString("hex");
const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const clientId = "1234567890-inforteks-test.apps.googleusercontent.com";
const password = randomBytes(24).toString("base64url");
let routes: typeof import("../src/app/api/auth/[...all]/route");
let auth: (typeof import("../src/lib/auth"))["auth"];
const emails: string[] = [];
const states: string[] = [];
const profiles = new Map<string, Record<string, unknown>>();
let requestNumber = 0;
const exchange = vi.fn(
  async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url !== "https://oauth2.googleapis.com/token")
      throw new Error("Unexpected external test request");
    const params = new URLSearchParams(String(init?.body));
    expect(params.get("client_id")).toBe(clientId);
    expect(params.get("redirect_uri")).toBe(
      `${origin}/api/auth/callback/google`,
    );
    expect(params.get("code_verifier")?.length).toBeGreaterThanOrEqual(43);
    const profile = profiles.get(params.get("code") ?? "");
    if (!profile)
      return Response.json({ error: "invalid_grant" }, { status: 400 });
    // Only the TLS token exchange is mocked. These fixture JWTs never leave tests.
    const encoded = (value: unknown) =>
      Buffer.from(JSON.stringify(value)).toString("base64url");
    return Response.json({
      access_token: "test-only-access-token",
      token_type: "Bearer",
      expires_in: 3600,
      id_token: `${encoded({ alg: "RS256", typ: "JWT" })}.${encoded({ iss: "https://accounts.google.com", aud: clientId, exp: Math.floor(Date.now() / 1000) + 3600, ...profile })}.test-signature`,
    });
  },
);
const cookie = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(";", 1)[0])
    .join("; ");
async function post(
  path: string,
  body: unknown,
  cookies = "",
  requestOrigin = origin,
) {
  return routes.POST(
    new Request(`${origin}/api/auth/${path}`, {
      method: "POST",
      headers: {
        Origin: requestOrigin,
        "Content-Type": "application/json",
        Cookie: cookies,
        "X-Forwarded-For": `192.0.2.${++requestNumber}`,
      },
      body: JSON.stringify(body),
    }),
  );
}
async function begin(next = "/account", cookies = "", link = false) {
  const response = await post(
    link ? "link-social" : "sign-in/social",
    { provider: "google", callbackURL: next },
    cookies,
  );
  expect(response.status).toBe(200);
  const url = new URL((await response.json()).url);
  expect(url.origin).toBe("https://accounts.google.com");
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(new Set(url.searchParams.get("scope")?.split(" "))).toEqual(
    new Set(["openid", "email", "profile"]),
  );
  const state = url.searchParams.get("state")!;
  states.push(state);
  return {
    state,
    cookies: [cookies, cookie(response)].filter(Boolean).join("; "),
  };
}
function complete(
  flow: { state: string; cookies: string },
  email: string,
  subject: string,
  verified = true,
) {
  const code = randomBytes(12).toString("hex");
  profiles.set(code, {
    sub: subject,
    email,
    name: "Google Customer",
    email_verified: verified,
  });
  return routes.GET(
    new Request(
      `${origin}/api/auth/callback/google?state=${flow.state}&code=${code}`,
      { headers: { Cookie: flow.cookies } },
    ),
  );
}
function address(label: string) {
  const email = `google-${label}-${suffix}@example.test`;
  emails.push(email);
  return email;
}
beforeAll(async () => {
  if (new URL(process.env.DATABASE_URL ?? "").pathname !== "/inforteks_test")
    throw new Error("OAuth tests require inforteks_test");
  vi.stubEnv("GOOGLE_CLIENT_ID", clientId);
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-only-client-secret");
  vi.stubGlobal("fetch", exchange);
  routes = await import("../src/app/api/auth/[...all]/route");
  ({ auth } = await import("../src/lib/auth"));
});
afterAll(async () => {
  const context = await auth.$context;
  for (const state of states)
    await context.internalAdapter.deleteVerificationByIdentifier(
      `auth-state:${state}`,
    );
  await db.user.deleteMany({ where: { email: { in: emails } } });
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await db.$disconnect();
});

describe("Google customer authorization-code sign-in", () => {
  it("creates a customer, returns to a safe page and reuses their account on repeat sign-in", async () => {
    const email = address("new");
    const flow = await begin("/checkout?from=cart");
    const response = await complete(flow, email, `new-${suffix}`);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/checkout?from=cart");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    const user = await db.user.findUniqueOrThrow({
      where: { email },
      include: { accounts: true },
    });
    expect(user.role).toBe("CUSTOMER");
    expect(user.grants).toEqual([]);
    expect(user.emailVerified).toBe(true);
    expect((await actorForUser(user.id)).scopes).toEqual([]);
    expect(user.accounts[0].providerId).toBe("google");
    expect(user.accounts[0].password).toBeNull();
    expect(user.accounts[0].accessToken).not.toBe("test-only-access-token");
    expect(
      await auth.api.getSession({
        headers: new Headers({ Cookie: cookie(response) }),
      }),
    ).toMatchObject({ user: { id: user.id } });
    const second = await complete(
      await begin("//evil.test"),
      email,
      `new-${suffix}`,
    );
    expect(second.headers.get("location")).toBe("/account");
    expect(await db.user.count({ where: { email } })).toBe(1);
    expect(await db.account.count({ where: { userId: user.id } })).toBe(1);
    await expect(
      db.account.create({
        data: {
          id: randomBytes(16).toString("hex"),
          accountId: `new-${suffix}`,
          providerId: "google",
          userId: user.id,
        },
      }),
    ).rejects.toThrow();
  });
  it("rejects callbacks without the browser state cookie, replay and unverified email", async () => {
    const email = address("state");
    const flow = await begin();
    const before = exchange.mock.calls.length;
    const missingCookie = await complete(
      { ...flow, cookies: "" },
      email,
      `state-${suffix}`,
    );
    expect(missingCookie.headers.get("location")).toContain("state_mismatch");
    expect(exchange.mock.calls.length).toBe(before);
    const valid = await complete(flow, email, `state-${suffix}`);
    expect(valid.headers.get("location")).toBe("/account");
    const replay = await complete(flow, email, `state-${suffix}`);
    expect(replay.headers.get("location")).toContain("state_mismatch");
    const unverified = address("unverified");
    const denied = await complete(
      await begin(),
      unverified,
      `unverified-${suffix}`,
      false,
    );
    expect(denied.headers.get("location")).toContain("google_email_unverified");
    expect(
      await db.user.findUnique({ where: { email: unverified } }),
    ).toBeNull();
  });
  it("requires explicit same-email linking and preserves the existing customer", async () => {
    const email = address("existing");
    const created = await post("sign-up/email", {
      email,
      password,
      name: "Existing Customer",
    });
    expect(created.status).toBe(200);
    const signedIn = cookie(created);
    const implicit = await complete(await begin(), email, `existing-${suffix}`);
    expect(implicit.headers.get("location")).toContain("account_not_linked");
    const linked = await complete(
      await begin("/account/profile", signedIn, true),
      email,
      `existing-${suffix}`,
    );
    expect(linked.headers.get("location")).toBe("/account/profile");
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    expect(await db.account.count({ where: { userId: user.id } })).toBe(2);
    expect(await db.user.count({ where: { email } })).toBe(1);
    const wrongEmail = address("different");
    const mismatch = await complete(
      await begin("/account/profile", signedIn, true),
      wrongEmail,
      `different-${suffix}`,
    );
    expect(mismatch.headers.get("location")).toContain("email_does_not_match");
    expect(await db.account.count({ where: { userId: user.id } })).toBe(2);
    await db.session.updateMany({
      where: { userId: user.id },
      data: { createdAt: new Date(Date.now() - 16 * 60_000) },
    });
    expect(
      (await post("link-social", { provider: "google" }, signedIn)).status,
    ).toBe(403);
  });
  it("blocks staff linking and Google sign-in even if the stored account gains staff authority", async () => {
    const email = address("staff");
    const response = await complete(await begin(), email, `staff-${suffix}`);
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    await db.user.update({ where: { id: user.id }, data: { role: "OWNER" } });
    expect(
      (await post("link-social", { provider: "google" }, cookie(response)))
        .status,
    ).toBe(403);
    const denied = await complete(await begin(), email, `staff-${suffix}`);
    expect(denied.headers.get("location")).toContain("google_customer_only");
    await db.user.update({
      where: { id: user.id },
      data: { role: "CUSTOMER", grants: ["staff:manage"] },
    });
    const deniedGrant = await complete(await begin(), email, `staff-${suffix}`);
    expect(deniedGrant.headers.get("location")).toContain(
      "google_customer_only",
    );
  });
  it("rejects forged tokens, extra scopes, untrusted origins and disconnected providers", async () => {
    const request = { provider: "google", callbackURL: "/account" };
    expect(
      (await post("sign-in/social", request, "", "https://evil.test")).status,
    ).toBe(403);
    expect(
      (
        await post("sign-in/social", {
          ...request,
          idToken: { token: "forged" },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await post("sign-in/social", {
          ...request,
          scopes: ["https://www.googleapis.com/auth/drive"],
        })
      ).status,
    ).toBe(400);
    expect((await post("link-social", request)).status).toBe(401);
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    expect((await post("sign-in/social", request)).status).toBe(503);
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-only-client-secret");
  });
});
