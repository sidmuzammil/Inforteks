"use client";
import { useState, useEffect, useRef, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowLeft,
  ShoppingBag,
  Plus,
  Minus,
  CheckCircle,
  LogOut,
  Printer,
} from "lucide-react";
import { api, useShop } from "./store-client";
import { money, emirates } from "@/lib/utils";
import { useDeliveryLocation, saveDeliveryLocation } from "./delivery-location";
import { comingSoon } from "@/lib/delivery-location";
import { DeliveryAddressFields } from "./delivery-address";
import { readDeliveryAddress, type DeliveryAddress } from "@/lib/address";
import { aedToFils } from "@/lib/merchant-pricing";

export type Field = {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  options?: { label: string; value: string }[];
  value?: unknown;
  help?: string;
  min?: number;
  max?: number;
};
export function Fields({
  fields,
  values,
}: {
  fields: Field[];
  values?: Record<string, unknown>;
}) {
  return (
    <>
      {fields.map((f) => (
        <label
          key={f.name}
          className={f.type === "textarea" || f.type === "json" ? "full" : ""}
        >
          {f.label}
          {f.type === "select" ? (
            <select
              aria-label={f.label}
              name={f.name}
              defaultValue={String(values?.[f.name] ?? f.value ?? "")}
              required={f.required !== false}
            >
              {f.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : f.type === "textarea" || f.type === "json" ? (
            <textarea
              aria-label={f.label}
              name={f.name}
              defaultValue={
                f.type === "json"
                  ? JSON.stringify(values?.[f.name] ?? f.value ?? {}, null, 2)
                  : String(values?.[f.name] ?? f.value ?? "")
              }
              required={f.required !== false}
            />
          ) : f.type === "checkbox" ? (
            <input
              aria-label={f.label}
              type="checkbox"
              name={f.name}
              defaultChecked={Boolean(values?.[f.name] ?? f.value)}
            />
          ) : (
            <input
              aria-label={f.label}
              name={f.name}
              type={f.type === "money" ? "text" : (f.type ?? "text")}
              inputMode={f.type === "money" ? "decimal" : undefined}
              defaultValue={
                f.type === "money"
                  ? (Number(values?.[f.name] ?? f.value ?? 0) / 100).toFixed(2)
                  : String(values?.[f.name] ?? f.value ?? "")
              }
              required={f.required !== false}
              min={f.min}
              max={f.max}
              step={f.type === "number" ? "1" : undefined}
            />
          )}{" "}
          {f.help && <small className="form-help">{f.help}</small>}
        </label>
      ))}
    </>
  );
}
export function readFields(form: HTMLFormElement, fields: Field[]) {
  const fd = new FormData(form);
  return Object.fromEntries(
    fields.map((f) => [
      f.name,
      f.type === "money"
        ? aedToFils(fd.get(f.name))
        : f.type === "number"
          ? Number(fd.get(f.name))
          : f.type === "checkbox"
            ? fd.has(f.name)
            : f.type === "json"
              ? JSON.parse(String(fd.get(f.name)))
              : String(fd.get(f.name) ?? ""),
    ]),
  );
}
export function MutationForm({
  fields,
  endpoint,
  method = "POST",
  label = "Save changes",
  values,
  success = "Changes saved.",
  onSaved,
}: {
  fields: Field[];
  endpoint: string;
  method?: string;
  label?: string;
  values?: Record<string, unknown>;
  success?: string;
  onSaved?: (result: unknown) => void;
}) {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <form
      className="form-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        setMessage("");
        try {
          const result = await api(
            endpoint,
            readFields(e.currentTarget, fields),
            method,
          );
          setMessage(success);
          onSaved?.(result);
          router.refresh();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="form-grid">
        <Fields fields={fields} values={values} />
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice success" role="status">
          {message}
        </p>
      )}
      <div>
        <button className="button primary" disabled={busy}>
          {busy ? "Saving…" : label}
          <ArrowRight size={16} />
        </button>
      </div>
    </form>
  );
}
export function SignOut({ staff = false }: { staff?: boolean }) {
  const router = useRouter();
  return (
    <button
      className="button"
      onClick={async () => {
        await api("/api/auth/sign-out", {});
        router.push(staff ? "/admin/login" : "/login");
        router.refresh();
      }}
    >
      <LogOut size={15} />
      Sign out
    </button>
  );
}
type CartLine = {
  id: string;
  skuId: string;
  quantity: number;
  name: string;
  slug: string | null;
  code: string | null;
  price: number | null;
  available: number;
  image: string | null;
};
type Cart = { id?: string; items: CartLine[] };
type Quote = {
  totals: {
    subtotal: number;
    discount: number;
    shipping: number;
    tax: number;
    total: number;
    taxInclusive: boolean;
  };
  shipping: { name: string; estimate: string };
  paymentMethods: string[];
};
export function CartPage({ checkout = false }: { checkout?: boolean }) {
  const delivery = useDeliveryLocation();
  const [addresses, setAddresses] = useState<
    (DeliveryAddress & { id: string })[]
  >([]);
  const [cart, setCart] = useState<Cart | null>(null);
  const [cartError, setCartError] = useState("");
  const [cartLoading, setCartLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [chosenRegion, setRegion] = useState<string | null>(null);
  const region = chosenRegion ?? delivery.emirate ?? "Dubai";
  const countryAvailable = delivery.country === "AE";
  const [coupon, setCoupon] = useState("");
  const [quoteAttempt, setQuoteAttempt] = useState(0);
  const [quoteResult, setQuoteResult] = useState<{
    input: string;
    quote?: Quote;
    error?: string;
  } | null>(null);
  const quoteInput = JSON.stringify({
    cart,
    region,
    coupon,
    country: delivery.country,
    attempt: quoteAttempt,
    cartLoading,
    cartError,
  });
  const quote = quoteResult?.input === quoteInput ? quoteResult.quote : null;
  const quoteError = quoteResult?.input === quoteInput ? quoteResult.error : "";
  const orderAttempt = useRef<{
    key: string;
    body: string;
    address: DeliveryAddress;
  } | null>(null);
  const [orderUnconfirmed, setOrderUnconfirmed] = useState(false);
  const router = useRouter();
  const shop = useShop();
  async function load() {
    setCartLoading(true);
    setCartError("");
    setError("");
    try {
      setCart(await api<Cart>("storefront/carts"));
    } catch (e) {
      setCartError((e as Error).message);
    } finally {
      setCartLoading(false);
    }
  }
  useEffect(() => {
    void api<Cart>("storefront/carts")
      .then(setCart)
      .catch((e) => setCartError(e.message))
      .finally(() => setCartLoading(false));
    void api<(DeliveryAddress & { id: string })[]>("account/addresses")
      .then(setAddresses)
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!cart?.items.length || !countryAvailable || cartLoading || cartError)
      return;
    let cancelled = false;
    const timer = setTimeout(() => {
      api<Quote>("storefront/carts/quote", {
        emirate: region,
        ...(coupon ? { coupon } : {}),
      })
        .then((q) => {
          if (!cancelled) {
            setQuoteResult({ input: quoteInput, quote: q });
          }
        })
        .catch((e) => {
          if (!cancelled) {
            setQuoteResult({ input: quoteInput, error: e.message });
          }
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    cart,
    region,
    coupon,
    countryAvailable,
    cartLoading,
    cartError,
    quoteInput,
  ]);
  async function update(skuId: string, quantity: number) {
    setBusy(true);
    setError("");
    try {
      await api("storefront/carts", { skuId, quantity }, "PATCH");
      await load();
      await shop.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!cart)
    return (
      <div className="page-container">
        <p className="notice" role={cartError ? "alert" : "status"}>
          {cartError || "Loading your cart…"}
        </p>
        {cartError && (
          <button
            className="button"
            disabled={cartLoading}
            onClick={() => void load()}
          >
            Retry loading cart
          </button>
        )}
      </div>
    );
  if (!cart.items.length)
    return (
      <div className="page-container">
        <div className="page-heading">
          <h1>Your cart</h1>
        </div>
        <div className="empty-state">
          <ShoppingBag size={42} />
          <h2>Your next upgrade starts here</h2>
          <p>
            Your cart is empty. Explore our departments to find your next
            essential.
          </p>
          <Link className="button primary" href="/categories">
            Start exploring <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    );
  async function placeOrder(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (
      busy ||
      (!orderAttempt.current &&
        (cartLoading ||
          cartError ||
          !countryAvailable ||
          !quote?.paymentMethods.length))
    )
      return;
    setBusy(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    let rejection = "";
    try {
      if (!orderAttempt.current) {
        const address = readDeliveryAddress(fd);
        orderAttempt.current = {
          key: crypto.randomUUID(),
          address,
          body: JSON.stringify({
            country: delivery.country,
            email: fd.get("email"),
            address,
            paymentMethod: fd.get("paymentMethod"),
            ...(coupon ? { coupon } : {}),
          }),
        };
      }
      const attempt = orderAttempt.current;
      const r = await fetch("/api/v1/storefront/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": attempt.key,
        },
        body: attempt.body,
      });
      const data = await r.json();
      if (!r.ok) {
        // A recovery request can fail before reaching the saved order (for
        // example rate limiting). Never discard an already uncertain attempt.
        if (r.status < 500 && !orderUnconfirmed) orderAttempt.current = null;
        rejection = data.error?.message ?? "Checkout failed.";
        throw new Error(rejection);
      }
      const order = data?.data;
      if (
        typeof order?.id !== "string" ||
        !order.id.trim() ||
        typeof order.reference !== "string" ||
        !order.reference.trim()
      )
        throw new Error("The order confirmation response was incomplete.");
      const confirmationHref = `/order-confirmation/${encodeURIComponent(order.reference)}`;
      // A cart badge refresh must not hide a successfully placed order.
      void shop.refresh().catch(() => {});
      const address = attempt.address;
      orderAttempt.current = null;
      setOrderUnconfirmed(false);
      saveDeliveryLocation({
        country: "AE",
        emirate: address.emirate,
        area: address.area,
        source: "manual",
      });
      router.push(confirmationHref);
      router.refresh();
    } catch (e) {
      setOrderUnconfirmed(Boolean(orderAttempt.current));
      setError(
        orderAttempt.current
          ? `We couldn’t confirm your order. Check its status below before changing your details or placing another order.${rejection ? ` ${rejection}` : ""}`
          : (e as Error).message,
      );
      // Recheck the exact attempted payload and key after an uncertain response.
      // Editing the payload would prevent recovery of an already saved order.
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page-container">
      <div className="page-heading">
        <div className="eyebrow">
          {checkout ? "ONE STEP CLOSER" : "YOUR NEXT UPGRADE"}
        </div>
        <h1>{checkout ? "Make it yours." : "Your shopping cart"}</h1>
        <p>
          {checkout
            ? "Review your details. We’ll take it from here."
            : `${cart.items.length} selected item${cart.items.length === 1 ? "" : "s"}. Ready when you are.`}
        </p>
      </div>
      {!countryAvailable && (
        <p className="notice warning" role="status">
          {comingSoon(delivery.country)} Choose United Arab Emirates in the
          location menu for a UAE delivery address.
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {cartError && (
        <div>
          <p className="form-error" role="alert">
            {cartError}
          </p>
          <button
            className="button"
            disabled={cartLoading || busy}
            onClick={() => void load()}
          >
            Retry loading cart
          </button>
        </div>
      )}
      <div className="checkout-layout">
        <div>
          {checkout ? (
            <form
              id="checkout-form"
              className="form-card form-stack"
              onSubmit={placeOrder}
            >
              <fieldset
                disabled={busy || orderUnconfirmed}
                className="form-stack"
                style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
              >
                <h2>Contact & delivery</h2>
                <Fields
                  fields={[
                    { name: "email", label: "Email address", type: "email" },
                  ]}
                />
                <DeliveryAddressFields
                  emirate={region}
                  saved={addresses}
                  onEmirateChange={(emirate) => {
                    setRegion(emirate);
                    saveDeliveryLocation({
                      country: "AE",
                      emirate,
                      source: "manual",
                    });
                  }}
                />
                <h3>Payment method</h3>
                {quote?.paymentMethods.length ? (
                  quote.paymentMethods.map((m, i) => (
                    <label key={m} className="notice">
                      <span>
                        <input
                          type="radio"
                          name="paymentMethod"
                          value={m}
                          defaultChecked={i === 0}
                          required
                        />{" "}
                        {m === "SIMULATOR"
                          ? "Development simulator — no money is transferred"
                          : "Offline payment — arrange with the store"}
                      </span>
                    </label>
                  ))
                ) : quote ? (
                  <div className="notice warning">
                    No operational payment method is enabled. Checkout will
                    become available after the merchant configures payments.
                  </div>
                ) : (
                  <p className="form-help">
                    Payment methods will appear with your updated total.
                  </p>
                )}
                <label className="form-help">
                  <span>
                    <input type="checkbox" required /> I have reviewed the order
                    and the{" "}
                    <Link href="/terms-conditions" className="text-button">
                      terms & conditions
                    </Link>
                    .
                  </span>
                </label>
              </fieldset>
            </form>
          ) : (
            <div>
              {cart.items.map((l) => (
                <article key={l.id} className="cart-item">
                  {l.slug && l.image ? (
                    <Link href={`/product/${l.slug}`}>
                      <img src={l.image} alt={l.name} />
                    </Link>
                  ) : (
                    <span aria-hidden="true">
                      <ShoppingBag />
                    </span>
                  )}
                  <div>
                    {l.slug ? (
                      <Link href={`/product/${l.slug}`}>
                        <h3>{l.name}</h3>
                      </Link>
                    ) : (
                      <h3>{l.name}</h3>
                    )}
                    <p>{l.code}</p>
                    <button
                      className="remove"
                      disabled={busy}
                      onClick={() => void update(l.skuId, 0)}
                    >
                      Remove
                    </button>
                  </div>
                  <div className="quantity">
                    <button
                      disabled={busy || l.price === null || l.quantity <= 1}
                      aria-label={`Decrease ${l.name} quantity`}
                      onClick={() => void update(l.skuId, l.quantity - 1)}
                    >
                      <Minus size={13} />
                    </button>
                    <span>{l.quantity}</span>
                    <button
                      disabled={busy || l.quantity >= l.available}
                      aria-label={`Increase ${l.name} quantity`}
                      onClick={() => void update(l.skuId, l.quantity + 1)}
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                  <b className="price">
                    {l.price === null
                      ? "Unavailable"
                      : money(l.price * l.quantity)}
                  </b>
                </article>
              ))}
              <Link
                href="/categories"
                className="text-button inline-form"
                style={{ marginTop: 20 }}
              >
                <ArrowLeft size={14} />
                Continue shopping
              </Link>
            </div>
          )}
        </div>
        <aside className="summary-card">
          <h2>Order summary</h2>
          {checkout &&
            cart.items.map((l) => (
              <div className="summary-line" key={l.id}>
                <span>
                  {l.quantity} × {l.name}
                </span>
                <b>
                  {l.price === null
                    ? "Unavailable"
                    : money(l.price * l.quantity)}
                </b>
              </div>
            ))}
          <label>
            Deliver to
            <select
              aria-label="Deliver to"
              disabled={busy || orderUnconfirmed}
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            >
              {emirates.map((e) => (
                <option key={e}>{e}</option>
              ))}
            </select>
          </label>
          <label style={{ marginTop: 15 }}>
            Promo code
            <input
              disabled={busy || orderUnconfirmed}
              value={coupon}
              onChange={(e) => setCoupon(e.target.value.toUpperCase())}
              placeholder="Enter code"
            />
          </label>
          {quote ? (
            <>
              <div className="summary-line">
                <span>Subtotal</span>
                <span>{money(quote.totals.subtotal)}</span>
              </div>
              {quote.totals.discount > 0 && (
                <div className="summary-line">
                  <span>Discount</span>
                  <span>−{money(quote.totals.discount)}</span>
                </div>
              )}
              <div className="summary-line">
                <span>Delivery</span>
                <span>
                  {quote.totals.shipping
                    ? money(quote.totals.shipping)
                    : "Free"}
                </span>
              </div>
              {quote.totals.tax > 0 && (
                <div className="summary-line">
                  <span>
                    VAT {quote.totals.taxInclusive ? "(included)" : ""}
                  </span>
                  <span>{money(quote.totals.tax)}</span>
                </div>
              )}
              <div className="summary-line total">
                <span>Total</span>
                <span>{money(quote.totals.total)}</span>
              </div>
              <p className="form-help">{quote.shipping.estimate}</p>
            </>
          ) : quoteError ? (
            <div>
              <p className="form-error" role="alert">
                {quoteError}
              </p>
              <button
                type="button"
                className="button"
                onClick={() => setQuoteAttempt((attempt) => attempt + 1)}
              >
                Retry order total
              </button>
            </div>
          ) : (
            <p className="notice" role="status">
              {cartError
                ? "Refresh your cart to calculate the current total."
                : countryAvailable
                  ? "Calculating your order…"
                  : "Choose UAE delivery to calculate your order."}
            </p>
          )}
          {checkout ? (
            <button
              className="button primary"
              form="checkout-form"
              disabled={
                busy ||
                cartLoading ||
                (!orderUnconfirmed &&
                  (Boolean(cartError) ||
                    !countryAvailable ||
                    !quote?.paymentMethods.length))
              }
            >
              {busy
                ? orderUnconfirmed
                  ? "Checking your order…"
                  : "Placing your order…"
                : orderUnconfirmed
                  ? "Check order status"
                  : "Place order"}
              <ArrowRight size={16} />
            </button>
          ) : (
            <Link href="/checkout" className="button primary">
              Continue to checkout
              <ArrowRight size={16} />
            </Link>
          )}
          <p className="status-note">
            Prices and availability are checked again when you place the order.
          </p>
        </aside>
      </div>
    </div>
  );
}
export function TrackOrder() {
  const router = useRouter();
  return (
    <MutationForm
      endpoint="storefront/track-order"
      fields={[
        { name: "reference", label: "Order reference" },
        {
          name: "token",
          label: "Secure access code",
          help: "Use the access code supplied at checkout, or sign in to see your orders.",
        },
      ]}
      label="Find my order"
      onSaved={(r) =>
        router.push(
          `/order-confirmation/${(r as { reference: string }).reference}`,
        )
      }
    />
  );
}
export function PrintButton() {
  return (
    <button className="button" onClick={() => window.print()}>
      <Printer size={15} />
      Print order summary
    </button>
  );
}
export function SuccessIcon() {
  return <CheckCircle size={42} color="#168361" />;
}
