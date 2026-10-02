import { db } from "@/lib/db";

/** Recheck stored authority for every provider sign-in and explicit account link. */
export async function googleCustomerAllowed(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, grants: true },
  });
  return Boolean(user && user.role === "CUSTOMER" && user.grants.length === 0);
}

export async function validateGoogleCustomer(user: {
  id?: string;
  emailVerified?: boolean;
}) {
  if (user.emailVerified !== true) return { error: "google_email_unverified" };
  if (user.id && !(await googleCustomerAllowed(user.id)))
    return { error: "google_customer_only" };
}
