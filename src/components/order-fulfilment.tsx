"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "./store-client";
export function OrderFulfilment({
  id,
  items,
}: {
  id: string;
  items: { id: string; name: string; remaining: number }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className="form-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setBusy(true);
        setError("");
        try {
          const lines = items
            .map((i) => ({ itemId: i.id, quantity: Number(fd.get(i.id)) }))
            .filter((i) => i.quantity > 0);
          if (!lines.length)
            throw new Error("Choose at least one item to ship.");
          const proposal = await api<{ id: string }>("admin/proposals", {
            operation: "order.fulfil",
            targetId: id,
            payload: {
              carrier: String(fd.get("carrier")),
              tracking: String(fd.get("tracking") ?? ""),
              items: lines,
            },
          });
          router.push(`/admin/proposals/${proposal.id}`);
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy}>
        <label>
          Carrier / fulfilment method
          <input
            name="carrier"
            required
            placeholder="Courier or hand delivery"
          />
        </label>
        <label>
          Tracking reference (optional)
          <input name="tracking" />
        </label>
        <p className="form-help">
          Select the quantities shipping now. Use 0 to leave an item for later.
        </p>
        {items.map((i) => (
          <label key={i.id} className="erp-fulfil-line">
            <span>
              {i.name}
              <small className="erp-cell-secondary">
                {i.remaining} remaining
              </small>
            </span>
            <input
              aria-label={`Ship quantity: ${i.name}`}
              name={i.id}
              type="number"
              min={0}
              max={i.remaining}
              step={1}
              defaultValue={i.remaining}
              required
            />
          </label>
        ))}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary">
          {busy ? "Preparing…" : "Review shipment"}
        </button>
      </fieldset>
    </form>
  );
}
