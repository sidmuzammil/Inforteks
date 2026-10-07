"use client";
import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2,
  Search,
  Plus,
  Trash2,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { api } from "./store-client";
import { DeliveryAddressFields } from "./delivery-address";
import { AddressSummary } from "./address-summary";
import { readDeliveryAddress, type DeliveryAddress } from "@/lib/address";
import { money } from "@/lib/utils";
import type { quoteDirectOrder } from "@/domains/direct-sales";

type Customer = {
  id: string;
  company: string;
  email: string;
  address: DeliveryAddress;
  notes: string;
  active: boolean;
  version: number;
};
type Product = {
  id: string;
  name: string;
  code: string;
  price: number;
  available: number;
  options: Record<string, unknown>;
};
type Quote = Awaited<ReturnType<typeof quoteDirectOrder>>;

export function OfficeEditor({
  customer,
  onSaved,
  contacts = false,
}: {
  customer?: Customer;
  onSaved?: (customer: Customer) => void;
  contacts?: boolean;
}) {
  const router = useRouter();
  const [emirate, setEmirate] = useState(customer?.address.emirate ?? "Dubai");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const saved = await api<Customer>(
        `admin/direct-sales/customers${customer ? `/${customer.id}` : ""}`,
        {
          company: String(form.get("company") ?? ""),
          email: String(form.get("email") ?? "").trim(),
          address: readDeliveryAddress(form),
          notes: String(form.get("notes") ?? ""),
          active: customer ? form.get("active") === "on" : true,
          ...(customer ? { version: customer.version } : {}),
        },
        customer ? "PATCH" : "POST",
      );
      if (onSaved) onSaved(saved);
      else {
        router.push(
          contacts
            ? `/admin/contacts/office/${saved.id}`
            : `/admin/direct-sales/customers/${saved.id}`,
        );
        router.refresh();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="sales-office-form">
      <fieldset disabled={busy}>
        <div className="form-grid">
          <label>
            Office / company name
            <input
              name="company"
              required
              minLength={2}
              maxLength={160}
              defaultValue={customer?.company}
            />
          </label>
          <label>
            Email (optional)
            <input
              name="email"
              type="email"
              maxLength={200}
              defaultValue={customer?.email}
            />
            <small className="form-help">
              A contact record only. This does not create a login.
            </small>
          </label>
        </div>
        <h3>Contact & delivery address</h3>
        <p className="form-help">
          Enter the person receiving the order and their office, floor and
          building.
        </p>
        <DeliveryAddressFields
          emirate={emirate}
          onEmirateChange={setEmirate}
          initial={
            customer ? { ...customer.address, id: customer.id } : undefined
          }
        />
        <label>
          Internal customer notes
          <textarea
            name="notes"
            maxLength={2000}
            defaultValue={customer?.notes}
            placeholder="Buying preferences, office hours or delivery instructions"
          />
        </label>
        {customer && (
          <label className="address-confirm">
            <input
              name="active"
              type="checkbox"
              defaultChecked={customer.active}
            />
            Active customer — allow new orders and follow-ups
          </label>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary">
          {busy
            ? "Saving…"
            : customer
              ? "Save office details"
              : "Save office customer"}
          <ArrowRight size={16} />
        </button>
      </fieldset>
    </form>
  );
}
export function VisitForm({ customerId }: { customerId: string }) {
  const router = useRouter();
  const attempt = useRef({ payload: "", key: "" });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setSaved(false);
    setError("");
    try {
      const day = String(data.get("followUpAt") ?? "");
      // Staff-facing time is explicitly UAE time, independent of the device timezone.
      const payload = {
        outcome: String(data.get("outcome")),
        notes: String(data.get("notes")),
        followUpAt: day ? new Date(`${day}:00+04:00`).toISOString() : null,
      };
      const serialized = JSON.stringify(payload);
      if (attempt.current.payload !== serialized)
        attempt.current = { payload: serialized, key: crypto.randomUUID() };
      await api(`admin/direct-sales/visits/${customerId}`, payload, "POST", {
        "Idempotency-Key": attempt.current.key,
      });
      attempt.current = { payload: "", key: "" };
      form.reset();
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="sales-visit-form">
      <fieldset disabled={busy}>
        <div className="form-grid">
          <label>
            Visit outcome
            <select name="outcome">
              <option value="INTRODUCED">Introduced Inforteks</option>
              <option value="INTERESTED">Interested in products</option>
              <option value="ORDER_TAKEN">Order taken</option>
              <option value="FOLLOW_UP">Follow up again</option>
              <option value="NOT_INTERESTED">Not interested</option>
            </select>
          </label>
          <label>
            Next follow-up (UAE time, optional)
            <input type="datetime-local" name="followUpAt" />
            <small className="form-help">
              Appears in the staff follow-up list. No message is sent.
            </small>
          </label>
        </div>
        <label>
          Visit notes
          <textarea
            name="notes"
            minLength={3}
            maxLength={2000}
            required
            placeholder="What they need, quantities discussed, and the next step"
          />
        </label>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {saved && (
          <p role="status" className="notice">
            Visit recorded.
          </p>
        )}
        <button className="button primary">
          {busy ? "Saving…" : "Record visit"}
        </button>
      </fieldset>
    </form>
  );
}
export function DirectOrderBuilder({
  initial,
  opportunity,
}: {
  initial?: Customer;
  opportunity?: { id: string; version: number };
}) {
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | undefined>(initial);
  const [customers, setCustomers] = useState<Customer[]>([]),
    [products, setProducts] = useState<Product[]>([]);
  const [customerSearch, setCustomerSearch] = useState(""),
    [productSearch, setProductSearch] = useState("");
  const [newOffice, setNewOffice] = useState(false);
  const [lines, setLines] = useState<(Product & { quantity: number })[]>([]);
  const [coupon, setCoupon] = useState(""),
    [note, setNote] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [searchedCustomers, setSearchedCustomers] = useState(false),
    [searchedProducts, setSearchedProducts] = useState(false);
  const key = useRef("");
  const locked = useRef(false);
  const [confirmed, setConfirmed] = useState(false);
  const payload = {
    customerId: customer?.id ?? "",
    customerVersion: customer?.version ?? 0,
    lines: lines.map((l) => ({ skuId: l.id, quantity: l.quantity })),
    coupon,
    note,
    ...(opportunity ? { opportunity } : {}),
  };
  function invalidate() {
    setQuote(null);
    setConfirmed(false);
    key.current = "";
  }
  async function search(kind: "customers" | "products") {
    setBusy(true);
    setError("");
    try {
      if (kind === "customers") {
        setCustomers(
          (
            await api<{ rows: Customer[] }>(
              `admin/direct-sales/customers?q=${encodeURIComponent(customerSearch)}`,
            )
          ).rows,
        );
        setSearchedCustomers(true);
      } else {
        setProducts(
          await api<Product[]>(
            `admin/direct-sales/products?q=${encodeURIComponent(productSearch)}`,
          ),
        );
        setSearchedProducts(true);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function add(product: Product) {
    invalidate();
    setLines((old) =>
      old.some((l) => l.id === product.id)
        ? old.map((l) =>
            l.id === product.id
              ? { ...l, quantity: Math.min(99, l.quantity + 1) }
              : l,
          )
        : [...old, { ...product, quantity: 1 }],
    );
  }
  async function review() {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    invalidate();
    try {
      const reviewed = await api<Quote>("admin/direct-sales/quote", payload);
      setQuote(reviewed);
      setLines((current) =>
        current.map((line) => ({
          ...line,
          price:
            reviewed.lines.find((item) => item.skuId === line.id)?.price ??
            line.price,
        })),
      );
      key.current = crypto.randomUUID();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  async function place() {
    if (!quote || !confirmed || locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      const order = await api<{ id: string }>(
        "admin/direct-sales/orders",
        { ...payload, reviewedQuote: quote.reviewedQuote, confirmed: true },
        "POST",
        { "Idempotency-Key": key.current },
      );
      router.push(`/admin/direct-sales/orders/${order.id}`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="direct-order-workflow">
      <div className="sales-steps" aria-label="Order steps">
        <span className="active">1 · Office customer</span>
        <span className={customer ? "active" : ""}>2 · Products</span>
        <span className={quote ? "active" : ""}>3 · Review & confirm</span>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="sales-order-columns">
        <div className="sales-order-main">
          <section className="panel">
            <div className="panel-title">
              <h2>
                <Building2 size={19} /> Office customer
              </h2>
              {customer && !opportunity && (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    setCustomer(undefined);
                    invalidate();
                  }}
                >
                  Change customer
                </button>
              )}
            </div>
            {customer ? (
              <>
                <h3>{customer.company}</h3>
                <p>{customer.email}</p>
                <AddressSummary address={customer.address} />
              </>
            ) : (
              <>
                <form
                  className="sales-search"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void search("customers");
                  }}
                >
                  <label className="sr-only" htmlFor="office-search">
                    Find office customer
                  </label>
                  <input
                    id="office-search"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="Company, contact, email or phone"
                    maxLength={160}
                  />
                  <button className="button" disabled={busy}>
                    <Search size={16} />
                    Find office
                  </button>
                </form>
                <div className="sales-search-results">
                  {customers
                    .filter((c) => c.active)
                    .map((c) => (
                      <button
                        className="sales-search-result"
                        key={c.id}
                        disabled={busy}
                        onClick={() => {
                          setCustomer(c);
                          setNewOffice(false);
                          invalidate();
                        }}
                      >
                        <span>
                          <b>{c.company}</b>
                          <small>
                            {c.address.name} · {c.address.phone}
                          </small>
                        </span>
                        <span>Select →</span>
                      </button>
                    ))}
                </div>
                {searchedCustomers && !customers.some((c) => c.active) && (
                  <p className="notice">
                    No active office customers found. Add the office below.
                  </p>
                )}
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => setNewOffice(!newOffice)}
                >
                  <Plus size={16} />
                  {newOffice
                    ? "Close new customer form"
                    : "Add office customer"}
                </button>
                {newOffice && (
                  <div className="sales-inline-editor">
                    <OfficeEditor
                      onSaved={(c) => {
                        setCustomer(c);
                        setNewOffice(false);
                        invalidate();
                      }}
                    />
                  </div>
                )}
              </>
            )}
          </section>
          <section className="panel">
            <div className="panel-title">
              <h2>Products</h2>
              <span className="form-help">Shared store stock · AED</span>
            </div>
            <form
              className="sales-search"
              onSubmit={(e) => {
                e.preventDefault();
                void search("products");
              }}
            >
              <label className="sr-only" htmlFor="direct-product-search">
                Find products
              </label>
              <input
                id="direct-product-search"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                maxLength={160}
                placeholder="Search product name or SKU"
              />
              <button className="button" disabled={busy}>
                <Search size={16} />
                Find products
              </button>
            </form>
            <div className="sales-search-results">
              {products.map((p) => (
                <button
                  className="sales-search-result"
                  key={p.id}
                  disabled={
                    busy ||
                    p.available < 1 ||
                    (lines.length >= 50 && !lines.some((l) => l.id === p.id))
                  }
                  onClick={() => add(p)}
                >
                  <span>
                    <b>{p.name}</b>
                    <small>
                      {p.code} ·{" "}
                      {Object.entries(p.options)
                        .map(([k, v]) => `${k}: ${String(v)}`)
                        .join(" · ")}{" "}
                      · {p.available} available
                    </small>
                  </span>
                  <span>
                    {money(p.price)}
                    <small>{p.available > 0 ? "+ Add" : "Out of stock"}</small>
                  </span>
                </button>
              ))}
            </div>
            {searchedProducts && !products.length && (
              <p className="notice">
                No published products found. Check the name or SKU, or ask your
                product manager to publish the item.
              </p>
            )}
            {lines.length ? (
              <div className="sales-line-list">
                {lines.map((l) => (
                  <div key={l.id} className="sales-line">
                    <div>
                      <b>{l.name}</b>
                      <small>
                        {l.code} · {money(l.price)} each
                      </small>
                    </div>
                    <label>
                      Quantity
                      <input
                        aria-label={`Quantity for ${l.code}`}
                        type="number"
                        min={1}
                        max={99}
                        value={l.quantity}
                        disabled={busy}
                        onChange={(e) => {
                          invalidate();
                          setLines(
                            lines.map((item) =>
                              item.id === l.id
                                ? { ...item, quantity: Number(e.target.value) }
                                : item,
                            ),
                          );
                        }}
                      />
                    </label>
                    <b>{money(l.price * l.quantity)}</b>
                    <button
                      className="icon-button"
                      aria-label={`Remove ${l.code}`}
                      disabled={busy}
                      onClick={() => {
                        invalidate();
                        setLines(lines.filter((item) => item.id !== l.id));
                      }}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="sales-empty">
                Search above to add a laptop, toner or any published product.
                There is no minimum order quantity.
              </p>
            )}
          </section>
          <section className="panel">
            <h2>Order details</h2>
            <div className="form-grid">
              <label>
                Coupon code (optional)
                <input
                  value={coupon}
                  disabled={busy}
                  maxLength={40}
                  onChange={(e) => {
                    invalidate();
                    setCoupon(e.target.value);
                  }}
                />
              </label>
              <label>
                Internal order note
                <textarea
                  value={note}
                  disabled={busy}
                  maxLength={1000}
                  onChange={(e) => {
                    invalidate();
                    setNote(e.target.value);
                  }}
                  placeholder="Purchase order reference or delivery instructions"
                />
              </label>
            </div>
            <p className="form-help">
              Uses the current catalogue prices and configured delivery rates.
              Coupon eligibility and available stock are checked on the server.
            </p>
          </section>
        </div>
        <aside className="panel sales-order-summary">
          <h2>Order summary</h2>
          {quote ? (
            <>
              <p className="badge green">
                <CheckCircle2 size={14} /> Ready for review
              </p>
              <b>{quote.company}</b>
              <p>
                {quote.lines.reduce((n, l) => n + l.quantity, 0)} items ·{" "}
                {quote.shipping.name}
              </p>
              {[
                ["Products", quote.totals.subtotal],
                ["Discount", -quote.totals.discount],
                ["Delivery", quote.totals.shipping],
                [
                  quote.totals.taxInclusive ? "VAT (included)" : "VAT",
                  quote.totals.tax,
                ],
              ].map(([label, value]) => (
                <div className="summary-line" key={String(label)}>
                  <span>{label}</span>
                  <b>{money(Number(value))}</b>
                </div>
              ))}
              <div className="summary-line total">
                <span>Total</span>
                <b>{money(quote.totals.total)}</b>
              </div>
              <p className="form-help">{quote.shipping.estimate}</p>
              <label className="address-confirm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={busy}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                I confirmed these items, the delivery address and total with the
                customer.
              </label>
              <button
                className="button primary"
                disabled={busy || !confirmed}
                onClick={place}
              >
                {busy ? "Saving order…" : "Confirm direct order"}
                <ArrowRight size={16} />
              </button>
              <button className="text-button" disabled={busy} onClick={review}>
                Refresh prices & review
              </button>
            </>
          ) : (
            <>
              <p className="muted">
                Select the office and add products to calculate delivery, any
                discount, and tax.
              </p>
              <div className="summary-line">
                <span>Products estimate</span>
                <b>
                  {money(lines.reduce((n, l) => n + l.price * l.quantity, 0))}
                </b>
              </div>
              <button
                className="button primary"
                disabled={busy || !customer || !lines.length}
                onClick={review}
              >
                {busy ? "Checking…" : "Review order total"}
                <ArrowRight size={16} />
              </button>
            </>
          )}
          <div className="sales-payment-note">
            <b>Payment remains pending</b>
            <p>
              Confirming reserves stock; it does not collect money. A manager
              records payment or prepares fulfilment. Unpaid, unfulfilled
              reservations expire after 24 hours.
            </p>
          </div>
          <Link href="/admin/direct-sales/orders" className="text-button">
            View direct orders →
          </Link>
        </aside>
      </div>
    </div>
  );
}
