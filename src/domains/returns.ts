import { z } from "zod";
import { db, type Tx } from "@/lib/db";
import { audit, requireScope, type Actor } from "./identity";
import { invariant } from "@/lib/errors";
export async function reviewReturn(actor: Actor, id: string, raw: unknown) {
  requireScope(actor, "returns:write");
  const data = z
    .object({ status: z.enum(["APPROVED", "REJECTED"]) })
    .strict()
    .parse(raw);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ReturnRequest" WHERE id=${id} FOR UPDATE`;
    const row = await tx.returnRequest.findUnique({ where: { id } });
    invariant(
      row && row.status === "REQUESTED",
      409,
      "Only a pending return can be reviewed.",
    );
    const result = await tx.returnRequest.update({
      where: { id },
      data: { status: data.status, version: { increment: 1 } },
    });
    await audit(tx, actor, "return.review", id, { status: row.status }, data);
    return result;
  });
}
export async function receiveReturn(
  tx: Tx,
  actor: Actor,
  id: string,
  disposition: "RESTOCK" | "DAMAGED",
  proposalId: string,
) {
  requireScope(actor, "returns:write");
  if (disposition === "RESTOCK") requireScope(actor, "inventory:adjust");
  const r = await tx.returnRequest.findUniqueOrThrow({ where: { id } });
  invariant(
    r.status === "APPROVED",
    409,
    "Approve the return before recording receipt.",
  );
  for (const line of r.items as { itemId: string; quantity: number }[]) {
    await tx.$queryRaw`SELECT id FROM "OrderItem" WHERE id=${line.itemId} FOR UPDATE`;
    const item = await tx.orderItem.findFirst({
      where: { id: line.itemId, orderId: r.orderId },
    });
    invariant(
      item &&
        line.quantity > 0 &&
        line.quantity <= item.fulfilled - item.returned,
      409,
      "Return quantity is no longer available.",
    );
    await tx.orderItem.update({
      where: { id: item.id },
      data: { returned: { increment: line.quantity } },
    });
    if (disposition === "RESTOCK") {
      await tx.sku.update({
        where: { id: item.skuId },
        data: {
          onHand: { increment: line.quantity },
          version: { increment: 1 },
        },
      });
      await tx.inventoryMovement.create({
        data: {
          skuId: item.skuId,
          delta: line.quantity,
          actorId: actor.id,
          reason: "Inspected return received and restocked",
          reference: id,
        },
      });
    }
  }
  const result = await tx.returnRequest.update({
    where: { id },
    data: { status: "RECEIVED", disposition, version: { increment: 1 } },
  });
  await audit(
    tx,
    actor,
    "return.receive",
    id,
    { status: r.status },
    { disposition, status: "RECEIVED" },
    proposalId,
  );
  return result;
}
