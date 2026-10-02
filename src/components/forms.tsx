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
              type={f.type ?? "text"}
              defaultValue={String(values?.[f.name] ?? f.value ?? "")}
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
      f.type === "number"
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
export function AuthForm({
  mode,
  token,
}: {
  mode: "login" | "register" | "forgot-password" | "reset-password";
  token?: string;
}) {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const fields: Field[] = [
    ...(mode === "register"
      ? [{ name: "name", label: "Full name", type: "text" }]
      : []),
    ...(mode !== "reset-password"
      ? [{ name: "email", label: "Email address", type: "email" }]
      : []),
    ...(["login", "register", "reset-password"].includes(mode)
      ? [
          {
            name: "password",
            label: "Password",
            type: "password",
            help: mode !== "login" ? "Use at least 12 characters." : undefined,
          },
        ]
      : []),
  ];
  return (
    <form
      className="form-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          const d = readFields(e.currentTarget, fields);
          const route =
            mode === "login"
              ? "sign-in/email"
              : mode === "register"
                ? "sign-up/email"
                : mode === "forgot-password"
                  ? "request-password-reset"
                  : "reset-password";
          const body =
            mode === "reset-password"
              ? { token, newPassword: d.password }
              : mode === "forgot-password"
                ? { email: d.email, redirectTo: "/reset-password" }
                : d;
          await api(`/api/auth/${route}`, body);
          if (mode === "forgot-password") {
            setMessage(
              "If this account exists, recovery instructions have been queued. In development, see the protected local mailbox.",
            );
          } else if (mode === "reset-password") {
            router.push("/login");
          } else {
            const params = new URLSearchParams(window.location.search);
            const next = params.get("next");
            router.push(
              next?.startsWith("/") && !next.startsWith("//")
                ? next
                : "/account",
            );
            router.refresh();
          }
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Fields fields={fields} />
      {mode === "login" && (
        <Link href="/forgot-password" className="text-button">
          Forgot your password?
        </Link>
      )}
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
      <button className="button primary" disabled={busy}>
        {busy
          ? "Please wait…"
          : mode === "login"
            ? "Sign in"
            : mode === "register"
              ? "Create account"
              : mode === "forgot-password"
                ? "Send recovery instructions"
                : "Reset password"}
        <ArrowRight size={16} />
      </button>
    </form>
  );
}
export function SignOut() {
  const router = useRouter();
  return (
    <button
      className="button"
      onClick={async () => {
        await api("/api/auth/sign-out", {});
        router.push("/login");
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
  slug: string;
  code: string;
  price: number;
  available: number;
  image: string;
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
  const [cart, setCart] = useState<Cart | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [region, setRegion] = useState("Dubai");
  const [coupon, setCoupon] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const key = useRef("");
  const router = useRouter();
  const shop = useShop();
  async function load() {
    try {
      setCart(await api<Cart>("storefront/carts"));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void api<Cart>("storefront/carts")
      .then(setCart)
      .catch((e) => setError(e.message));
    key.current = crypto.randomUUID();
  }, []);
  useEffect(() => {
    if (!cart?.items.length) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      api<Quote>("storefront/carts/quote", {
        emirate: region,
        ...(coupon ? { coupon } : {}),
      })
        .then((q) => {
          if (!cancelled) {
            setQuote(q);
            setError("");
          }
        })
        .catch((e) => {
          if (!cancelled) {
            setQuote(null);
            setError(e.message);
          }
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cart, region, coupon]);
  async function update(skuId: string, quantity: number) {
    setBusy(true);
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
        <p className="notice" role="status">
          {error || "Loading your cart…"}
        </p>
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
    setBusy(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const address = Object.fromEntries(
      ["name", "phone", "city", "line1", "landmark"].map((k) => [
        k,
        String(fd.get(k) ?? ""),
      ]),
    );
    try {
      const r = await fetch("/api/v1/storefront/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": key.current,
        },
        body: JSON.stringify({
          email: fd.get("email"),
          address: { ...address, emirate: region },
          paymentMethod: fd.get("paymentMethod"),
          ...(coupon ? { coupon } : {}),
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error?.message ?? "Checkout failed.");
      await shop.refresh();
      router.push(`/order-confirmation/${data.data.reference}`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      key.current = crypto.randomUUID();
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
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="checkout-layout">
        <div>
          {checkout ? (
            <form
              id="checkout-form"
              className="form-card form-stack"
              onSubmit={placeOrder}
            >
              <h2>Contact & delivery</h2>
              <div className="form-grid">
                <Fields
                  fields={[
                    { name: "email", label: "Email address", type: "email" },
                    { name: "name", label: "Full name" },
                    {
                      name: "phone",
                      label: "UAE mobile number",
                      help: "Start with +971, without spaces.",
                    },
                  ]}
                />
                <label>
                  Emirate
                  <select
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                  >
                    {emirates.map((e) => (
                      <option key={e}>{e}</option>
                    ))}
                  </select>
                </label>
                <Fields
                  fields={[
                    { name: "city", label: "City / area" },
                    { name: "line1", label: "Building, street & apartment" },
                    {
                      name: "landmark",
                      label: "Landmark (optional)",
                      required: false,
                    },
                  ]}
                />
              </div>
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
              ) : (
                <div className="notice warning">
                  No operational payment method is enabled. Checkout will become
                  available after the merchant configures payments.
                </div>
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
            </form>
          ) : (
            <div>
              {cart.items.map((l) => (
                <article key={l.id} className="cart-item">
                  <Link href={`/product/${l.slug}`}>
                    <img src={l.image} alt={l.name} />
                  </Link>
                  <div>
                    <Link href={`/product/${l.slug}`}>
                      <h3>{l.name}</h3>
                    </Link>
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
                      disabled={busy || l.quantity <= 1}
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
                  <b className="price">{money(l.price * l.quantity)}</b>
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
                <b>{money(l.price * l.quantity)}</b>
              </div>
            ))}
          <label>
            Deliver to
            <select value={region} onChange={(e) => setRegion(e.target.value)}>
              {emirates.map((e) => (
                <option key={e}>{e}</option>
              ))}
            </select>
          </label>
          <label style={{ marginTop: 15 }}>
            Promo code
            <input
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
          ) : (
            <p className="notice">Calculating your order…</p>
          )}
          {checkout ? (
            <button
              className="button primary"
              form="checkout-form"
              disabled={busy || !quote?.paymentMethods.length}
            >
              {busy ? "Placing your order…" : "Place order"}
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
