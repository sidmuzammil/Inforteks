import { describe, expect, it } from "vitest";
import { safeReturnPath } from "../src/lib/auth-navigation";
import { profileInput } from "../src/lib/account-input";
import {
  emailDeliveryEnabled,
  emailVerificationRequired,
} from "../src/lib/email-policy";
import { authEmail } from "../src/lib/auth-email";
import { roles } from "../src/domains/identity";

describe("authentication boundaries", () => {
  it("rejects external, backslash, encoded, control-character and login-loop redirects", () => {
    for (const path of [
      "https://evil.test",
      "//evil.test",
      "/\\evil.test",
      "/%5cevil.test",
      "/%2f%2fevil.test",
      "/%0aevil",
      "/api/auth/sign-out",
      "/login",
      "/admin",
      "/%61dmin",
      "/broken%escape",
    ]) {
      expect(safeReturnPath(path)).toBe("/account");
    }
    expect(safeReturnPath("/checkout?from=cart")).toBe("/checkout?from=cart");
    expect(safeReturnPath("/admin/products", true)).toBe("/admin/products");
    expect(safeReturnPath("/account", true)).toBe("/admin");
    expect(safeReturnPath("/admin/login", true)).toBe("/admin");
  });
  it("stores trimmed names and rejects blank names or attempts to assign authority", () => {
    expect(profileInput.parse({ name: "  Amina Saleh  " })).toEqual({
      name: "Amina Saleh",
    });
    expect(profileInput.safeParse({ name: "   " }).success).toBe(false);
    expect(
      profileInput.safeParse({ name: "Amina", role: "OWNER" }).success,
    ).toBe(false);
  });
  it("requires an explicit production mail provider and verified-sender configuration", () => {
    expect(
      emailDeliveryEnabled({
        NODE_ENV: "production",
        EMAIL_PROVIDER: "development",
      }),
    ).toBe(false);
    expect(
      emailDeliveryEnabled({
        NODE_ENV: "production",
        EMAIL_PROVIDER: "resend",
      }),
    ).toBe(false);
    expect(
      emailDeliveryEnabled({
        NODE_ENV: "production",
        EMAIL_PROVIDER: "resend",
        EMAIL_FROM: "Inforteks <sales@inforteks.com>",
      }),
    ).toBe(true);
    expect(
      emailVerificationRequired({
        NODE_ENV: "production",
        AUTH_REQUIRE_EMAIL_VERIFICATION: "true",
      }),
    ).toBe(false);
  });
  it("limits product, content and customer roles to their intended workflows", () => {
    expect(roles.CUSTOMER).toEqual([]);
    expect(roles.STAFF_DISABLED).toEqual([]);
    expect(roles.CONTENT).toEqual(["content:read", "content:write"]);
    expect(roles.CATALOG).toContain("catalog:publish");
    for (const role of [
      "CONTENT",
      "CATALOG",
      "EDITOR",
      "INVENTORY",
      "SUPPORT",
      "ANALYST",
      "MANAGER",
    ])
      expect(roles[role]).not.toContain("staff:manage");
  });
  it("sends only authentication links for this store and distinguishes verification from recovery", () => {
    const origin = "https://store.example";
    const message = authEmail(
      {
        kind: "VERIFY_EMAIL",
        to: "user@example.test",
        url: `${origin}/api/auth/verify-email?token=test&callbackURL=%2Faccount`,
      },
      origin,
    );
    expect(message.subject).toContain("Verify");
    expect(message.html).toContain("&amp;callbackURL");
    expect(() =>
      authEmail(
        {
          kind: "PASSWORD_RESET",
          to: "user@example.test",
          url: "https://evil.test/reset",
        },
        origin,
      ),
    ).toThrow();
    expect(() =>
      authEmail(
        {
          kind: "PASSWORD_RESET",
          to: "user@example.test",
          url: `${origin}/some-page`,
        },
        origin,
      ),
    ).toThrow();
  });
});
