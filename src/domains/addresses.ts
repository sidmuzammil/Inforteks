import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { addressInput } from "@/lib/address";
import { invariant } from "@/lib/errors";

export async function customerAddresses(userId: string) {
  invariant(userId, 401, "Please sign in.");
  return db.address.findMany({
    where: { userId },
    orderBy: { id: "desc" },
    take: 50,
  });
}
export async function saveAddress(userId: string, raw: unknown, id?: string) {
  invariant(userId, 401, "Please sign in.");
  const value = addressInput.parse(raw);
  const data = {
    ...value,
    area: value.area || null,
    zone: value.zone || null,
    postalCode: value.postalCode || null,
    location: value.location ?? Prisma.DbNull,
  };
  if (id) {
    const saved = await db.address.updateMany({ where: { id, userId }, data });
    invariant(saved.count === 1, 404, "Address not found.");
    return { id };
  }
  return db.$transaction(async (tx) => {
    // Serialize per customer to enforce the address-book limit under concurrency.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    invariant(
      (await tx.address.count({ where: { userId } })) < 50,
      422,
      "Your address book is full. Edit or remove an existing address.",
    );
    return tx.address.create({ data: { ...data, userId } });
  });
}
export async function deleteAddress(userId: string, id: string) {
  invariant(userId, 401, "Please sign in.");
  invariant(id, 400, "Choose an address to delete.");
  const result = await db.address.deleteMany({ where: { id, userId } });
  invariant(result.count === 1, 404, "Address not found.");
  return { deleted: true };
}
