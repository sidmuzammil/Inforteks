import "dotenv/config";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { db } from "../src/lib/db";
import { auth } from "../src/lib/auth";
import { actorForUser, roles, type Actor } from "../src/domains/identity";
import {
  createDirectOrder,
  quoteDirectOrder,
  saveBusinessCustomer,
  recordVisit,
  completeFollowUp,
  salesFollowUps,
  listSalesOrders,
  salesProducts,
  getBusinessCustomer,
} from "../src/domains/direct-sales";
import { checkout, ensureCart, setCartItem } from "../src/domains/commerce";
import { propose, approve } from "../src/domains/approvals";
import { GET, POST } from "../src/app/api/v1/[...path]/route";

const key = `direct-${randomUUID()}`;
const sales: Actor = {
  id: key,
  scopes: roles.SALES,
  role: "SALES",
  human: true,
  source: "admin",
};
let owner: Actor;
const customerActor: Actor = {
  id: `${key}-customer`,
  scopes: [],
  role: "CUSTOMER",
  human: true,
  source: "customer",
};
let categoryId = "",
  brandId = "",
  skuId = "",
  officeId = "",
  officeVersion = 1,
  cookie = "",
  actorId = "";
const address = {
  name: "Office contact",
  phone: "+971501234567",
  emirate: "Dubai",
  city: "Dubai",
  area: "Office district",
  line1: "Test office, floor 3",
};
const office = {
  company: `${key} office`,
  email: "",
  address,
  notes: "Prefers delivery before noon",
  active: true,
};
const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const newPayload = (quantity = 1) => ({
  customerId: officeId,
  customerVersion: officeVersion,
  lines: [{ skuId, quantity }],
  coupon: "",
  note: "Office purchase order TEST-1",
});
async function confirmed(payload = newPayload()) {
  const quote = await quoteDirectOrder(sales, payload);
  return {
    ...payload,
    reviewedQuote: quote.reviewedQuote,
    confirmed: true as const,
  };
}
async function request(path: string, method = "GET", body?: unknown) {
  const req = new NextRequest(`${origin}/api/v1${path}`, {
    method,
    headers: {
      Origin: origin,
      Cookie: cookie,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return (method === "POST" ? POST : GET)(req, {
    params: Promise.resolve({
      path: path.split("?", 1)[0].slice(1).split("/"),
    }),
  });
}
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    url.pathname !== "/inforteks_test" ||
    !["localhost", "127.0.0.1"].includes(url.hostname)
  )
    throw new Error("Isolated test database required.");
  vi.stubEnv("OFFLINE_PAYMENTS_ENABLED", "false");
  vi.stubEnv("DEV_PAYMENT_SIMULATOR", "true");
  const signed = await auth.api.signUpEmail({
    body: {
      name: "Sales verification",
      email: `${key}@example.test`,
      password: randomUUID(),
    },
    asResponse: true,
  });
  actorId = (await signed.json()).user.id;
  cookie = signed.headers
    .getSetCookie()
    .map((c) => c.split(";", 1)[0])
    .join("; ");
  await db.user.update({ where: { id: actorId }, data: { role: "OWNER" } });
  owner = await actorForUser(actorId);
  await db.user.update({ where: { id: actorId }, data: { role: "SALES" } });
  categoryId = (await db.category.create({ data: { name: key, slug: key } }))
    .id;
  brandId = (await db.brand.create({ data: { name: key, slug: key } })).id;
  const product = await db.product.create({
    data: {
      name: key,
      slug: key,
      brandId,
      categoryId,
      status: "PUBLISHED",
      skus: { create: { code: key, price: 10500, cost: 4000, onHand: 30 } },
    },
    include: { skus: true },
  });
  skuId = product.skus[0].id;
  await db.shippingZone.create({
    data: {
      name: key,
      emirates: ["Dubai"],
      rate: 0,
      estimate: "Local test only",
    },
  });
  officeId = (await saveBusinessCustomer(sales, office)).id;
});
afterAll(async () => {
  const orders = await db.order.findMany({
    where: { items: { some: { skuId } } },
    select: { id: true },
  });
  const orderId = { in: orders.map((o) => o.id) };
  await db.job.deleteMany({
    where: {
      dedupeKey: { in: orders.map((o) => `order-notification:${o.id}`) },
    },
  });
  await db.shipment.deleteMany({ where: { orderId } });
  await db.payment.deleteMany({ where: { orderId } });
  await db.reservation.deleteMany({ where: { orderId } });
  await db.orderItem.deleteMany({ where: { orderId } });
  await db.order.deleteMany({ where: { id: orderId } });
  await db.salesVisit.deleteMany({ where: { customerId: officeId } });
  await db.businessCustomer.deleteMany({ where: { createdBy: key } });
  await db.cart.deleteMany({ where: { items: { some: { skuId } } } });
  await db.inventoryMovement.deleteMany({ where: { skuId } });
  await db.sku.deleteMany({ where: { product: { brandId } } });
  await db.product.deleteMany({ where: { brandId } });
  await db.brand.delete({ where: { id: brandId } });
  await db.category.delete({ where: { id: categoryId } });
  await db.shippingZone.deleteMany({ where: { name: key } });
  await db.proposal.deleteMany({ where: { actorId } });
  await db.auditEvent.deleteMany({
    where: { actorId: { in: [key, actorId] } },
  });
  await db.idempotency.deleteMany({
    where: { actorId: { in: [key, actorId] } },
  });
  await db.user.delete({ where: { id: actorId } });
  vi.unstubAllEnvs();
  await db.$disconnect();
});
it("records offices without accounts, scopes product search and prevents customer or editor access", async () => {
  expect(await db.user.count({ where: { email: office.email } })).toBe(0);
  expect((await salesProducts(sales, key))[0]).toMatchObject({
    price: 10500,
    available: 30,
  });
  expect((await salesProducts(sales, key))[0]).not.toHaveProperty("cost");
  await expect(
    saveBusinessCustomer(customerActor, office),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    quoteDirectOrder({ ...sales, scopes: roles.CONTENT }, newPayload()),
  ).rejects.toMatchObject({ status: 403 });
  expect((await request("/admin/direct-sales/products?q=" + key)).status).toBe(
    200,
  );
  expect((await request("/admin/sales-orders?channel=ONLINE")).status).toBe(
    403,
  );
  expect((await request("/admin/sales-orders?channel=ALL")).status).toBe(403);
});
it("quotes without reserving, requires confirmation and places an immutable, idempotent direct order", async () => {
  const p = await confirmed(newPayload(4));
  expect(
    (await db.sku.findUniqueOrThrow({ where: { id: skuId } })).reserved,
  ).toBe(0);
  await expect(
    createDirectOrder(sales, { ...p, confirmed: false }, randomUUID()),
  ).rejects.toThrow();
  const requestKey = randomUUID();
  const [a, b] = await Promise.all([
    createDirectOrder(sales, p, requestKey),
    createDirectOrder(sales, p, requestKey),
  ]);
  expect(a).toEqual(b);
  expect(a).not.toHaveProperty("guestToken");
  expect(
    (await db.sku.findUniqueOrThrow({ where: { id: skuId } })).reserved,
  ).toBe(4);
  const order = await db.order.findUniqueOrThrow({
    where: { id: a.id },
    include: { items: true },
  });
  expect(order).toMatchObject({
    channel: "DIRECT",
    businessCustomerId: officeId,
    salesActorId: key,
    paymentStatus: "PENDING",
    email: "",
    userId: null,
    businessSnapshot: { company: office.company },
    salesNote: p.note,
  });
  expect(order.items[0]).toMatchObject({ quantity: 4, unitPrice: 10500 });
  expect(
    await db.job.count({ where: { dedupeKey: `order-notification:${a.id}` } }),
  ).toBe(0);
  await expect(
    createDirectOrder(sales, { ...p, note: "Changed" }, requestKey),
  ).rejects.toMatchObject({ status: 409 });
  const response = await request(`/admin/orders/${a.id}`);
  expect(response.status).toBe(200);
  expect((await response.json()).data).not.toHaveProperty("guestTokenHash");
  const updated = await saveBusinessCustomer(
    sales,
    {
      ...office,
      company: `${key} renamed`,
      address: { ...address, line1: "New office, floor 5" },
      version: officeVersion,
    },
    officeId,
  );
  officeVersion = updated.version;
  const immutable = await db.order.findUniqueOrThrow({ where: { id: a.id } });
  expect(immutable.address).toMatchObject({ line1: address.line1 });
  expect(immutable.businessSnapshot).toMatchObject({ company: office.company });
  await expect(
    saveBusinessCustomer(sales, { ...office, version: 1 }, officeId),
  ).rejects.toMatchObject({ status: 409 });
});
it("rejects stale quotes, stale office details, forged totals and duplicate SKU lines", async () => {
  const p = await confirmed();
  await db.sku.update({ where: { id: skuId }, data: { price: 10600 } });
  await expect(createDirectOrder(sales, p, randomUUID())).rejects.toMatchObject(
    { status: 409 },
  );
  await db.sku.update({ where: { id: skuId }, data: { price: 10500 } });
  await expect(
    quoteDirectOrder(sales, { ...newPayload(), customerVersion: 1 }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    createDirectOrder(sales, { ...p, total: 1 }, randomUUID()),
  ).rejects.toThrow();
  await expect(
    quoteDirectOrder(sales, {
      ...newPayload(),
      lines: [
        { skuId, quantity: 1 },
        { skuId, quantity: 2 },
      ],
    }),
  ).rejects.toThrow();
});
it("shares reservations with simultaneous online checkout and keeps online orders private to sales staff", async () => {
  await db.sku.update({ where: { id: skuId }, data: { onHand: 5 } }); // four already reserved, one remaining
  const p = await confirmed();
  const { cart } = await ensureCart();
  await setCartItem(cart.id, { skuId, quantity: 1 });
  const results = await Promise.allSettled([
    createDirectOrder(sales, p, randomUUID()),
    checkout(
      cart.id,
      undefined,
      { email: `${key}@example.test`, address, paymentMethod: "SIMULATOR" },
      randomUUID(),
    ),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(
    (await db.sku.findUniqueOrThrow({ where: { id: skuId } })).reserved,
  ).toBe(5);
  await db.sku.update({ where: { id: skuId }, data: { onHand: 30 } });
  const { cart: second } = await ensureCart();
  await setCartItem(second.id, { skuId, quantity: 1 });
  const online = await checkout(
    second.id,
    undefined,
    { email: `${key}@example.test`, address, paymentMethod: "SIMULATOR" },
    randomUUID(),
  );
  expect(
    (await db.order.findUniqueOrThrow({ where: { id: online.id } })).channel,
  ).toBe("ONLINE");
  expect((await request(`/admin/orders/${online.id}`)).status).toBe(403);
  const direct = await listSalesOrders(sales, { channel: "DIRECT", q: key });
  expect(direct.rows.length).toBeGreaterThan(0);
  expect(direct.rows.every((o) => o.channel === "DIRECT")).toBe(true);
});
it("records retry-safe visits, lists due tasks, completes follow-ups and blocks archived offices", async () => {
  const payload = {
    outcome: "INTERESTED",
    notes: "Needs four toners next week",
    followUpAt: new Date(Date.now() + 3600000).toISOString(),
  };
  const requestKey = randomUUID();
  const one = await recordVisit(sales, officeId, payload, requestKey);
  const two = await recordVisit(sales, officeId, payload, requestKey);
  expect(one.id).toBe(two.id);
  expect((await salesFollowUps(sales)).rows.some((v) => v.id === one.id)).toBe(
    true,
  );
  await completeFollowUp(sales, one.id);
  expect((await salesFollowUps(sales)).rows.some((v) => v.id === one.id)).toBe(
    false,
  );
  await expect(completeFollowUp(customerActor, one.id)).rejects.toMatchObject({
    status: 403,
  });
  const updated = await saveBusinessCustomer(
    sales,
    { ...office, active: false, version: officeVersion },
    officeId,
  );
  officeVersion = updated.version;
  await expect(quoteDirectOrder(sales, newPayload())).rejects.toMatchObject({
    status: 409,
  });
  await expect(
    recordVisit(sales, officeId, payload, randomUUID()),
  ).rejects.toMatchObject({ status: 409 });
  expect((await getBusinessCustomer(sales, officeId)).visits).toHaveLength(1);
});
it("direct orders reuse manager approval for fulfilment and payment, never grant those powers to a salesperson", async () => {
  const o = await db.order.findFirstOrThrow({
    where: { businessCustomerId: officeId },
    include: { items: true },
  });
  await expect(
    propose(sales, "order.fulfil", o.id, {
      items: [{ itemId: o.items[0].id, quantity: 1 }],
      carrier: "Office delivery",
    }),
  ).rejects.toMatchObject({ status: 403 });
  // The approver is a genuine test Owner; permission is rechecked at approval.
  await db.user.update({ where: { id: actorId }, data: { role: "OWNER" } });
  const proposal = await propose(owner, "order.fulfil", o.id, {
    items: [{ itemId: o.items[0].id, quantity: 1 }],
    carrier: "Office delivery",
  });
  await approve(owner, proposal.id);
  expect(
    (await db.orderItem.findUniqueOrThrow({ where: { id: o.items[0].id } }))
      .fulfilled,
  ).toBe(1);
});

it("serializes competing office orders before temporary-cart foreign-key locks", async () => {
  const left = await saveBusinessCustomer(sales, {
    ...office,
    company: `${key} left`,
  });
  const right = await saveBusinessCustomer(sales, {
    ...office,
    company: `${key} right`,
  });
  const stock = await db.sku.findUniqueOrThrow({ where: { id: skuId } });
  await db.sku.update({
    where: { id: skuId },
    data: { onHand: stock.reserved + 1 },
  });
  const payloads = await Promise.all(
    [left, right].map(async (office) => {
      const data = {
        ...newPayload(),
        customerId: office.id,
        customerVersion: office.version,
      };
      return {
        ...data,
        reviewedQuote: (await quoteDirectOrder(sales, data)).reviewedQuote,
        confirmed: true,
      };
    }),
  );
  const results = await Promise.allSettled(
    payloads.map((p) => createDirectOrder(sales, p, randomUUID())),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const rejected = results.find((r) => r.status === "rejected");
  expect(
    rejected?.status === "rejected" ? rejected.reason.status : undefined,
  ).toBe(409);
  expect(
    (await db.sku.findUniqueOrThrow({ where: { id: skuId } })).reserved,
  ).toBe(stock.reserved + 1);
});
