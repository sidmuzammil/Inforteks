import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "@/lib/db";
import { invariant } from "@/lib/errors";
import { requireScope, type Actor } from "./identity";

export const contactKind = z.enum(["office", "account", "guest"]);
export type ContactKind = z.infer<typeof contactKind>;
export const contactReference = z
  .object({ kind: contactKind, id: z.string().min(1).max(100) })
  .strict();
export const contactQuery = z.object({
  q: z.string().trim().max(160).default(""),
  kind: z.enum(["ALL", "office", "account", "guest"]).default("ALL"),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});
export type ContactRow = {
  id: string;
  kind: ContactKind;
  name: string;
  person: string;
  email: string;
  phone: string;
  city: string;
  active: boolean;
};
export function requireContactRead(actor: Actor, kind: ContactKind) {
  requireScope(
    actor,
    kind === "office" ? "direct_sales:read" : "customers:read",
  );
}
export function contactChannels(actor: Actor) {
  return [
    ...(actor.scopes.includes("direct_sales:read") ? ["DIRECT" as const] : []),
    ...(actor.scopes.includes("customers:read") ? ["ONLINE" as const] : []),
  ];
}
export async function listContacts(actor: Actor, raw: unknown = {}) {
  const data = contactQuery.parse(raw);
  invariant(contactChannels(actor).length, 403, "Contact access is required.");
  if (data.kind !== "ALL") requireContactRead(actor, data.kind);
  const office =
    actor.scopes.includes("direct_sales:read") &&
    ["ALL", "office"].includes(data.kind);
  const account =
    actor.scopes.includes("customers:read") &&
    ["ALL", "account"].includes(data.kind);
  const guest =
    actor.scopes.includes("customers:read") &&
    ["ALL", "guest"].includes(data.kind);
  // A directory over authoritative records, not an email-based identity merge.
  // Guest entries are explicitly order-specific; shared email is not ownership.
  const directory = Prisma.sql`
    SELECT id, 'office'::text AS kind, company AS name, COALESCE(address->>'name','') AS person,
      email, COALESCE(address->>'phone','') AS phone, COALESCE(address->>'city','') AS city, active
      FROM "BusinessCustomer" WHERE ${office}
    UNION ALL
    SELECT id, 'account', name, name, email, '', '', true FROM "User" WHERE ${account} AND role='CUSTOMER'
    UNION ALL
    SELECT id, 'guest', COALESCE(address->>'name','Guest'), reference, email,
      COALESCE(address->>'phone',''), COALESCE(address->>'city',''), true
      FROM "Order" WHERE ${guest} AND channel='ONLINE' AND "userId" IS NULL AND NOT demo`;
  const filtered = Prisma.sql`SELECT * FROM (${directory}) d WHERE strpos(lower(concat_ws(' ', name, person, email, phone, city)), lower(${data.q})) > 0`;
  const [rows, counts] = await Promise.all([
    db.$queryRaw<ContactRow[]>(
      Prisma.sql`${filtered} ORDER BY lower(name), kind, id LIMIT 25 OFFSET ${(data.page - 1) * 25}`,
    ),
    db.$queryRaw<{ count: number }[]>(
      Prisma.sql`SELECT count(*)::integer AS count FROM (${filtered}) f`,
    ),
  ]);
  return { rows, total: counts[0].count, page: data.page };
}
export async function resolveContact(actor: Actor, raw: unknown, tx: Tx = db) {
  const ref = contactReference.parse(raw);
  requireContactRead(actor, ref.kind);
  if (ref.kind === "office") {
    const office = await tx.businessCustomer.findUnique({
      where: { id: ref.id },
    });
    invariant(office, 404, "Contact not found.");
    return {
      ...ref,
      name: office.company,
      email: office.email,
      active: office.active,
      channel: "DIRECT" as const,
      addresses: [office.address],
      notes: office.notes,
      version: office.version,
      createdAt: office.createdAt,
    };
  }
  if (ref.kind === "account") {
    const user = await tx.user.findFirst({
      where: { id: ref.id, role: "CUSTOMER" },
      select: {
        name: true,
        email: true,
        createdAt: true,
        addresses: {
          orderBy: { id: "asc" },
          take: 30,
          select: {
            name: true,
            phone: true,
            emirate: true,
            city: true,
            line1: true,
            landmark: true,
            area: true,
            zone: true,
            postalCode: true,
            location: true,
          },
        },
      },
    });
    invariant(user, 404, "Contact not found.");
    return {
      ...ref,
      ...user,
      active: true,
      channel: "ONLINE" as const,
      notes: "",
      version: null,
    };
  }
  const order = await tx.order.findFirst({
    where: { id: ref.id, channel: "ONLINE", userId: null, demo: false },
    select: { address: true, email: true, createdAt: true, reference: true },
  });
  invariant(order, 404, "Contact not found.");
  return {
    ...ref,
    name: (order.address as { name?: string }).name ?? "Guest",
    email: order.email,
    active: true,
    channel: "ONLINE" as const,
    notes: `Guest contact from ${order.reference}.`,
    addresses: [order.address],
    version: null,
    createdAt: order.createdAt,
  };
}
export function contactOrderWhere(
  kind: ContactKind,
  id: string,
): Prisma.OrderWhereInput {
  if (kind === "office") return { channel: "DIRECT", businessCustomerId: id };
  if (kind === "account") return { channel: "ONLINE", userId: id };
  return { channel: "ONLINE", id, userId: null, demo: false };
}
export const contactOpportunityWhere = (
  kind: ContactKind,
  id: string,
): Prisma.CrmOpportunityWhereInput =>
  kind === "office"
    ? { businessCustomerId: id }
    : kind === "account"
      ? { userId: id }
      : { guestOrderId: id };
export async function getContact(
  actor: Actor,
  kind: unknown,
  id: string,
  rawPage: unknown = 1,
) {
  const ref = contactReference.parse({ kind, id });
  const page = contactQuery.shape.page.parse(rawPage);
  const contact = await resolveContact(actor, ref);
  const canReadOrders =
    ref.kind === "office" || actor.scopes.includes("orders:read");
  const where = contactOrderWhere(ref.kind, id);
  const [orders, total, opportunities] = await Promise.all([
    canReadOrders
      ? db.order.findMany({
          where,
          take: 25,
          skip: (page - 1) * 25,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: {
            id: true,
            reference: true,
            email: true,
            channel: true,
            businessSnapshot: true,
            status: true,
            paymentStatus: true,
            fulfillmentStatus: true,
            total: true,
            createdAt: true,
            demo: true,
          },
        })
      : [],
    canReadOrders ? db.order.count({ where }) : null,
    actor.scopes.includes("crm:read")
      ? db.crmOpportunity.findMany({
          where: contactOpportunityWhere(ref.kind, id),
          take: 20,
          orderBy: { updatedAt: "desc" },
          select: { id: true, title: true, stage: true, expectedValue: true },
        })
      : [],
  ]);
  return { contact, orders, total, page, opportunities };
}
