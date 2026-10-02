import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { auth } from "../src/lib/auth";
import { db } from "../src/lib/db";
import { actorForUser } from "../src/domains/identity";
import { createStaff, updateStaffAccess } from "../src/domains/administration";
import { POST } from "../src/app/api/auth/[...all]/route";

const suffix = randomBytes(8).toString("hex");
const password = randomBytes(24).toString("base64url");
const email = `auth-${suffix}@example.test`;
const ids: string[] = [];
let customerId: string;
let ownerId: string;
beforeAll(async () => {
  if (new URL(process.env.DATABASE_URL ?? "").pathname !== "/inforteks_test")
    throw new Error("Authentication tests require inforteks_test.");
  const customer = await auth.api.signUpEmail({
    body: { name: "  Test Customer  ", email, password },
  });
  customerId = customer.user.id;
  ids.push(customerId);
  const owner = await auth.api.signUpEmail({
    body: {
      name: "Test Owner",
      email: `owner-${suffix}@example.test`,
      password,
    },
  });
  ownerId = owner.user.id;
  ids.push(ownerId);
  await db.user.update({ where: { id: ownerId }, data: { role: "OWNER" } });
});
afterAll(async () => {
  await db.job.deleteMany({ where: { actorId: { in: ids } } });
  await db.verification.deleteMany({ where: { value: { in: ids } } });
  await db.auditEvent.deleteMany({ where: { actorId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
});
describe("real authentication and staff authorization", () => {
  it("normalizes customer details, hashes passwords and gives no admin authority", async () => {
    const user = await db.user.findUniqueOrThrow({
      where: { id: customerId },
      include: { accounts: true },
    });
    expect(user.name).toBe("Test Customer");
    expect(user.role).toBe("CUSTOMER");
    expect(user.grants).toEqual([]);
    expect(user.accounts[0].password).toBeTruthy();
    expect(user.accounts[0].password).not.toBe(password);
    expect((await actorForUser(customerId)).scopes).toEqual([]);
    await expect(
      createStaff(await actorForUser(customerId), {}),
    ).rejects.toThrow();
  });
  it("rejects public role escalation and untrusted origins", async () => {
    const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
    const response = await POST(
      new Request(`${origin}/api/auth/sign-in/email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://evil.example",
        },
        body: JSON.stringify({ email, password }),
      }),
    );
    expect(response.status).toBe(403);
    const response2 = await POST(
      new Request(`${origin}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify({
          name: "Public Customer",
          email: `public-${suffix}@example.test`,
          password,
          role: "OWNER",
          grants: ["staff:manage"],
          emailVerified: true,
        }),
      }),
    );
    expect(response2.status).toBe(200);
    const data = await response2.json();
    ids.push(data.user.id);
    const user = await db.user.findUniqueOrThrow({
      where: { id: data.user.id },
    });
    expect(user.role).toBe("CUSTOMER");
    expect(user.grants).toEqual([]);
    expect(user.emailVerified).toBe(false);
  });
  it("lets the Owner assign narrow staff roles and revoke access and sessions", async () => {
    const owner = await actorForUser(ownerId);
    const staff = await createStaff(owner, {
      name: "Content Colleague",
      email: `content-${suffix}@example.test`,
      password,
      role: "CONTENT",
    });
    ids.push(staff.id);
    expect((await actorForUser(staff.id)).scopes).toEqual([
      "content:read",
      "content:write",
    ]);
    await auth.api.signInEmail({ body: { email: staff.email, password } });
    expect(
      await db.session.count({ where: { userId: staff.id } }),
    ).toBeGreaterThan(0);
    await expect(
      updateStaffAccess(await actorForUser(staff.id), ownerId, {
        role: "MANAGER",
      }),
    ).rejects.toThrow();
    await expect(
      updateStaffAccess(owner, ownerId, { role: "CONTENT" }),
    ).rejects.toThrow();
    await expect(
      updateStaffAccess(owner, customerId, { role: "MANAGER" }),
    ).rejects.toThrow();
    await updateStaffAccess(owner, staff.id, { role: "STAFF_DISABLED" });
    expect((await actorForUser(staff.id)).scopes).toEqual([]);
    expect(await db.session.count({ where: { userId: staff.id } })).toBe(0);
    expect(
      await db.auditEvent.count({
        where: { targetId: staff.id, operation: "staff.access-update" },
      }),
    ).toBe(1);
  });
  it("uses expiring, single-use reset tokens and revokes sessions after recovery", async () => {
    await auth.api.signInEmail({ body: { email, password } });
    const known = await auth.api.requestPasswordReset({
      body: { email, redirectTo: "/reset-password" },
    });
    const unknown = await auth.api.requestPasswordReset({
      body: {
        email: `missing-${suffix}@example.test`,
        redirectTo: "/reset-password",
      },
    });
    expect(known).toEqual(unknown);
    const job = await db.job.findFirstOrThrow({
      where: { actorId: customerId, type: "EMAIL" },
      orderBy: { createdAt: "desc" },
    });
    const payload = job.payload as { url: string; expiresAt: string };
    const token = new URL(payload.url).pathname.split("/").at(-1)!;
    expect(
      await db.verification.findFirst({
        where: { identifier: `reset-password:${token}` },
      }),
    ).toBeNull();
    expect(Date.parse(payload.expiresAt) - Date.now()).toBeLessThanOrEqual(
      1800_000,
    );
    const nextPassword = randomBytes(24).toString("base64url");
    await auth.api.resetPassword({
      body: { token, newPassword: nextPassword },
    });
    expect(await db.session.count({ where: { userId: customerId } })).toBe(0);
    await expect(
      auth.api.resetPassword({ body: { token, newPassword: password } }),
    ).rejects.toThrow();
    await expect(
      auth.api.signInEmail({ body: { email, password } }),
    ).rejects.toThrow();
    expect(
      (await auth.api.signInEmail({ body: { email, password: nextPassword } }))
        .user.id,
    ).toBe(customerId);
  });
});
