import { z } from "zod";
import { db, type Tx } from "@/lib/db";
import { addressInput } from "@/lib/address";
import { invariant } from "@/lib/errors";
import {
  audit,
  hash,
  idempotent,
  requireScope,
  secret,
  type Actor,
} from "./identity";
import { completeCheckout, quoteFingerprint, quoteTx } from "./commerce";
import { Prisma } from "@/generated/prisma/client";

export const businessCustomerInput = z
  .object({
    company: z.string().trim().min(2).max(160),
    email: z.union([z.literal(""), z.email().max(200)]).default(""),
    address: addressInput,
    notes: z.string().trim().max(2000).default(""),
    active: z.boolean().default(true),
  })
  .strict();
export const businessCustomerUpdate = businessCustomerInput.extend({
  version: z.number().int().positive(),
});
export const visitInput = z
  .object({
    outcome: z.enum([
      "INTRODUCED",
      "INTERESTED",
      "ORDER_TAKEN",
      "FOLLOW_UP",
      "NOT_INTERESTED",
    ]),
    notes: z.string().trim().min(3).max(2000),
    followUpAt: z.iso.datetime().nullable().default(null),
  })
  .strict();
export const directOrderInput = z
  .object({
    customerId: z.string().min(1).max(100),
    customerVersion: z.number().int().positive(),
    lines: z
      .array(
        z
          .object({
            skuId: z.string().min(1).max(100),
            quantity: z.number().int().min(1).max(99),
          })
          .strict(),
      )
      .min(1)
      .max(50),
    coupon: z.string().trim().max(40).default(""),
    note: z.string().trim().max(1000).default(""),
  })
  .strict()
  .refine((d) => new Set(d.lines.map((l) => l.skuId)).size === d.lines.length, {
    message: "Combine quantities for the same product.",
  });
export const directOrderConfirmation = directOrderInput.safeExtend({
  reviewedQuote: z.string().length(64),
  confirmed: z.literal(true),
});
export type DirectOrderInput = z.infer<typeof directOrderInput>;
export const salesQuery = z.object({
  q: z.string().trim().max(160).default(""),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  channel: z.enum(["ONLINE", "DIRECT", "ALL"]).default("ALL"),
  status: z
    .enum(["ALL", "PLACED", "PROCESSING", "COMPLETED", "CANCELLED", "EXPIRED"])
    .default("ALL"),
  payment: z
    .enum(["ALL", "PENDING", "PAID", "REFUNDED", "PARTIALLY_REFUNDED"])
    .default("ALL"),
  customerId: z.string().max(100).optional(),
  queue: z.enum(["ALL", "TO_FULFIL", "PAYMENT_PENDING"]).default("ALL"),
});

export async function listBusinessCustomers(actor: Actor, raw: unknown = {}) {
  requireScope(actor, "direct_sales:read");
  const { q, page } = salesQuery.parse(raw);
  const where: Prisma.BusinessCustomerWhereInput = q
    ? {
        OR: [
          { company: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { address: { path: ["phone"], string_contains: q } },
          { address: { path: ["name"], string_contains: q } },
        ],
      }
    : {};
  const [rows, total] = await Promise.all([
    db.businessCustomer.findMany({
      where,
      orderBy: [{ active: "desc" }, { company: "asc" }, { id: "asc" }],
      take: 25,
      skip: (page - 1) * 25,
      include: { _count: { select: { orders: true, visits: true } } },
    }),
    db.businessCustomer.count({ where }),
  ]);
  return { rows, total, page };
}
export async function getBusinessCustomer(actor: Actor, id: string) {
  requireScope(actor, "direct_sales:read");
  const customer = await db.businessCustomer.findUnique({
    where: { id },
    include: { visits: { take: 30, orderBy: { createdAt: "desc" } } },
  });
  invariant(customer, 404, "Office customer not found.");
  return customer;
}
export async function saveBusinessCustomer(
  actor: Actor,
  raw: unknown,
  id?: string,
) {
  requireScope(actor, "direct_sales:write");
  const parsed = id
    ? businessCustomerUpdate.parse(raw)
    : businessCustomerInput.parse(raw);
  const { version, ...data } = parsed as z.infer<typeof businessCustomerUpdate>;
  return db.$transaction(async (tx) => {
    if (id) {
      await tx.$queryRaw`SELECT id FROM "BusinessCustomer" WHERE id=${id} FOR UPDATE`;
      const old = await tx.businessCustomer.findUnique({ where: { id } });
      invariant(old, 404, "Office customer not found.");
      invariant(
        old.version === version,
        409,
        "This customer was edited by someone else. Reload before saving.",
      );
      const saved = await tx.businessCustomer.update({
        where: { id },
        data: { ...data, version: { increment: 1 } },
      });
      await audit(
        tx,
        actor,
        "business_customer.update",
        id,
        { version },
        { version: saved.version, active: saved.active },
      );
      return saved;
    }
    const saved = await tx.businessCustomer.create({
      data: { ...data, createdBy: actor.id },
    });
    await audit(tx, actor, "business_customer.create", saved.id, undefined, {
      company: saved.company,
    });
    return saved;
  });
}
export async function recordVisit(
  actor: Actor,
  customerId: string,
  raw: unknown,
  key: string,
) {
  requireScope(actor, "direct_sales:write");
  const data = visitInput.parse(raw);
  return db.$transaction((tx) =>
    idempotent(
      tx,
      actor.id,
      "sales_visit.create",
      key,
      { customerId, ...data },
      async () => {
        if (data.followUpAt)
          invariant(
            new Date(data.followUpAt) > new Date(),
            422,
            "Choose a future follow-up time.",
          );

        await tx.$queryRaw`SELECT id FROM "BusinessCustomer" WHERE id=${customerId} FOR UPDATE`;
        const customer = await tx.businessCustomer.findUnique({
          where: { id: customerId },
        });
        invariant(customer?.active, 409, "Choose an active office customer.");
        const visit = await tx.salesVisit.create({
          data: { ...data, customerId, actorId: actor.id },
        });
        await audit(tx, actor, "sales_visit.create", visit.id, undefined, {
          customerId,
          outcome: data.outcome,
        });
        return visit;
      },
    ),
  );
}
export async function completeFollowUp(actor: Actor, id: string) {
  requireScope(actor, "direct_sales:write");
  return db.$transaction(async (tx) => {
    const updated = await tx.salesVisit.updateMany({
      where: { id, completedAt: null, followUpAt: { not: null } },
      data: { completedAt: new Date() },
    });
    invariant(
      updated.count,
      409,
      "This follow-up is already complete or unavailable.",
    );
    await audit(tx, actor, "sales_visit.complete", id);
    return { id };
  });
}
export async function salesFollowUps(actor: Actor, page = 1) {
  requireScope(actor, "direct_sales:read");
  const p = salesQuery.parse({ page }).page;
  const where = {
    completedAt: null,
    followUpAt: { not: null },
    customer: { active: true },
  };
  const [rows, total] = await Promise.all([
    db.salesVisit.findMany({
      where,
      take: 25,
      skip: (p - 1) * 25,
      orderBy: [{ followUpAt: "asc" }, { id: "asc" }],
      include: {
        customer: { select: { id: true, company: true, address: true } },
      },
    }),
    db.salesVisit.count({ where }),
  ]);
  return { rows, total, page: p };
}
export async function salesProducts(actor: Actor, query: string) {
  requireScope(actor, "direct_sales:write");
  const q = z.string().trim().max(160).parse(query);
  const rows = await db.sku.findMany({
    where: {
      active: true,
      price: { not: null },
      product: {
        status: "PUBLISHED",
        category: { visible: true },
        ...(process.env.NODE_ENV === "production" ? { demo: false } : {}),
      },
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: "insensitive" as const } },
              {
                product: {
                  name: { contains: q, mode: "insensitive" as const },
                },
              },
            ],
          }
        : {}),
    },
    take: 20,
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      price: true,
      options: true,
      onHand: true,
      reserved: true,
      product: { select: { name: true } },
    },
  });
  return rows.map((s) => ({
    id: s.id,
    code: s.code,
    price: s.price!,
    name: s.product.name,
    options: s.options,
    available: s.onHand - s.reserved,
  }));
}
async function directCart(tx: Tx, data: DirectOrderInput) {
  // Customer edits and orders serialize, so review and immutable address agree.
  await tx.$queryRaw`SELECT id FROM "BusinessCustomer" WHERE id=${data.customerId} FOR UPDATE`;
  const customer = await tx.businessCustomer.findUnique({
    where: { id: data.customerId },
  });
  invariant(customer?.active, 409, "Choose an active office customer.");
  invariant(
    customer.version === data.customerVersion,
    409,
    "The office details changed. Reload this customer before ordering.",
  );
  // Lock SKUs before inserting temporary CartItems. Their foreign keys take
  // key-share locks; upgrading those concurrently can otherwise deadlock.
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM "Sku" WHERE id IN (${Prisma.join(data.lines.map((line) => line.skuId))}) ORDER BY id FOR UPDATE`,
  );
  const cart = await tx.cart.create({
    data: { tokenHash: hash(secret()), items: { create: data.lines } },
  });
  return { customer, cart, address: addressInput.parse(customer.address) };
}
export async function quoteDirectOrder(actor: Actor, raw: unknown) {
  requireScope(actor, "direct_sales:write");
  const data = directOrderInput.parse(raw);
  return db.$transaction(async (tx) => {
    const { customer, cart, address } = await directCart(tx, data);
    const q = await quoteTx(
      tx,
      cart.id,
      address.emirate,
      data.coupon || undefined,
    );
    const result = {
      totals: q.totals,
      shipping: { name: q.zone.name, estimate: q.zone.estimate },
      reviewedQuote: quoteFingerprint(q, {
        id: customer.id,
        version: customer.version,
      }),
      company: customer.company,
      address,
      email: customer.email,
      lines: q.cart.items.map((l) => ({
        skuId: l.skuId,
        name: l.sku.product.name,
        code: l.sku.code,
        quantity: l.quantity,
        price: l.sku.price!,
        discount: q.totals.discounts[q.cart.items.indexOf(l)],
      })),
    };
    await tx.cart.delete({ where: { id: cart.id } });
    return result;
  });
}
export async function createDirectOrder(
  actor: Actor,
  raw: unknown,
  key: string,
) {
  requireScope(actor, "direct_sales:write");
  const { reviewedQuote, confirmed, ...data } =
    directOrderConfirmation.parse(raw);
  return db.$transaction(
    (tx) =>
      idempotent(
        tx,
        actor.id,
        "direct_order.create",
        key,
        { ...data, reviewedQuote, confirmed },
        async () => {
          const { customer, cart, address } = await directCart(tx, data);
          const order = await completeCheckout(
            tx,
            cart.id,
            undefined,
            {
              country: "AE",
              email: customer.email,
              address,
              paymentMethod: "OFFLINE",
              coupon: data.coupon || undefined,
            },
            { actor, customer, note: data.note, reviewedQuote },
          );
          await tx.cart.delete({ where: { id: cart.id } });
          // No customer session or public order token is handed to a salesperson.
          return { id: order.id, reference: order.reference };
        },
      ),
    { timeout: 15000 },
  );
}
export function requireOrderRead(actor: Actor, channel: string) {
  if (channel === "DIRECT" && actor.scopes.includes("direct_sales:read"))
    return;
  requireScope(actor, "orders:read");
}
export async function listSalesOrders(actor: Actor, raw: unknown = {}) {
  const data = salesQuery.parse(raw);
  requireOrderRead(actor, data.channel);
  const where: Prisma.OrderWhereInput = {
    ...(data.queue === "TO_FULFIL"
      ? {
          AND: [
            {
              status: { in: ["PLACED", "PROCESSING"] },
              fulfillmentStatus: { not: "FULFILLED" },
            },
          ],
        }
      : data.queue === "PAYMENT_PENDING"
        ? {
            AND: [
              {
                status: { notIn: ["EXPIRED", "CANCELLED"] },
                paymentStatus: "PENDING",
              },
            ],
          }
        : {}),
    ...(data.channel !== "ALL" ? { channel: data.channel } : {}),
    ...(data.customerId ? { businessCustomerId: data.customerId } : {}),
    ...(data.status !== "ALL" ? { status: data.status } : {}),
    ...(data.payment !== "ALL" ? { paymentStatus: data.payment } : {}),
    ...(data.q
      ? {
          OR: [
            { reference: { contains: data.q, mode: "insensitive" } },
            { email: { contains: data.q, mode: "insensitive" } },
            {
              businessSnapshot: { path: ["company"], string_contains: data.q },
            },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.order.findMany({
      where,
      take: 25,
      skip: (data.page - 1) * 25,
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
    }),
    db.order.count({ where }),
  ]);
  return { rows, total, page: data.page };
}
export async function salesOverview(
  actor: Actor,
  channel: "ONLINE" | "DIRECT",
) {
  requireOrderRead(actor, channel);
  const where = { channel, demo: false };
  const [
    orders,
    awaitingFulfilment,
    pendingPayment,
    customers,
    followUps,
    paid,
  ] = await Promise.all([
    db.order.count({ where }),
    db.order.count({
      where: {
        ...where,
        status: { in: ["PLACED", "PROCESSING"] },
        fulfillmentStatus: { not: "FULFILLED" },
      },
    }),
    db.order.count({
      where: {
        ...where,
        status: { notIn: ["EXPIRED", "CANCELLED"] },
        paymentStatus: "PENDING",
      },
    }),
    channel === "DIRECT"
      ? db.businessCustomer.count({ where: { active: true } })
      : db.user.count({ where: { role: "CUSTOMER" } }),
    channel === "DIRECT"
      ? db.salesVisit.count({
          where: {
            completedAt: null,
            followUpAt: { lte: new Date() },
            customer: { active: true },
          },
        })
      : 0,
    actor.scopes.includes("reports:financial")
      ? db.order.aggregate({
          where: {
            ...where,
            paymentStatus: "PAID",
            status: { not: "CANCELLED" },
          },
          _sum: { total: true },
        })
      : null,
  ]);
  return {
    orders,
    awaitingFulfilment,
    pendingPayment,
    customers,
    followUps,
    paid: paid ? (paid._sum.total ?? 0) : null,
  };
}
