import { z } from "zod";
import { db, type Tx } from "@/lib/db";
import { invariant } from "@/lib/errors";
import {
  audit,
  requireScope,
  actorForUser,
  type Actor,
  type Permission,
} from "./identity";
import { validatePublication } from "./catalogue";
import { fulfil } from "./commerce";
import { receiveReturn } from "./returns";
import { json } from "@/lib/utils";
import type { Prisma } from "@/generated/prisma/client";

const policy = {
  "return.receive": {
    scope: "returns:write",
    schema: z.object({ disposition: z.enum(["RESTOCK", "DAMAGED"]) }).strict(),
    kind: "return",
  },
  "sku.edit": {
    scope: "catalog:write",
    schema: z
      .object({
        code: z.string().min(2).max(80),
        mpn: z.string().max(100).nullable(),
        options: z.record(
          z.string().max(40),
          z.union([z.string().max(200), z.number()]),
        ),
        specs: z.record(
          z.string().max(40),
          z.union([z.string().max(200), z.number()]),
        ),
        warranty: z.string().max(200).nullable(),
        condition: z.enum(["New", "Refurbished", "Used"]),
      })
      .strict(),
    kind: "sku",
  },
  "product.store": {
    scope: "catalog:publish",
    schema: z.object({ store: z.boolean() }).strict(),
    kind: "product",
  },
  "product.quoteOnly": {
    scope: "catalog:publish",
    schema: z.object({ quoteOnly: z.boolean() }).strict(),
    kind: "product",
  },
  "product.publish": {
    scope: "catalog:publish",
    schema: z.object({}).strict(),
    kind: "product",
  },
  "product.archive": {
    scope: "catalog:publish",
    schema: z.object({}).strict(),
    kind: "product",
  },
  "product.unpublish": {
    scope: "catalog:publish",
    schema: z.object({}).strict(),
    kind: "product",
  },
  "product.edit": {
    scope: "catalog:write",
    schema: z
      .object({
        name: z.string().min(3).max(180),
        description: z.string().max(20000),
        highlights: z.array(z.string().max(250)).max(12),
        slug: z.string().regex(/^[a-z0-9-]+$/),
        featured: z.boolean().optional(),
        model: z.string().max(100).optional(),
        brandId: z.string().min(1).optional(),
        categoryId: z.string().min(1).optional(),
        specs: z
          .record(
            z.string().regex(/^[a-zA-Z0-9_ ]{1,40}$/),
            z.union([z.string().max(200), z.number().finite()]),
          )
          .optional(),
        seoTitle: z.string().max(180).optional(),
        seoDescription: z.string().max(300).optional(),
      })
      .strict(),
    kind: "product",
  },
  "price.change": {
    scope: "pricing:write",
    schema: z
      .object({
        price: z.number().int().min(0).max(100000000),
        compareAt: z.number().int().min(0).nullable().default(null),
      })
      .strict(),
    kind: "sku",
  },
  "inventory.adjust": {
    scope: "inventory:adjust",
    schema: z
      .object({
        delta: z.number().int().min(-100000).max(100000),
        reason: z.string().min(5).max(300),
      })
      .strict(),
    kind: "sku",
  },
  "order.cancel": {
    scope: "orders:cancel",
    schema: z.object({ reason: z.string().min(5).max(300) }).strict(),
    kind: "order",
  },
  "order.fulfil": {
    scope: "fulfillments:write",
    schema: z
      .object({
        items: z
          .array(
            z.object({
              itemId: z.string(),
              quantity: z.number().int().positive(),
            }),
          )
          .min(1)
          .max(100),
        carrier: z.string().min(2).max(100),
        tracking: z.string().max(150).optional(),
      })
      .strict(),
    kind: "order",
  },
  "payment.record": {
    scope: "payments:record",
    schema: z
      .object({
        reference: z.string().min(5).max(100),
        amount: z.number().int().positive(),
      })
      .strict(),
    kind: "order",
  },
  "refund.request": {
    scope: "refunds:request",
    schema: z
      .object({
        amount: z.number().int().positive(),
        reason: z.string().min(5).max(300),
      })
      .strict(),
    kind: "order",
  },
} as const;
export type Operation = keyof typeof policy;
export const approvalPolicies = Object.entries(policy).map(
  ([operation, p]) => ({ operation, scope: p.scope }),
);
async function snapshot(tx: Tx, op: Operation, id: string) {
  const kind = policy[op].kind;
  if (kind === "return") {
    await tx.$queryRaw`SELECT id FROM "ReturnRequest" WHERE id=${id} FOR UPDATE`;
    const r = await tx.returnRequest.findUnique({
      where: { id },
      select: { id: true, status: true, items: true, version: true },
    });
    invariant(r, 404, "Return not found.");
    return r;
  }
  if (kind === "sku")
    await tx.$queryRaw`SELECT id FROM "Sku" WHERE id=${id} FOR UPDATE`;
  else if (kind === "product")
    await tx.$queryRaw`SELECT id FROM "Product" WHERE id=${id} FOR UPDATE`;
  else await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${id} FOR UPDATE`;
  if (kind === "product") {
    const p = await tx.product.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        status: true,
        store: true,
        quoteOnly: true,
        version: true,
        description: true,
        slug: true,
        highlights: true,
      },
    });
    invariant(p, 404, "Product not found.");
    return p;
  }
  if (kind === "sku") {
    const s = await tx.sku.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        price: true,
        compareAt: true,
        onHand: true,
        reserved: true,
        version: true,
        specs: true,
        options: true,
        mpn: true,
        warranty: true,
        condition: true,
      },
    });
    invariant(s, 404, "SKU not found.");
    if (op === "inventory.adjust")
      return {
        id: s.id,
        code: s.code,
        onHand: s.onHand,
        reserved: s.reserved,
        version: s.version,
      };
    if (op === "sku.edit")
      return {
        id: s.id,
        code: s.code,
        specs: s.specs,
        options: s.options,
        mpn: s.mpn,
        warranty: s.warranty,
        condition: s.condition,
        version: s.version,
      };
    return {
      id: s.id,
      code: s.code,
      price: s.price,
      compareAt: s.compareAt,
      version: s.version,
    };
  }
  const o = await tx.order.findUnique({
    where: { id },
    select: {
      id: true,
      reference: true,
      status: true,
      paymentStatus: true,
      total: true,
      fulfillmentStatus: true,
      version: true,
    },
  });
  invariant(o, 404, "Order not found.");
  return o;
}
export async function propose(
  actor: Actor,
  operation: string,
  targetId: string,
  raw: unknown,
) {
  invariant(operation in policy, 400, "Unsupported operation.");
  const op = operation as Operation;
  requireScope(actor, policy[op].scope);
  const payload = policy[op].schema.parse(raw);
  if (
    op === "return.receive" &&
    (payload as { disposition: string }).disposition === "RESTOCK"
  )
    requireScope(actor, "inventory:adjust");
  return db.$transaction(async (tx) => {
    const before = await snapshot(tx, op, targetId);
    if (op === "product.publish") await validatePublication(tx, targetId);
    const p = await tx.proposal.create({
      data: {
        actorId: actor.id,
        operation: op,
        targetId,
        payload: json<Prisma.InputJsonValue>(payload),
        before: json<Prisma.InputJsonValue>(before),
        version: before.version,
        expiresAt: new Date(Date.now() + 15 * 60_000),
      },
    });
    await audit(tx, actor, "proposal.create", targetId, before, payload, p.id);
    return p;
  });
}
export async function approve(actor: Actor, id: string) {
  invariant(
    actor.human && actor.source !== "ai",
    403,
    "An authenticated human must approve this change.",
  );
  const current = await actorForUser(actor.id);
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id},3))`;
      const p = await tx.proposal.findUnique({ where: { id } });
      invariant(
        p && p.status === "PENDING" && p.expiresAt > new Date(),
        409,
        "Proposal expired or was already used.",
      );
      const op = p.operation as Operation;
      requireScope(current, policy[op].scope as Permission);
      // Revocation must also invalidate queued or delegated authority.
      const initiator = await tx.user.findUnique({ where: { id: p.actorId } });
      if (initiator)
        requireScope(await actorForUser(p.actorId), policy[op].scope);
      else {
        const client = await tx.apiClient.findUnique({
          where: { id: p.actorId },
        });
        invariant(
          client?.active && client.scopes.includes(policy[op].scope),
          403,
          "Initiator no longer has permission.",
        );
      }
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${p.targetId},4))`;
      const before = await snapshot(tx, op, p.targetId);
      invariant(
        before.version === p.version,
        409,
        "This record changed. Create a fresh preview.",
      );
      const data = policy[op].schema.parse(p.payload);
      await tx.proposal.update({
        where: { id },
        data: { status: "APPROVED", approverId: actor.id },
      });
      const result = await execute(tx, current, op, p.targetId, data, id);
      await audit(tx, current, op, p.targetId, before, data, id);
      return result;
    },
    { timeout: 15000 },
  );
}
async function execute(
  tx: Tx,
  actor: Actor,
  op: Operation,
  id: string,
  raw: unknown,
  proposalId: string,
): Promise<unknown> {
  switch (op) {
    case "return.receive":
      return receiveReturn(
        tx,
        actor,
        id,
        policy[op].schema.parse(raw).disposition,
        proposalId,
      );
    case "sku.edit": {
      const data = policy[op].schema.parse(raw);
      const sku = await tx.sku.update({
        where: { id },
        data: { ...data, version: { increment: 1 } },
      });
      const product = await tx.product.findUniqueOrThrow({
        where: { id: sku.productId },
      });
      if (product.status === "PUBLISHED")
        await validatePublication(tx, product.id);
      await tx.product.update({
        where: { id: product.id },
        data: { version: { increment: 1 } },
      });
      return { id: sku.id, code: sku.code };
    }
    case "product.store": {
      const data = policy[op].schema.parse(raw);
      const product = await tx.product.findUniqueOrThrow({ where: { id } });
      if (data.store && product.status === "PUBLISHED")
        await validatePublication(tx, id);
      return tx.product.update({
        where: { id },
        data: { store: data.store, version: { increment: 1 } },
      });
    }
    case "product.quoteOnly": {
      const data = policy[op].schema.parse(raw);
      const product = await tx.product.update({
        where: { id },
        data: { quoteOnly: data.quoteOnly, version: { increment: 1 } },
      });
      // Turning online purchasing on must meet ordinary price requirements.
      // Validation and the version-bound change roll back together on failure.
      if (product.status === "PUBLISHED") await validatePublication(tx, id);
      return product;
    }
    case "product.publish":
      await validatePublication(tx, id);
      await tx.media.updateMany({
        where: { productId: id },
        data: { public: true },
      });
      return tx.product.update({
        where: { id },
        data: { status: "PUBLISHED", version: { increment: 1 } },
      });
    case "product.archive":
    case "product.unpublish":
      return tx.product.update({
        where: { id },
        data: {
          status: op === "product.archive" ? "ARCHIVED" : "DRAFT",
          version: { increment: 1 },
        },
      });
    case "product.edit": {
      const data = policy[op].schema.parse(raw);
      if (data.brandId)
        invariant(
          await tx.brand.count({ where: { id: data.brandId } }),
          422,
          "Brand no longer exists.",
        );
      if (data.categoryId)
        invariant(
          await tx.category.count({ where: { id: data.categoryId } }),
          422,
          "Category no longer exists.",
        );
      const old = await tx.product.findUniqueOrThrow({ where: { id } });
      if (old.slug !== data.slug)
        await tx.slugRedirect.upsert({
          where: { oldSlug: old.slug },
          create: { oldSlug: old.slug, newSlug: data.slug },
          update: { newSlug: data.slug },
        });
      return tx.product.update({
        where: { id },
        data: { ...data, version: { increment: 1 } },
      });
    }
    case "price.change": {
      const data = policy[op].schema.parse(raw);
      invariant(
        data.compareAt === null || data.compareAt > data.price,
        422,
        "Comparison price must exceed the selling price.",
      );
      return tx.sku.update({
        where: { id },
        data: { ...data, version: { increment: 1 } },
      });
    }
    case "inventory.adjust": {
      const data = policy[op].schema.parse(raw);
      const count =
        await tx.$executeRaw`UPDATE "Sku" SET "onHand"="onHand"+${data.delta},version=version+1 WHERE id=${id} AND "onHand"+${data.delta}>=reserved`;
      invariant(count === 1, 409, "Stock cannot fall below reserved units.");
      await tx.inventoryMovement.create({
        data: {
          skuId: id,
          delta: data.delta,
          reason: data.reason,
          actorId: actor.id,
          reference: proposalId,
        },
      });
      return tx.sku.findUnique({ where: { id } });
    }
    case "order.cancel": {
      const order = await tx.order.findUniqueOrThrow({
        where: { id },
        include: { reservations: true, items: true },
      });
      invariant(
        !["CANCELLED", "COMPLETED", "EXPIRED"].includes(order.status) &&
          order.items.every((i) => i.fulfilled === 0),
        409,
        "This order cannot be cancelled; use the returns workflow for shipped items.",
      );
      for (const r of [...order.reservations].sort((a, b) =>
        a.skuId.localeCompare(b.skuId),
      )) {
        const qty = r.quantity - r.consumed - r.released;
        if (qty > 0) {
          await tx.sku.update({
            where: { id: r.skuId },
            data: { reserved: { decrement: qty }, version: { increment: 1 } },
          });
          await tx.reservation.update({
            where: { id: r.id },
            data: { released: { increment: qty } },
          });
        }
      }
      return tx.order.update({
        where: { id },
        data: {
          status: "CANCELLED",
          expiresAt: null,
          version: { increment: 1 },
        },
      });
    }
    case "order.fulfil": {
      const data = policy[op].schema.parse(raw);
      invariant(
        new Set(data.items.map((i) => i.itemId)).size === data.items.length,
        422,
        "Duplicate fulfillment item.",
      );
      return fulfil(tx, actor, id, data, proposalId);
    }
    case "payment.record": {
      const data = policy[op].schema.parse(raw);
      const order = await tx.order.findUniqueOrThrow({ where: { id } });
      invariant(
        order.paymentMethod === "OFFLINE" &&
          order.paymentStatus === "PENDING" &&
          ["PLACED", "PROCESSING", "COMPLETED"].includes(order.status) &&
          data.amount === order.total,
        409,
        "Payment does not match an unpaid offline order.",
      );
      await tx.payment.create({
        data: { orderId: id, provider: "OFFLINE", status: "RECEIVED", ...data },
      });
      return tx.order.update({
        where: { id },
        data: {
          paymentStatus: "PAID",
          expiresAt: null,
          version: { increment: 1 },
        },
      });
    }
    case "refund.request": {
      const data = policy[op].schema.parse(raw);
      const order = await tx.order.findUniqueOrThrow({
        where: { id },
        include: { refunds: true, payments: true },
      });
      const paid = order.payments
        .filter((p) => p.status === "RECEIVED")
        .reduce((a, p) => a + p.amount, 0);
      const pending = order.refunds
        .filter((r) => r.status !== "REJECTED")
        .reduce((a, r) => a + r.amount, 0);
      invariant(
        data.amount <= paid - pending,
        422,
        "Refund exceeds the remaining paid amount.",
      );
      await tx.order.update({
        where: { id },
        data: { version: { increment: 1 } },
      });
      return tx.refundRequest.create({ data: { orderId: id, ...data } });
    }
  }
}
