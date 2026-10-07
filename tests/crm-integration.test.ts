import "dotenv/config";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { db } from "../src/lib/db";
import { auth } from "../src/lib/auth";
import { actorForUser, roles, type Actor } from "../src/domains/identity";
import { getContact, listContacts } from "../src/domains/contacts";
import {
  createOpportunity,
  getOpportunity,
  updateOpportunity,
  moveOpportunity,
  linkOpportunityOrder,
  createActivity,
  completeActivity,
  listActivities,
  listOpportunities,
} from "../src/domains/crm";
import {
  createDirectOrder,
  quoteDirectOrder,
  saveBusinessCustomer,
} from "../src/domains/direct-sales";
import { checkout, ensureCart, setCartItem } from "../src/domains/commerce";
import { GET, POST, PATCH } from "../src/app/api/v1/[...path]/route";
const key = `crm-${randomUUID()}`;
const sales: Actor = {
  id: key,
  role: "SALES",
  scopes: roles.SALES,
  human: true,
  source: "admin",
};
let owner: Actor,
  userId = "",
  staffId = "",
  officeId = "",
  otherOfficeId = "",
  skuId = "",
  brandId = "",
  categoryId = "",
  cookie = "";
let onlineId = "",
  guestId = "",
  guest2Id = "",
  directId = "";
const address = {
  name: "CRM buyer",
  phone: "+971501234567",
  emirate: "Dubai",
  city: "Dubai",
  area: "Business Bay",
  line1: "Local test office 301",
};
const initial = () => ({
  title: `${key} office opportunity`,
  contact: { kind: "office", id: officeId },
  expectedValue: 42000,
  notes: "Four toners requested",
});
const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
async function request(path: string, method = "GET", body?: unknown) {
  const req = new NextRequest(`${origin}/api/v1${path}`, {
    method,
    headers: {
      Origin: origin,
      Cookie: cookie,
      "Content-Type": "application/json",
      "Idempotency-Key": randomUUID(),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return ({ GET, POST, PATCH }[method] ?? GET)(req, {
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
    throw new Error("Isolated local database required.");
  vi.stubEnv("DEV_PAYMENT_SIMULATOR", "true");
  const signed = await auth.api.signUpEmail({
    body: {
      name: `${key} staff`,
      email: `${key}-staff@example.test`,
      password: randomUUID(),
    },
    asResponse: true,
  });
  staffId = (await signed.json()).user.id;
  cookie = signed.headers
    .getSetCookie()
    .map((c) => c.split(";", 1)[0])
    .join("; ");
  await db.user.update({ where: { id: staffId }, data: { role: "OWNER" } });
  owner = await actorForUser(staffId);
  userId = (
    await auth.api.signUpEmail({
      body: {
        name: `${key} customer`,
        email: `${key}@example.test`,
        password: randomUUID(),
      },
    })
  ).user.id;
  officeId = (
    await saveBusinessCustomer(sales, {
      company: `${key} office`,
      email: `${key}@example.test`,
      address,
    })
  ).id;
  otherOfficeId = (
    await saveBusinessCustomer(sales, {
      company: `${key} other office`,
      address,
    })
  ).id;
  brandId = (await db.brand.create({ data: { name: key, slug: key } })).id;
  categoryId = (await db.category.create({ data: { name: key, slug: key } }))
    .id;
  skuId = (
    await db.product.create({
      data: {
        name: key,
        slug: key,
        brandId,
        categoryId,
        status: "PUBLISHED",
        skus: { create: { code: key, price: 10500, cost: 4000, onHand: 50 } },
      },
      include: { skus: true },
    })
  ).skus[0].id;
  await db.shippingZone.create({
    data: { name: key, emirates: ["Dubai"], rate: 0, estimate: "Local test" },
  });
  async function online(user?: string) {
    const { cart } = await ensureCart(undefined, user);
    await setCartItem(cart.id, { skuId, quantity: 1 });
    const o = await checkout(
      cart.id,
      user,
      { email: `${key}@example.test`, address, paymentMethod: "SIMULATOR" },
      randomUUID(),
    );
    // Isolated fixtures need to exercise the non-demo guest directory rule.
    await db.order.update({ where: { id: o.id }, data: { demo: false } });
    return o.id;
  }
  onlineId = await online(userId);
  guestId = await online();
  guest2Id = await online();
});
afterAll(async () => {
  const opportunityWhere = { createdBy: { in: [key, staffId] } };
  await db.crmActivity.deleteMany({ where: { opportunity: opportunityWhere } });
  await db.crmOpportunity.deleteMany({ where: opportunityWhere });
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
  await db.reservation.deleteMany({ where: { orderId } });
  await db.orderItem.deleteMany({ where: { orderId } });
  await db.order.deleteMany({ where: { id: orderId } });
  await db.cart.deleteMany({ where: { items: { some: { skuId } } } });
  await db.businessCustomer.deleteMany({ where: { createdBy: key } });
  await db.sku.deleteMany({ where: { id: skuId } });
  await db.product.deleteMany({ where: { brandId } });
  await db.brand.deleteMany({ where: { id: brandId } });
  await db.category.deleteMany({ where: { id: categoryId } });
  await db.shippingZone.deleteMany({ where: { name: key } });
  await db.auditEvent.deleteMany({
    where: { actorId: { in: [key, staffId] } },
  });
  await db.idempotency.deleteMany({
    where: { actorId: { in: [key, staffId] } },
  });
  await db.user.deleteMany({ where: { id: { in: [staffId, userId] } } });
  vi.unstubAllEnvs();
  await db.$disconnect();
});
it("lists contacts without merging shared emails; guest history stays order-specific", async () => {
  const contacts = await listContacts(owner, { q: `${key}@example.test` });
  expect(contacts.total).toBe(4);
  expect(contacts.rows.filter((c) => c.kind === "guest")).toHaveLength(2);
  expect(
    (await getContact(owner, "account", userId)).orders.map((o) => o.id),
  ).toEqual([onlineId]);
  expect(
    (await getContact(owner, "guest", guestId)).orders.map((o) => o.id),
  ).toEqual([guestId]);
  expect(
    JSON.stringify(await getContact(owner, "account", userId)),
  ).not.toMatch(/password|guestTokenHash|accessToken|sessions|grants/);
  const readContactOnly = { ...owner, scopes: ["customers:read"] };
  expect(
    (await getContact(readContactOnly, "account", userId)).total,
  ).toBeNull();
  expect((await getContact(readContactOnly, "account", userId)).orders).toEqual(
    [],
  );
});
it("enforces channel access on directories, CRM creation and staff HTTP endpoints", async () => {
  expect(
    (await listContacts(sales, { q: key })).rows.every(
      (c) => c.kind === "office",
    ),
  ).toBe(true);
  await expect(listContacts(sales, { kind: "account" })).rejects.toMatchObject({
    status: 403,
  });
  await expect(getContact(sales, "guest", guest2Id)).rejects.toMatchObject({
    status: 403,
  });
  await expect(
    createOpportunity(
      sales,
      { ...initial(), contact: { kind: "account", id: userId } },
      randomUUID(),
    ),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    createOpportunity({ ...sales, scopes: [] }, initial(), randomUUID()),
  ).rejects.toMatchObject({ status: 403 });
  await db.user.update({ where: { id: staffId }, data: { role: "SALES" } });
  expect((await request("/admin/contacts?kind=account")).status).toBe(403);
  expect(
    (await request("/admin/crm/opportunities?channel=ONLINE")).status,
  ).toBe(403);
  await db.user.update({ where: { id: staffId }, data: { role: "OWNER" } });
});
it("creates once on retry, protects contact identity and rejects stale opportunity edits", async () => {
  const idem = randomUUID();
  const payload = initial();
  const [a, b] = await Promise.all([
    createOpportunity(sales, payload, idem),
    createOpportunity(sales, payload, idem),
  ]);
  expect(a).toEqual(b);
  await expect(
    createOpportunity(sales, { ...payload, title: "Changed" }, idem),
  ).rejects.toMatchObject({ status: 409 });
  const o = await getOpportunity(sales, a.id);
  await updateOpportunity(sales, o.id, {
    title: "Updated opportunity",
    expectedValue: 50000,
    notes: "Needs an extra toner",
    version: o.version,
  });
  await expect(
    updateOpportunity(sales, o.id, {
      title: "Stale update",
      expectedValue: 1,
      version: o.version,
    }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    updateOpportunity(sales, o.id, {
      title: "Forged customer",
      expectedValue: 1,
      version: 2,
      contact: { kind: "office", id: otherOfficeId },
    }),
  ).rejects.toThrow();
  await expect(
    updateOpportunity(sales, o.id, {
      title: "Assign to customer",
      expectedValue: 1,
      version: 2,
      assignedTo: userId,
    }),
  ).rejects.toMatchObject({ status: 400 });
});
it("requires a real linked order for Won and a reason for Lost; reopening is versioned", async () => {
  const { id } = await createOpportunity(sales, initial(), randomUUID());
  await expect(
    moveOpportunity(sales, id, { version: 1, stage: "WON" }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    moveOpportunity(sales, id, { version: 1, stage: "LOST" }),
  ).rejects.toMatchObject({ status: 400 });
  await moveOpportunity(sales, id, {
    version: 1,
    stage: "LOST",
    lostReason: "Purchase postponed",
  });
  await moveOpportunity(sales, id, { version: 2, stage: "QUALIFIED" });
  expect(await getOpportunity(sales, id)).toMatchObject({
    stage: "QUALIFIED",
    version: 3,
    lostReason: "",
  });
});
it("turns a direct opportunity into one unpaid order atomically and rejects mismatched contact or stale review", async () => {
  const { id } = await createOpportunity(sales, initial(), randomUUID());
  const body = {
    customerId: officeId,
    customerVersion: 1,
    lines: [{ skuId, quantity: 4 }],
    opportunity: { id, version: 1 },
  };
  await expect(
    quoteDirectOrder(sales, { ...body, customerId: otherOfficeId }),
  ).rejects.toMatchObject({ status: 409 });
  const q = await quoteDirectOrder(sales, body);
  const confirmed = {
    ...body,
    reviewedQuote: q.reviewedQuote,
    confirmed: true,
  };
  await moveOpportunity(sales, id, { stage: "PROPOSAL", version: 1 });
  await expect(
    createDirectOrder(sales, confirmed, randomUUID()),
  ).rejects.toMatchObject({ status: 409 });
  body.opportunity.version = 2;
  const refreshed = await quoteDirectOrder(sales, body);
  const requestKey = randomUUID();
  const input = {
    ...body,
    reviewedQuote: refreshed.reviewedQuote,
    confirmed: true,
  };
  const [a, b] = await Promise.all([
    createDirectOrder(sales, input, requestKey),
    createDirectOrder(sales, input, requestKey),
  ]);
  expect(a).toEqual(b);
  directId = a.id;
  expect(await getOpportunity(sales, id)).toMatchObject({
    stage: "WON",
    orderId: a.id,
  });
  expect(await db.order.findUnique({ where: { id: a.id } })).toMatchObject({
    channel: "DIRECT",
    paymentStatus: "PENDING",
  });
  expect(
    (await db.reservation.findMany({ where: { orderId: a.id } }))[0].quantity,
  ).toBe(4);
  expect(
    await db.auditEvent.count({
      where: { operation: "crm.order_link", targetId: id },
    }),
  ).toBe(1);
});
it("links only same-contact orders; one order cannot inflate multiple CRM wins", async () => {
  const { id } = await createOpportunity(
    owner,
    { ...initial(), contact: { kind: "account", id: userId } },
    randomUUID(),
  );
  const direct = await db.order.findUniqueOrThrow({ where: { id: directId } });
  await expect(
    linkOpportunityOrder(owner, id, {
      version: 1,
      reference: direct.reference,
    }),
  ).rejects.toMatchObject({ status: 404 });
  const online = await db.order.findUniqueOrThrow({ where: { id: onlineId } });
  await linkOpportunityOrder(owner, id, {
    version: 1,
    reference: online.reference,
  });
  const second = await createOpportunity(
    owner,
    { ...initial(), contact: { kind: "account", id: userId } },
    randomUUID(),
  );
  await expect(
    linkOpportunityOrder(owner, second.id, {
      version: 1,
      reference: online.reference,
    }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(getOpportunity(sales, id)).rejects.toMatchObject({
    status: 403,
  });
  const contactOnly = { ...owner, scopes: ["customers:read", "crm:read"] };
  expect((await getOpportunity(contactOnly, id)).order).toBeNull();
  expect(
    (await listOpportunities(contactOnly)).rows.every((o) => o.order === null),
  ).toBe(true);
});
it("schedules and completes activities once with channel checks, validated future times and HTTP routing", async () => {
  const created = await request("/admin/crm/opportunities", "POST", initial());
  expect(created.status).toBe(201);
  const id = (await created.json()).data.id;
  const dueAt = new Date(Date.now() + 86400000).toISOString();
  const input = {
    kind: "CALL",
    title: "Confirm office requirements",
    notes: "Internal task only",
    dueAt,
  };
  const key = randomUUID();
  const a = await createActivity(sales, id, input, key);
  expect(await createActivity(sales, id, input, key)).toEqual(a);
  await expect(
    createActivity(
      sales,
      id,
      { ...input, dueAt: "2020-01-01T00:00:00.000Z" },
      randomUUID(),
    ),
  ).rejects.toMatchObject({ status: 400 });
  expect((await listActivities(sales)).rows.some((r) => r.id === a.id)).toBe(
    true,
  );
  await Promise.all([
    completeActivity(sales, a.id),
    completeActivity(sales, a.id),
  ]);
  expect((await listActivities(sales)).rows.some((r) => r.id === a.id)).toBe(
    false,
  );
  expect((await listActivities(sales, {}, id)).rows[0].completedBy).toBe(
    sales.id,
  );
  expect(
    await db.auditEvent.count({
      where: { operation: "crm.activity_complete", targetId: id },
    }),
  ).toBe(1);
  const stage = await request(`/admin/crm/opportunities/${id}/stage`, "PATCH", {
    version: 1,
    stage: "QUALIFIED",
  });
  expect(stage.status).toBe(200);
  expect(
    (
      await request(`/admin/crm/opportunities/${id}/activities`, "POST", {
        ...input,
        title: "HTTP activity",
      })
    ).status,
  ).toBe(201);
  expect(
    (await request(`/admin/crm/activities?opportunity=${id}`)).status,
  ).toBe(200);
  await db.user.update({ where: { id: staffId }, data: { role: "CUSTOMER" } });
  expect((await request(`/admin/crm/opportunities/${id}`)).status).toBe(403);
  await db.user.update({ where: { id: staffId }, data: { role: "OWNER" } });
});
it("keeps pipeline totals exact across bounded board cards and paginated list results", async () => {
  const title = `${key} pagination`;
  await db.crmOpportunity.createMany({
    data: Array.from({ length: 27 }, () => ({
      id: randomUUID(),
      title,
      channel: "DIRECT" as const,
      businessCustomerId: officeId,
      expectedValue: 100,
      createdBy: key,
    })),
  });
  const result = await listOpportunities(sales, { q: title });
  expect(result.total).toBe(27);
  expect(result.board[0].rows).toHaveLength(12);
  expect(result.totals[0]).toMatchObject({
    _count: 27,
    _sum: { expectedValue: 2700 },
  });
  const page2 = await listOpportunities(sales, {
    q: title,
    view: "list",
    page: 2,
  });
  expect(page2.rows).toHaveLength(2);
  expect(new Set([...result.rows, ...page2.rows].map((o) => o.id)).size).toBe(
    27,
  );
});
