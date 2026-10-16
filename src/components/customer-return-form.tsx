"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function CustomerReturnForm({
  orderId,
  items,
}: {
  orderId: string;
  items: { id: string; name: string }[];
}) {
  const router = useRouter();
  const attempt = useRef<{ key: string; body: string } | null>(null);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || saved) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    let rejection = "";
    try {
      if (!attempt.current) {
        const fields = new FormData(event.currentTarget);
        attempt.current = {
          key: crypto.randomUUID(),
          body: JSON.stringify({
            orderId,
            itemId: String(fields.get("itemId") ?? ""),
            quantity: Number(fields.get("quantity")),
            reason: String(fields.get("reason") ?? ""),
          }),
        };
      }
      const response = await fetch("/api/v1/account/returns", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": attempt.current.key,
        },
        body: attempt.current.body,
      });
      const result = await response.json();
      if (!response.ok) {
        rejection = result.error?.message ?? "The return request failed.";
        // A failed recovery check can happen before reaching the saved result
        // (for example HTTP 429). It cannot clear an uncertain original attempt.
        if (
          !unconfirmed &&
          [400, 401, 403, 404, 405, 409, 413, 422, 429].includes(
            response.status,
          )
        )
          attempt.current = null;
        throw new Error(rejection);
      }
      if (
        typeof result.data?.id !== "string" ||
        result.data.orderId !== orderId
      )
        throw new Error("The return request response was incomplete.");
      setSaved(true);
      setUnconfirmed(false);
      attempt.current = null;
      router.refresh();
    } catch (error) {
      setUnconfirmed(Boolean(attempt.current));
      setError(
        attempt.current
          ? `We couldn’t confirm your return request. Check its status below before submitting another request.${rejection ? ` ${rejection}` : ""}`
          : (error as Error).message,
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (saved)
    return (
      <div className="form-stack">
        <p className="notice success" role="status">
          Return request saved. A return request does not issue a refund.
        </p>
        <Link href="/account/returns">View return requests</Link>
      </div>
    );

  return (
    <form className="form-stack" onSubmit={submit}>
      <fieldset className="form-grid" disabled={busy || unconfirmed}>
        <legend>Return details</legend>
        <label>
          Item
          <select name="itemId" required>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Quantity
          <input
            name="quantity"
            type="number"
            defaultValue={1}
            min={1}
            step={1}
            required
          />
        </label>
        <label className="full">
          Reason
          <textarea name="reason" minLength={10} maxLength={1000} required />
        </label>
      </fieldset>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {unconfirmed && (
        <p className="form-help">
          Your original details are kept while this page stays open. You can
          also review your <Link href="/account/returns">return requests</Link>.
        </p>
      )}
      <div>
        <button className="button primary" disabled={busy}>
          {busy
            ? "Checking…"
            : unconfirmed
              ? "Check return status"
              : "Submit request"}
        </button>
      </div>
    </form>
  );
}
