import { db } from "@/lib/db";
import { money } from "@/lib/utils";
export async function OrderProposalSummary({
  operation,
  targetId,
  before,
  payload,
}: {
  operation: string;
  targetId: string;
  before: unknown;
  payload: unknown;
}) {
  const current = before as {
    reference: string;
    status: string;
    paymentStatus: string;
    fulfillmentStatus: string;
    total: number;
  };
  const change = payload as {
    carrier?: string;
    tracking?: string;
    reference?: string;
    amount?: number;
    reason?: string;
    items?: { itemId: string; quantity: number }[];
  };
  const items =
    operation === "order.fulfil"
      ? await db.orderItem.findMany({
          where: { orderId: targetId },
          select: { id: true, snapshot: true },
        })
      : [];
  return (
    <div className="erp-proposal-summary">
      <dl className="erp-details">
        <dt>Sales order</dt>
        <dd>
          <b>{current.reference}</b>
        </dd>
        <dt>Order total</dt>
        <dd>{money(current.total)}</dd>
        <dt>Current status</dt>
        <dd>
          {current.status.toLowerCase()} · payment{" "}
          {current.paymentStatus.toLowerCase()} ·{" "}
          {current.fulfillmentStatus.toLowerCase()}
        </dd>
      </dl>
      {operation === "order.fulfil" && (
        <>
          <h3>Items shipping now</h3>
          <ul className="erp-record-list">
            {change.items?.map((i) => (
              <li key={i.itemId}>
                <b>
                  {i.quantity} ×{" "}
                  {(
                    items.find((line) => line.id === i.itemId)?.snapshot as
                      | { name?: string }
                      | undefined
                  )?.name ?? "Order item"}
                </b>
              </li>
            ))}
          </ul>
          <p>
            Delivery method: <b>{change.carrier}</b>
          </p>
          {change.tracking && <p>Tracking reference: {change.tracking}</p>}
        </>
      )}
      {operation === "payment.record" && (
        <>
          <h3>Record verified receipt</h3>
          <p>
            Received: <b>{money(change.amount ?? 0)}</b>
          </p>
          <p>
            Receipt reference: <b>{change.reference}</b>
          </p>
        </>
      )}
      {operation === "refund.request" && (
        <>
          <h3>Request refund of {money(change.amount ?? 0)}</h3>
          <p>This creates a refund request. It does not transfer money.</p>
        </>
      )}
      {operation === "order.cancel" && (
        <>
          <h3>Cancel this order</h3>
          <p>
            Unshipped reservations will be released. Payment is not refunded
            automatically.
          </p>
        </>
      )}
      {change.reason && <p>Reason: {change.reason}</p>}
    </div>
  );
}
