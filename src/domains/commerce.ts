import { z } from "zod";
import { db, type Tx } from "@/lib/db";
import { invariant } from "@/lib/errors";
import { hash, secret, idempotent, audit, type Actor } from "./identity";
import { calculate } from "./pricing";
import { emirates, json } from "@/lib/utils";
import type { Prisma } from "@/generated/prisma/client";

export const addressInput = z
  .object({
    name: z.string().trim().min(2).max(100),
    phone: z
      .string()
      .trim()
      .transform((phone) => phone.replace(/[ ()-]/g, ""))
      .pipe(
        z
          .string()
          .regex(/^\+971[0-9]{8,9}$/, "Use a UAE number starting +971."),
      ),
    emirate: z.enum(emirates as [string, ...string[]]),
    city: z.string().trim().min(2).max(100),
    line1: z.string().trim().min(5).max(250),
    landmark: z.string().trim().max(200).optional(),
  })
  .strict();
export const checkoutInput = z
  .object({
    email: z.email().max(200),
    address: addressInput,
    paymentMethod: z.enum(["OFFLINE", "SIMULATOR"]),
    coupon: z.string().max(40).optional(),
  })
  .strict();
export type CheckoutInput = z.infer<typeof checkoutInput>;
export async function getCart(token: string | undefined, userId?: string) {
  if (!token) return null;
  const cart = await db.cart.findUnique({
    where: { tokenHash: hash(token) },
    include: {
      items: {
        include: {
          sku: { include: { product: { include: { media: true } } } },
        },
        orderBy: { id: "asc" },
      },
    },
  });
  if (cart?.userId && cart.userId !== userId) return null;
  return cart;
}
export async function ensureCart(token?: string, userId?: string) {
  const current = await getCart(token, userId);
  if (current) {
    if (userId && !current.userId) {
      await db.$transaction(async (tx) => {
        const others = await tx.cart.findMany({
          where: { userId, id: { not: current.id } },
          include: { items: true },
        });
        for (const other of others)
          for (const item of other.items) {
            const found = await tx.cartItem.findUnique({
              where: {
                cartId_skuId: { cartId: current.id, skuId: item.skuId },
              },
            });
            await tx.cartItem.upsert({
              where: {
                cartId_skuId: { cartId: current.id, skuId: item.skuId },
              },
              create: {
                cartId: current.id,
                skuId: item.skuId,
                quantity: item.quantity,
              },
              update: {
                quantity: Math.min(99, (found?.quantity ?? 0) + item.quantity),
              },
            });
          }
        await tx.cart.deleteMany({
          where: { id: { in: others.map((c) => c.id) } },
        });
        await tx.cart.update({ where: { id: current.id }, data: { userId } });
      });
    }
    return { cart: current, token: token! };
  }
  const value = secret();
  const cart = await db.cart.create({
    data: { tokenHash: hash(value), userId },
    include: {
      items: {
        include: {
          sku: { include: { product: { include: { media: true } } } },
        },
        orderBy: { id: "asc" },
      },
    },
  });
  return { cart, token: value };
}
export async function setCartItem(cartId: string, raw: unknown) {
  const { skuId, quantity } = z
    .object({ skuId: z.string(), quantity: z.number().int().min(0).max(99) })
    .strict()
    .parse(raw);
  const sku = await db.sku.findUnique({
    where: { id: skuId },
    include: { product: true },
  });
  invariant(
    sku &&
      sku.active &&
      sku.product.status === "PUBLISHED" &&
      sku.price !== null,
    404,
    "This item is no longer available.",
  );
  invariant(
    quantity <= sku.onHand - sku.reserved,
    409,
    "The requested quantity is not available.",
  );
  const existing = await db.cartItem.findUnique({
    where: { cartId_skuId: { cartId, skuId } },
  });
  invariant(
    existing ||
      !quantity ||
      (await db.cartItem.count({ where: { cartId } })) < 100,
    422,
    "A cart can contain up to 100 distinct SKUs.",
  );
  if (!quantity) await db.cartItem.deleteMany({ where: { cartId, skuId } });
  else
    await db.cartItem.upsert({
      where: { cartId_skuId: { cartId, skuId } },
      create: { cartId, skuId, quantity },
      update: { quantity },
    });
}
async function quoteTx(
  tx: Tx,
  cartId: string,
  emirate: string,
  couponCode?: string,
) {
  const cart = await tx.cart.findUnique({
    where: { id: cartId },
    include: {
      items: {
        include: { sku: { include: { product: true } } },
        orderBy: { id: "asc" },
      },
    },
  });
  invariant(cart?.items.length, 422, "Your cart is empty.");
  for (const { sku, quantity } of cart.items)
    invariant(
      sku.active &&
        sku.product.status === "PUBLISHED" &&
        sku.price !== null &&
        sku.onHand - sku.reserved >= quantity,
      409,
      `${sku.product.name} is unavailable in the requested quantity.`,
    );
  const zone = await tx.shippingZone.findFirst({
    where: { active: true, emirates: { has: emirate } },
    orderBy: { rate: "asc" },
  });
  invariant(zone, 422, "Delivery is not configured for this emirate.");
  const coupon = couponCode
    ? await tx.coupon.findUnique({ where: { code: couponCode.toUpperCase() } })
    : null;
  const subtotal = cart.items.reduce(
    (a, l) => a + l.sku.price! * l.quantity,
    0,
  );
  if (couponCode)
    invariant(
      coupon?.active &&
        coupon.startsAt <= new Date() &&
        coupon.endsAt > new Date() &&
        coupon.uses < coupon.maxUses &&
        subtotal >= coupon.minimum,
      422,
      "This coupon is not valid for your cart.",
    );
  const taxSetting = await tx.setting.findUnique({ where: { key: "tax" } });
  const tax = z
    .object({
      registered: z.boolean(),
      bps: z.number().int().min(0).max(10000),
      inclusive: z.boolean(),
      trn: z.string().optional(),
    })
    .parse(
      taxSetting?.value ?? { registered: false, bps: 0, inclusive: false },
    );
  const shipping =
    zone.freeAbove !== null && subtotal >= (zone.freeAbove ?? 0)
      ? 0
      : zone.rate;
  return {
    cart,
    zone,
    coupon,
    totals: calculate(
      cart.items.map((l) => ({ price: l.sku.price!, quantity: l.quantity })),
      shipping,
      coupon?.percent ?? 0,
      tax.registered ? tax.bps : 0,
      tax.inclusive,
    ),
    tax,
  };
}
export async function quote(cartId: string, emirate: string, coupon?: string) {
  return db.$transaction(async (tx) => {
    const q = await quoteTx(tx, cartId, emirate, coupon);
    return {
      totals: q.totals,
      shipping: { name: q.zone.name, estimate: q.zone.estimate },
      paymentMethods: paymentMethods(),
    };
  });
}
export function paymentMethods() {
  return [
    ...(process.env.OFFLINE_PAYMENTS_ENABLED === "true" ? ["OFFLINE"] : []),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.DEV_PAYMENT_SIMULATOR === "true"
      ? ["SIMULATOR"]
      : []),
  ];
}
export async function checkout(
  cartId: string,
  userId: string | undefined,
  raw: unknown,
  key: string,
) {
  const data = checkoutInput.parse(raw);
  invariant(
    paymentMethods().includes(data.paymentMethod),
    422,
    "This payment method is not enabled.",
  );
  return db.$transaction(
    async (tx) =>
      idempotent(tx, userId ?? cartId, "checkout", key, data, async () => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${cartId},1))`;
        await tx.$queryRaw`SELECT s.id FROM "Sku" s JOIN "CartItem" ci ON ci."skuId"=s.id WHERE ci."cartId"=${cartId} ORDER BY s.id FOR UPDATE OF s`;
        const { cart, zone, coupon, totals, tax } = await quoteTx(
          tx,
          cartId,
          data.address.emirate,
          data.coupon,
        );
        invariant(
          process.env.NODE_ENV !== "production" ||
            cart.items.every((i) => !i.sku.product.demo),
          422,
          "Development products cannot be ordered in production.",
        );
        invariant(
          !cart.userId || cart.userId === userId,
          403,
          "This cart belongs to another customer.",
        );
        for (const item of [...cart.items].sort((a, b) =>
          a.skuId.localeCompare(b.skuId),
        )) {
          const updated =
            await tx.$executeRaw`UPDATE "Sku" SET reserved=reserved+${item.quantity},version=version+1 WHERE id=${item.skuId} AND "onHand"-reserved>=${item.quantity}`;
          invariant(
            updated === 1,
            409,
            "Stock changed. Please review your cart.",
          );
        }
        if (coupon) {
          const used =
            await tx.$executeRaw`UPDATE "Coupon" SET uses=uses+1 WHERE id=${coupon.id} AND uses<"maxUses"`;
          invariant(used === 1, 409, "Coupon redemption limit reached.");
        }
        const guestToken = secret();
        const order = await tx.order.create({
          data: {
            reference: `IFT-${new Date().getUTCFullYear()}-${secret().slice(0, 8).toUpperCase()}`,
            userId,
            email: data.email,
            address: data.address,
            guestTokenHash: hash(guestToken),
            paymentMethod: data.paymentMethod,
            subtotal: totals.subtotal,
            discount: totals.discount,
            tax: totals.tax,
            shipping: totals.shipping,
            total: totals.total,
            shippingSnapshot: {
              name: zone.name,
              estimate: zone.estimate,
              rate: totals.shipping,
            },
            termsSnapshot: {
              taxRegistered: tax.registered,
              taxInclusive: tax.inclusive,
              taxBps: tax.bps,
              coupon: coupon?.code ?? null,
            },
            demo: data.paymentMethod === "SIMULATOR",
            expiresAt: new Date(Date.now() + 86400000),
            items: {
              create: cart.items.map((l, i) => ({
                skuId: l.skuId,
                quantity: l.quantity,
                unitPrice: l.sku.price!,
                discount: totals.discounts[i],
                total: l.sku.price! * l.quantity - totals.discounts[i],
                snapshot: {
                  name: l.sku.product.name,
                  code: l.sku.code,
                  options: l.sku.options,
                  specs: l.sku.specs,
                  warranty: l.sku.warranty,
                  slug: l.sku.product.slug,
                },
              })),
            },
            reservations: {
              create: cart.items.map((l) => ({
                skuId: l.skuId,
                quantity: l.quantity,
              })),
            },
          },
        });
        await tx.cartItem.deleteMany({ where: { cartId } });
        await audit(
          tx,
          { id: userId ?? cartId, source: "customer", human: true, scopes: [] },
          "order.create",
          order.id,
          undefined,
          { reference: order.reference, total: order.total, demo: order.demo },
        );
        await tx.job.create({
          data: {
            type: "ORDER_NOTIFICATION",
            actorId: userId ?? cartId,
            payload: { orderId: order.id },
            dedupeKey: `order-notification:${order.id}`,
          },
        });
        return { id: order.id, reference: order.reference, guestToken };
      }),
    { timeout: 15000 },
  );
}
export async function ownedOrder(
  idOrReference: string,
  userId?: string,
  token?: string,
) {
  invariant(userId || token, 404, "Order not found or access has expired.");
  const order = await db.order.findFirst({
    where: {
      OR: [{ id: idOrReference }, { reference: idOrReference }],
      AND: [
        {
          OR: [
            ...(userId ? [{ userId }] : []),
            ...(token ? [{ guestTokenHash: hash(token) }] : []),
          ],
        },
      ],
    },
    include: {
      items: true,
      shipments: true,
      payments: true,
      returns: true,
      refunds: true,
    },
  });
  invariant(order, 404, "Order not found or access has expired.");
  return order;
}
export async function requestReturn(userId: string, raw: unknown) {
  const data = z
    .object({
      orderId: z.string(),
      itemId: z.string(),
      quantity: z.number().int().positive(),
      reason: z.string().min(10).max(1000),
    })
    .strict()
    .parse(raw);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${data.orderId},2))`;
    const order = await tx.order.findFirst({
      where: { id: data.orderId, userId },
      include: { items: true, returns: true },
    });
    invariant(order, 404, "Order not found.");
    const item = order.items.find((i) => i.id === data.itemId);
    const pending = order.returns
      .filter((r) => !["REJECTED", "RECEIVED"].includes(r.status))
      .flatMap((r) => r.items as { itemId: string; quantity: number }[])
      .filter((i) => i.itemId === data.itemId)
      .reduce((a, i) => a + i.quantity, 0);
    invariant(
      item && data.quantity <= item.fulfilled - item.returned - pending,
      422,
      "Quantity exceeds the remaining returnable items.",
    );
    return tx.returnRequest.create({
      data: {
        orderId: order.id,
        reason: data.reason,
        items: [{ itemId: data.itemId, quantity: data.quantity }],
      },
    });
  });
}
export async function fulfil(
  tx: Tx,
  actor: Actor,
  orderId: string,
  data: {
    items: { itemId: string; quantity: number }[];
    carrier: string;
    tracking?: string;
  },
  proposalId: string,
) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { items: true, reservations: true },
  });
  invariant(
    order && ["PLACED", "PROCESSING"].includes(order.status),
    409,
    "Order cannot be fulfilled.",
  );
  for (const l of data.items) {
    const item = order.items.find((i) => i.id === l.itemId);
    invariant(
      item && l.quantity > 0 && l.quantity <= item.quantity - item.fulfilled,
      422,
      "Invalid fulfillment quantity.",
    );
    const count =
      await tx.$executeRaw`UPDATE "Sku" SET "onHand"="onHand"-${l.quantity},reserved=reserved-${l.quantity},version=version+1 WHERE id=${item.skuId} AND reserved>=${l.quantity} AND "onHand">=${l.quantity}`;
    invariant(
      count === 1,
      409,
      "Reservation is inconsistent. Investigate before fulfilling.",
    );
    await tx.orderItem.update({
      where: { id: item.id },
      data: { fulfilled: { increment: l.quantity } },
    });
    await tx.reservation.update({
      where: { orderId_skuId: { orderId, skuId: item.skuId } },
      data: { consumed: { increment: l.quantity } },
    });
    await tx.inventoryMovement.create({
      data: {
        skuId: item.skuId,
        delta: -l.quantity,
        actorId: actor.id,
        reason: "Shipment",
        reference: order.reference,
      },
    });
  }
  const items = await tx.orderItem.findMany({ where: { orderId } });
  const done = items.every((i) => i.fulfilled === i.quantity);
  await tx.order.update({
    where: { id: orderId },
    data: {
      fulfillmentStatus: done ? "FULFILLED" : "PARTIAL",
      status: done ? "COMPLETED" : "PROCESSING",
      version: { increment: 1 },
      expiresAt: null,
    },
  });
  const shipment = await tx.shipment.create({
    data: {
      orderId,
      carrier: data.carrier,
      tracking: data.tracking,
      items: json<Prisma.InputJsonValue>(data.items),
    },
  });
  await audit(tx, actor, "order.fulfil", orderId, undefined, data, proposalId);
  return shipment;
}
