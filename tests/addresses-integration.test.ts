import "dotenv/config";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import {
  saveAddress,
  customerAddresses,
  deleteAddress,
} from "../src/domains/addresses";
import { addressInput } from "../src/lib/address";

const userId = `address-test-${randomUUID()}`;
const otherId = `address-test-${randomUUID()}`;
const address = {
  name: "Delivery Test",
  phone: "+971 50 123 4567",
  emirate: "Dubai",
  city: "Dubai",
  area: "Downtown Dubai",
  zone: "Business district",
  line1: "Test building, apartment 24",
  location: {
    latitude: 25.1972,
    longitude: 55.2744,
    accuracy: 18,
    confirmed: true as const,
  },
};
beforeAll(async () => {
  if (new URL(process.env.DATABASE_URL ?? "").pathname !== "/inforteks_test")
    throw new Error("Use the isolated integration database.");
  for (const id of [userId, otherId])
    await db.user.create({
      data: { id, name: id, email: `${id}@example.test` },
    });
});
afterAll(async () => {
  await db.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
  await db.$disconnect();
});
describe("private delivery address storage", () => {
  it("persists separate address components and a confirmed pin without inventing a postal code", async () => {
    const saved = await saveAddress(userId, address);
    const row = (await customerAddresses(userId)).find(
      (a) => a.id === saved.id,
    )!;
    expect(row).toMatchObject({
      ...address,
      phone: "+971501234567",
      postalCode: null,
    });
    expect(await customerAddresses(otherId)).toEqual([]);
    await deleteAddress(userId, saved.id);
  });
  it("requires ownership for update/delete and can remove a pin while editing", async () => {
    const saved = await saveAddress(userId, address);
    await expect(
      saveAddress(otherId, { ...address, area: "Foreign change" }, saved.id),
    ).rejects.toMatchObject({ status: 404 });
    await expect(deleteAddress(otherId, saved.id)).rejects.toMatchObject({
      status: 404,
    });
    const manual = { ...address, location: undefined };
    await saveAddress(
      userId,
      { ...manual, area: "Al Barsha", postalCode: "" },
      saved.id,
    );
    expect(
      await db.address.findUnique({ where: { id: saved.id } }),
    ).toMatchObject({ area: "Al Barsha", location: null, postalCode: null });
    await deleteAddress(userId, saved.id);
  });
  it("rejects unconfirmed/incomplete/imprecise coordinates and unexpected address properties", () => {
    for (const location of [
      { ...address.location, confirmed: false },
      { latitude: 25 },
      { ...address.location, accuracy: 201 },
      { ...address.location, latitude: 91 },
    ])
      expect(addressInput.safeParse({ ...address, location }).success).toBe(
        false,
      );
    expect(
      addressInput.safeParse({ ...address, userId: otherId }).success,
    ).toBe(false);
    const legacy = {
      ...address,
      location: undefined,
      area: undefined,
      zone: undefined,
    };
    expect(addressInput.safeParse(legacy).success).toBe(true);
  });
});
