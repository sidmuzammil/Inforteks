"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle } from "lucide-react";
import { api } from "./store-client";

export function QuoteInquiry({
  product,
}: {
  product: {
    name: string;
    slug: string;
    skuId: string;
    code: string;
    mpn: string | null;
  };
}) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api("storefront/inquiries", {
        name: String(form.get("name")),
        email: String(form.get("email")),
        subject: `Quote: ${product.name}`.slice(0, 150),
        message: String(form.get("message")),
        quantity: Number(form.get("quantity")),
        productSlug: product.slug,
        skuId: product.skuId,
      });
      setSent(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Your request could not be saved. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (sent)
    return (
      <div className="form-stack" role="status">
        <CheckCircle size={30} aria-hidden="true" />
        <h2>Request received.</h2>
        <p>
          Your request for {product.name} has been saved for the Inforteks team.
          Pricing and availability will be confirmed in your quotation.
        </p>
        <Link href={`/product/${product.slug}`} className="button">
          Back to product
        </Link>
      </div>
    );
  return (
    <form className="form-stack" onSubmit={submit} aria-busy={busy}>
      <p>
        <strong>{product.name}</strong>
        <br />
        <small>{product.mpn || product.code}</small>
      </p>
      <label>
        Your name
        <input
          name="name"
          autoComplete="name"
          minLength={2}
          maxLength={100}
          required
        />
      </label>
      <label>
        Email address
        <input
          name="email"
          type="email"
          autoComplete="email"
          maxLength={200}
          required
        />
      </label>
      <label>
        Quantity needed
        <input
          name="quantity"
          type="number"
          min={1}
          max={10000}
          step={1}
          defaultValue={1}
          required
        />
      </label>
      <label>
        Your requirements
        <textarea
          name="message"
          minLength={10}
          maxLength={5000}
          placeholder="Tell us about your printer model, required quantity or purchasing requirements."
          required
        />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <p className="muted">
        Submitting a request does not place an order or reserve stock.
      </p>
      <button className="button primary" disabled={busy}>
        {busy ? "Sending request…" : "Request a quote"}
        <ArrowRight size={17} aria-hidden="true" />
      </button>
    </form>
  );
}
