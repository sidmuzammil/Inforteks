import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { db } from "@/lib/db";
import { secret } from "@/domains/identity";
import { APIError } from "better-auth/api";
import { customerName } from "@/lib/account-input";
import { emailVerificationRequired } from "@/lib/email-policy";
import { googleSignInEnabled } from "@/lib/google-auth";
import { validateGoogleCustomer } from "@/domains/customer-google";
async function queueEmail(
  user: { id: string; email: string },
  url: string,
  kind: string,
  minutes: number,
) {
  await db.job.create({
    data: {
      type: "EMAIL",
      actorId: user.id,
      dedupeKey: secret(),
      payload: {
        to: user.email,
        url,
        kind,
        expiresAt: new Date(Date.now() + minutes * 60_000).toISOString(),
      },
    },
  });
}
export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: [process.env.BETTER_AUTH_URL ?? "http://localhost:3000"],
  socialProviders: googleSignInEnabled()
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          prompt: "select_account",
          accessType: "online",
          includeGrantedScopes: false,
          mapProfileToUser: (profile) => ({
            name:
              profile.name?.trim().slice(0, 100).length >= 2
                ? profile.name.trim().slice(0, 100)
                : "Customer",
          }),
        },
      }
    : {},
  account: {
    encryptOAuthTokens: true,
    accountLinking: {
      enabled: true,
      disableImplicitLinking: true,
      allowDifferentEmails: false,
      allowUnlinkingAll: false,
    },
  },
  user: {
    validateUserInfo: async ({ user, source }) => {
      if (source.oauth?.providerId === "google")
        return validateGoogleCustomer(user);
    },
  },
  onAPIError: { errorURL: "/login" },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    requireEmailVerification: emailVerificationRequired(),
    resetPasswordTokenExpiresIn: 1800,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await queueEmail(user, url, "PASSWORD_RESET", 30);
    },
  },
  emailVerification: {
    sendOnSignUp: emailVerificationRequired(),
    sendOnSignIn: emailVerificationRequired(),
    expiresIn: 3600,
    autoSignInAfterVerification: false,
    sendVerificationEmail: async ({ user, url }) =>
      queueEmail(user, url, "VERIFY_EMAIL", 60),
  },
  verification: { storeIdentifier: "hashed" },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const result = customerName.safeParse(user.name);
          if (!result.success)
            throw new APIError("BAD_REQUEST", {
              message: "Enter a valid full name (2–100 characters).",
            });
          return {
            data: { ...user, name: result.data, role: "CUSTOMER", grants: [] },
          };
        },
      },
      update: {
        before: async (user) => {
          if (user.name === undefined) return;
          const result = customerName.safeParse(user.name);
          if (!result.success)
            throw new APIError("BAD_REQUEST", {
              message: "Enter a valid full name (2–100 characters).",
            });
          return { data: { ...user, name: result.data } };
        },
      },
    },
  },
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 60,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 5 },
      "/sign-in/social": { window: 60, max: 10 },
      "/link-social": { window: 60, max: 5 },
      "/request-password-reset": { window: 60, max: 3 },
      "/send-verification-email": { window: 60, max: 3 },
      "/reset-password": { window: 60, max: 5 },
      "/change-password": { window: 60, max: 5 },
    },
  },
  advanced: { useSecureCookies: process.env.NODE_ENV === "production" },
});
