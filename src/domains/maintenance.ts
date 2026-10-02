import { db } from "@/lib/db";
import { audit } from "./identity";
export async function expireReservations() {
  const expired = await db.order.findMany({
    where: {
      expiresAt: { lt: new Date() },
      status: "PLACED",
      paymentStatus: "PENDING",
      fulfillmentStatus: "UNFULFILLED",
    },
    take: 50,
    select: { id: true },
  });
  for (const { id } of expired)
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${id} FOR UPDATE`;
      const order = await tx.order.findUniqueOrThrow({
        where: { id },
        include: { reservations: true },
      });
      if (
        order.status !== "PLACED" ||
        order.paymentStatus !== "PENDING" ||
        !order.expiresAt ||
        order.expiresAt > new Date() ||
        order.fulfillmentStatus !== "UNFULFILLED"
      )
        return;
      for (const r of [...order.reservations].sort((a, b) =>
        a.skuId.localeCompare(b.skuId),
      )) {
        const qty = r.quantity - r.consumed - r.released;
        if (qty <= 0) continue;
        await tx.sku.update({
          where: { id: r.skuId },
          data: { reserved: { decrement: qty }, version: { increment: 1 } },
        });
        await tx.reservation.update({
          where: { id: r.id },
          data: { released: { increment: qty } },
        });
      }
      await tx.order.update({
        where: { id },
        data: { status: "EXPIRED", expiresAt: null, version: { increment: 1 } },
      });
      await audit(
        tx,
        { id: "system:expiry", scopes: [], human: false, source: "system" },
        "order.expire",
        id,
        { status: order.status },
        { status: "EXPIRED" },
      );
    });
  // An interrupted external action has an uncertain outcome. Require review instead of replaying it.
  await db.job.updateMany({
    where: {
      status: "RUNNING",
      lockedAt: { lt: new Date(Date.now() - 10 * 60_000) },
    },
    data: {
      status: "FAILED",
      lastError:
        "Worker lease expired. Inspect recorded outcomes before re-queuing.",
    },
  });
  return expired.length;
}
