import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { db } from "@/lib/db";
import { secret } from "@/domains/identity";
export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: [process.env.BETTER_AUTH_URL ?? "http://localhost:3000"],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await db.job.create({
        data: {
          type: "EMAIL",
          actorId: user.id,
          payload: { to: user.email, url, kind: "PASSWORD_RESET" },
          dedupeKey: secret(),
        },
      });
    },
  },
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 },
  rateLimit: { enabled: true, storage: "database", window: 60, max: 30 },
  advanced: { useSecureCookies: process.env.NODE_ENV === "production" },
});
