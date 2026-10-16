import "dotenv/config";
import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, afterAll, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { auth } from "../src/lib/auth";
import { db } from "../src/lib/db";
import { actorForUser } from "../src/domains/identity";
import { getProduct } from "../src/domains/catalogue";
import { GET, POST } from "../src/app/api/v1/[...path]/route";

const key = `catalogue-permissions-${randomUUID()}`;
const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
let userId = "",
  cookie = "",
  brandId = "",
  categoryId = "",
  productId = "";
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    url.pathname !== "/inforteks_test" ||
    !["127.0.0.1", "localhost"].includes(url.hostname)
  )
    throw new Error("Requires isolated local test database.");
  const signed = await auth.api.signUpEmail({
    body: {
      name: "Catalogue permissions test",
      email: `${key}@example.test`,
      password: randomUUID(),
    },
    asResponse: true,
  });
  userId = (await signed.json()).user.id;
  cookie = signed.headers
    .getSetCookie()
    .map((c) => c.split(";", 1)[0])
    .join("; ");
  await db.user.update({ where: { id: userId }, data: { role: "EDITOR" } });
  brandId = (await db.brand.create({ data: { name: key, slug: key } })).id;
  categoryId = (await db.category.create({ data: { name: key, slug: key } }))
    .id;
  productId = (
    await db.product.create({
      data: {
        name: key,
        slug: key,
        brandId,
        categoryId,
        skus: {
          create: {
            code: key,
            price: 15321,
            compareAt: 25432,
            cost: 5678,
            onHand: 19,
            reserved: 3,
          },
        },
      },
    })
  ).id;
});
beforeEach(async () => {
  await db.user.update({ where: { id: userId }, data: { role: "EDITOR" } });
  await db.sku.updateMany({
    where: { productId },
    data: { price: 15321, compareAt: 25432, onHand: 19, reserved: 3 },
  });
});
afterAll(async () => {
  await db.inventoryMovement.deleteMany({ where: { actorId: userId } });
  await db.proposal.deleteMany({ where: { actorId: userId } });
  await db.auditEvent.deleteMany({ where: { actorId: userId } });
  if (productId) await db.sku.deleteMany({ where: { productId } });
  if (productId) await db.product.delete({ where: { id: productId } });
  if (brandId) await db.brand.delete({ where: { id: brandId } });
  if (categoryId) await db.category.delete({ where: { id: categoryId } });
  if (userId) await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
});

it("returns only an approval receipt to Inventory and Catalogue staff, never the unrestricted SKU", async () => {
  const sku = await db.sku.findFirstOrThrow({ where: { productId } });
  async function post(path: string, body: unknown, status = 200) {
    const response = await POST(
      new NextRequest(`${origin}/api/v1/${path}`, {
        method: "POST",
        headers: {
          Cookie: cookie,
          Origin: origin,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ path: path.split("/") }) },
    );
    const result = await response.json();
    expect(response.status, JSON.stringify(result)).toBe(status);
    return result.data;
  }
  for (const operation of ["__proto__", "constructor", "toString"])
    await post(
      "admin/proposals",
      { operation, targetId: sku.id, payload: {} },
      400,
    );
  for (const [role, operation, payload] of [
    [
      "INVENTORY",
      "inventory.adjust",
      { delta: 1, reason: "Isolated test recount" },
    ],
    ["CATALOG", "price.change", { price: 16000, compareAt: 25432 }],
  ] as const) {
    await db.user.update({ where: { id: userId }, data: { role } });
    const proposal = await post(
      "admin/proposals",
      { operation, targetId: sku.id, payload },
      201,
    );
    expect(
      (await request("admin/proposals")).map((p: { id: string }) => p.id),
    ).toContain(proposal.id);
    const result = await post(`admin/proposals/${proposal.id}/approve`, {});
    expect(result).toEqual({
      id: proposal.id,
      operation,
      targetId: sku.id,
      status: "APPROVED",
    });
    for (const field of ["cost", "price", "compareAt", "onHand", "reserved"])
      expect(result).not.toHaveProperty(field);
  }
  expect(
    await db.sku.findUniqueOrThrow({ where: { id: sku.id } }),
  ).toMatchObject({ onHand: 20, price: 16000 });
  await db.user.update({ where: { id: userId }, data: { role: "EDITOR" } });
  expect(await request("admin/proposals")).toEqual([]);
});
async function request(path: string, q = "") {
  const response = await GET(
    new NextRequest(`${origin}/api/v1/${path}${q}`, {
      headers: { Cookie: cookie },
    }),
    { params: Promise.resolve({ path: path.split("/") }) },
  );
  expect(response.status).toBe(200);
  return (await response.json()).data;
}
it("omits both price fields, costs and inventory from editor product APIs", async () => {
  for (const row of [
    await request(`admin/products/${productId}`),
    ...(await request("admin/products", `?q=${key}`)),
  ]) {
    expect(row.id).toBe(productId);
    for (const field of ["price", "compareAt", "cost", "onHand", "reserved"])
      expect(row.skus[0]).not.toHaveProperty(field);
  }
});
it("keeps draft preview prices and inventory scoped without changing public visibility", async () => {
  const editor = await actorForUser(userId);
  const preview = await getProduct(key, editor);
  expect(preview?.skus[0]).toMatchObject({
    price: null,
    compareAt: null,
    available: 0,
  });
  expect(await getProduct(key)).toBeNull();
  await db.user.update({ where: { id: userId }, data: { role: "OWNER" } });
  const ownerPreview = await getProduct(key, await actorForUser(userId));
  expect(ownerPreview?.skus[0]).toMatchObject({
    price: 15321,
    compareAt: 25432,
    available: 16,
  });
  expect((await request(`admin/products/${productId}`)).skus[0]).toMatchObject({
    price: 15321,
    compareAt: 25432,
    cost: 5678,
    onHand: 19,
    reserved: 3,
  });
});
