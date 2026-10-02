"use client";
import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { MAX_IMAGE_BYTES } from "@/lib/uploads";
import {
  Package,
  LayoutDashboard,
  Layers,
  Boxes,
  ShoppingBag,
  RotateCcw,
  Users,
  Tag,
  FileText,
  Image,
  MessageSquare,
  Upload,
  BarChart3,
  Key,
  Shield,
  Settings,
  Activity,
  Sparkles,
  CheckCircle,
  Plus,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import { api } from "./store-client";
import { Fields, MutationForm, readFields, type Field } from "./forms";
const icons: Record<string, React.ElementType> = {
  products: Package,
  categories: Layers,
  brands: Tag,
  attributes: Layers,
  collections: Layers,
  inventory: Boxes,
  orders: ShoppingBag,
  returns: RotateCcw,
  customers: Users,
  promotions: Tag,
  content: FileText,
  "home-sections": LayoutDashboard,
  media: Image,
  reviews: MessageSquare,
  inquiries: MessageSquare,
  imports: Upload,
  reports: BarChart3,
  staff: Shield,
  "api-access": Key,
  assistant: Sparkles,
  proposals: CheckCircle,
  jobs: Activity,
  settings: Settings,
  "audit-events": Activity,
};
export function AdminNav({
  modules,
}: {
  modules: { slug: string; label: string }[];
}) {
  const path = usePathname();
  return (
    <nav aria-label="Admin workspace">
      <Link href="/admin" className={path === "/admin" ? "active" : ""}>
        <LayoutDashboard />
        Overview
      </Link>
      {modules.map((m) => {
        const Icon = icons[m.slug] ?? Package;
        return (
          <Link
            key={m.slug}
            href={`/admin/${m.slug}`}
            className={path.startsWith(`/admin/${m.slug}`) ? "active" : ""}
          >
            <Icon />
            {m.label}
          </Link>
        );
      })}
    </nav>
  );
}
export function ActionButton({
  endpoint,
  payload = {},
  label,
  method = "POST",
  proposal = false,
  danger = false,
}: {
  endpoint: string;
  payload?: unknown;
  label: string;
  method?: string;
  proposal?: boolean;
  danger?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button
        className={`button ${danger ? "" : "primary"}`}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const result = await api<{ id: string }>(endpoint, payload, method);
            if (proposal) router.push(`/admin/proposals/${result.id}`);
            else router.refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Working…" : label}
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
type ProductEdit = {
  id: string;
  name: string;
  slug: string;
  description: string;
  highlights: string[];
  status: string;
  categoryId: string;
  brandId: string;
  specs: unknown;
  skus: {
    id: string;
    code: string;
    price?: number | null;
    compareAt?: number | null;
    onHand?: number;
    reserved?: number;
    specs: unknown;
    options?: unknown;
    mpn?: string | null;
    warranty?: string | null;
    condition?: string;
  }[];
  media: { id: string; alt: string; key: string; public: boolean }[];
};
export function ProductEditor({
  product,
  categories,
  brands,
  scopes,
}: {
  product?: ProductEdit;
  categories: { id: string; name: string }[];
  brands: { id: string; name: string }[];
  scopes: string[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [skuCount, setSkuCount] = useState(1);
  useEffect(() => {
    function guard(e: BeforeUnloadEvent) {
      if (dirty) e.preventDefault();
    }
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  const overview: Field[] = [
    { name: "name", label: "Product name", value: product?.name },
    {
      name: "slug",
      label: "URL slug",
      value: product?.slug,
      help: "Lowercase letters, numbers and hyphens.",
    },
    {
      name: "description",
      label: "Product description",
      type: "textarea",
      value: product?.description,
    },
    {
      name: "highlights",
      label: "Highlights (one per line)",
      type: "textarea",
      value: product?.highlights.join("\n"),
      required: false,
    },
  ];
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const values = readFields(e.currentTarget, overview);
      const common = {
        ...values,
        highlights: String(values.highlights).split("\n").filter(Boolean),
      };
      if (product) {
        const p = await api<{ id: string }>(
          `admin/products/${product.id}`,
          common,
          "PATCH",
        );
        setDirty(false);
        router.push(`/admin/proposals/${p.id}`);
      } else {
        const skus = Array.from({ length: skuCount }, (_, i) => ({
          code: String(fd.get(`sku_${i}`)),
          price:
            scopes.includes("pricing:write") && fd.get(`price_${i}`) !== ""
              ? Math.round(Number(fd.get(`price_${i}`)) * 100)
              : null,
          specs: JSON.parse(String(fd.get(`specs_${i}`) ?? "{}")),
          options: JSON.parse(String(fd.get(`options_${i}`) ?? "{}")),
        }));
        const p = await api<{ id: string }>("admin/products", {
          ...common,
          brandId: fd.get("brandId"),
          categoryId: fd.get("categoryId"),
          specs: JSON.parse(String(fd.get("specs") ?? "{}")),
          skus,
        });
        setDirty(false);
        router.push(`/admin/products/${p.id}`);
      }
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="admin-editor">
      <nav className="admin-tabs">
        {[
          "Overview",
          "Media",
          "Pricing",
          "Inventory",
          "Specifications",
          "Organization",
          "Publishing",
        ].map((t) => (
          <a key={t} href={`#${t.toLowerCase()}`}>
            {t}
          </a>
        ))}
      </nav>
      <form
        className="form-card form-stack"
        onSubmit={submit}
        onChange={() => setDirty(true)}
      >
        <section className="editor-section" id="overview">
          <h2>Overview</h2>
          <div className="form-grid">
            <Fields fields={overview} />
          </div>
        </section>
        {!product && (
          <>
            <section className="editor-section" id="organization">
              <h2>Organization</h2>
              <div className="form-grid">
                <Fields
                  fields={[
                    {
                      name: "brandId",
                      label: "Brand",
                      type: "select",
                      options: brands.map((b) => ({
                        value: b.id,
                        label: b.name,
                      })),
                    },
                    {
                      name: "categoryId",
                      label: "Category",
                      type: "select",
                      options: categories.map((c) => ({
                        value: c.id,
                        label: c.name,
                      })),
                    },
                  ]}
                />
              </div>
            </section>
            <section className="editor-section" id="specifications">
              <h2>Specifications & variants</h2>
              <label>
                Product specifications (JSON)
                <textarea name="specs" defaultValue="{}" />
              </label>
              {Array.from({ length: skuCount }, (_, i) => (
                <div key={i} className="panel" style={{ marginTop: 18 }}>
                  <h3>SKU {i + 1}</h3>
                  <div className="form-grid" style={{ marginTop: 16 }}>
                    <label>
                      SKU code
                      <input name={`sku_${i}`} required />
                    </label>
                    {scopes.includes("pricing:write") && (
                      <label>
                        Price (AED)
                        <input
                          type="number"
                          name={`price_${i}`}
                          step="0.01"
                          min="0"
                        />
                      </label>
                    )}
                    <label>
                      SKU specifications (JSON)
                      <textarea
                        name={`specs_${i}`}
                        defaultValue={
                          i === 0
                            ? '{"ram":16,"storage":512}'
                            : '{"ram":32,"storage":1024}'
                        }
                      />
                    </label>
                    <label>
                      Variant options (JSON)
                      <textarea
                        name={`options_${i}`}
                        defaultValue={
                          i === 0 ? "{}" : '{"ram":32,"storage":1024}'
                        }
                      />
                    </label>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="button"
                style={{ marginTop: 15 }}
                onClick={() => setSkuCount(skuCount + 1)}
              >
                <Plus size={14} />
                Add variant
              </button>
            </section>
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <p className="form-help">
          {product
            ? "Changes are prepared as an exact proposal. Review and approve to apply them; existing live content remains unchanged until then."
            : "This saves an unpublished draft. Upload images, review stock and publish in the next step."}
        </p>
        <button className="button primary" disabled={busy}>
          {busy
            ? "Saving…"
            : product
              ? "Preview changes"
              : "Create product draft"}
          <ArrowRight size={15} />
        </button>
      </form>
      {product && (
        <>
          <section
            id="media"
            className="editor-section panel"
            style={{ marginTop: 24 }}
          >
            <h2>Media</h2>
            <div className="thumbnails">
              {product.media.map((m) => (
                <img
                  key={m.id}
                  src={
                    m.key.startsWith("illustrations/")
                      ? `/${m.key}`
                      : `/media/${m.id}`
                  }
                  alt={m.alt}
                  style={{ width: 100, height: 80, objectFit: "contain" }}
                />
              ))}
            </div>
            <MediaUpload productId={product.id} />
          </section>
          <section className="editor-section panel" id="specifications">
            <h2>Specifications & options</h2>
            {product.skus.map((s) => (
              <div key={s.id} style={{ marginBottom: 24 }}>
                <h3 style={{ marginBottom: 15 }}>{s.code}</h3>
                <ProposalForm
                  operation="sku.edit"
                  targetId={s.id}
                  label="Review SKU changes"
                  fields={[
                    { name: "code", label: "SKU code", value: s.code },
                    {
                      name: "mpn",
                      label: "Manufacturer part number",
                      value: s.mpn ?? "",
                      required: false,
                    },
                    {
                      name: "condition",
                      label: "Condition",
                      type: "select",
                      value: s.condition ?? "New",
                      options: ["New", "Refurbished", "Used"].map((v) => ({
                        value: v,
                        label: v,
                      })),
                    },
                    {
                      name: "warranty",
                      label: "Supplied warranty details",
                      value: s.warranty ?? "",
                      required: false,
                    },
                    {
                      name: "specs",
                      label: "SKU specifications",
                      type: "json",
                      value: s.specs,
                    },
                    {
                      name: "options",
                      label: "Real option combination",
                      type: "json",
                      value: s.options ?? {},
                    },
                  ]}
                />
              </div>
            ))}
          </section>
          <section className="editor-section panel" id="pricing">
            <h2>SKU pricing</h2>
            {product.skus.map((s) => (
              <div key={s.id} style={{ marginBottom: 25 }}>
                <h3 style={{ marginBottom: 15 }}>{s.code}</h3>
                {scopes.includes("pricing:write") ? (
                  <ProposalForm
                    operation="price.change"
                    targetId={s.id}
                    fields={[
                      {
                        name: "price",
                        label: "Selling price (fils)",
                        type: "number",
                        value: s.price ?? 0,
                        min: 0,
                        help: "100 fils = AED 1.00",
                      },
                      {
                        name: "compareAt",
                        label: "Comparison price (fils; 0 to clear)",
                        type: "number",
                        value: s.compareAt ?? 0,
                        min: 0,
                      },
                    ]}
                    label="Preview price change"
                  />
                ) : (
                  <p className="notice">You do not have pricing permissions.</p>
                )}
              </div>
            ))}
          </section>
          <section className="editor-section panel" id="inventory">
            <h2>Stock & availability</h2>
            {product.skus.map((s) => (
              <div key={s.id} style={{ marginBottom: 25 }}>
                <h3>{s.code}</h3>
                <p className="notice">
                  On hand: {s.onHand ?? "Restricted"} · Reserved:{" "}
                  {s.reserved ?? "Restricted"}
                </p>
                {scopes.includes("inventory:adjust") && (
                  <ProposalForm
                    operation="inventory.adjust"
                    targetId={s.id}
                    fields={[
                      {
                        name: "delta",
                        label: "Quantity adjustment",
                        type: "number",
                        value: 0,
                      },
                      {
                        name: "reason",
                        label: "Reason",
                        help: "A clear reason is required for every stock movement.",
                      },
                    ]}
                    label="Preview adjustment"
                  />
                )}
              </div>
            ))}
          </section>
          <section id="publishing" className="editor-section panel">
            <h2>Publishing</h2>
            <p className="notice">
              Current status: <b>{product.status}</b>. Publishing validates
              active SKU prices and required specifications. Uploaded images are
              staged until publication is approved.
            </p>
            <div className="inline-form">
              <Link
                href={`/admin/products/${product.id}/preview`}
                className="button"
              >
                <ExternalLink size={14} />
                Preview storefront
              </Link>
              {scopes.includes("catalog:publish") && (
                <>
                  <ActionButton
                    label={
                      product.status === "PUBLISHED"
                        ? "Review publication"
                        : "Publish product"
                    }
                    endpoint={`admin/products/${product.id}/publish`}
                    proposal
                  />
                  <ActionButton
                    label="Unpublish"
                    endpoint={`admin/products/${product.id}/unpublish`}
                    proposal
                    danger
                  />
                  <ActionButton
                    label="Archive"
                    endpoint={`admin/products/${product.id}/archive`}
                    proposal
                    danger
                  />
                </>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
export function MediaUpload({ productId }: { productId: string }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <form
      className="form-stack"
      style={{ marginTop: 20 }}
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        setBusy(true);
        const fd = new FormData(e.currentTarget);
        fd.set("productId", productId);
        try {
          const file = fd.get("file");
          if (file instanceof File && file.size > MAX_IMAGE_BYTES) {
            throw new Error("Images must be 4 MB or smaller.");
          }
          await api("admin/media", fd);
          router.refresh();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="form-grid">
        <label>
          Product image
          <input
            type="file"
            name="file"
            accept="image/png,image/jpeg,image/webp,image/avif"
            required
          />
          <small className="form-help">
            Up to 4 MB. Minimum 100 × 100 pixels.
          </small>
        </label>
        <label>
          Alternative text
          <input name="alt" required maxLength={250} />
        </label>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div>
        <button className="button" disabled={busy}>
          {busy ? "Uploading…" : "Upload image"}
        </button>
      </div>
    </form>
  );
}
export function ProposalForm({
  operation,
  targetId,
  fields,
  label = "Preview change",
}: {
  operation: string;
  targetId: string;
  fields: Field[];
  label?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="form-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          const payload = readFields(e.currentTarget, fields);
          if (operation === "price.change" && payload.compareAt === 0)
            payload.compareAt = null;
          const p = await api<{ id: string }>("admin/proposals", {
            operation,
            targetId,
            payload,
          });
          router.push(`/admin/proposals/${p.id}`);
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="form-grid">
        <Fields fields={fields} />
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div>
        <button className="button primary" disabled={busy}>
          {busy ? "Preparing…" : label}
          <ArrowRight size={14} />
        </button>
      </div>
    </form>
  );
}
export function ApiKeyForm({ scopes }: { scopes: string[] }) {
  const [key, setKey] = useState("");
  return (
    <>
      <MutationForm
        endpoint="admin/api-keys"
        label="Issue scoped key"
        fields={[
          { name: "name", label: "Integration name" },
          {
            name: "days",
            label: "Expires in days",
            type: "number",
            value: 30,
            min: 1,
            max: 365,
          },
          {
            name: "scopes",
            label: "Explicit scopes (JSON array)",
            type: "json",
            value: ["catalog:read"],
            help: `Available: ${scopes.join(", ")}`,
          },
        ]}
        onSaved={(r) => setKey((r as { key: string }).key)}
      />
      {key && (
        <div className="notice warning">
          <b>Copy this key now. It will not be shown again.</b>
          <p style={{ overflowWrap: "anywhere" }}>{key}</p>
          <button className="text-button" onClick={() => setKey("")}>
            I saved it — hide key
          </button>
        </div>
      )}
    </>
  );
}
export function Assistant({ connected }: { connected: boolean }) {
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <div className="assistant-intro">
      <div className="assistant-orb">
        <Sparkles size={28} />
      </div>
      <h2>A thoughtful extra pair of hands.</h2>
      <p>
        Find what needs attention. Prepare the next step.
        <br />
        Stay in control of every business decision.
      </p>
      {!connected && (
        <div className="notice warning">
          AI provider not connected. Configure an approved OpenAI or Anthropic
          model on the server to enable conversations. Manual administration is
          fully available.
        </div>
      )}
      <div className="suggestions">
        {[
          "Find products running low on stock",
          "Review missing product specifications",
          "Prepare a product draft from my notes",
          "Help me review a price change",
        ].map((p) => (
          <button key={p} onClick={() => setPrompt(p)}>
            {p}
            <ArrowRight size={13} style={{ marginTop: 10 }} />
          </button>
        ))}
      </div>
      <form
        className="assistant-compose"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api("admin/ai/runs", { prompt });
            setPrompt("");
            router.refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <textarea
          aria-label="Message the AI assistant"
          placeholder="What would you like to work on?"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          required
          maxLength={5000}
        />
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="button primary"
          disabled={busy || !connected || !prompt.trim()}
        >
          {busy ? "Starting…" : "Start task"}
          <ArrowRight size={14} />
        </button>
        <p className="status-note">
          Live changes always require an exact preview and human approval.
        </p>
      </form>
    </div>
  );
}
export function ImportForm() {
  const [result, setResult] = useState<{
    id: string;
    errors: { row: number; message: string }[];
    rows: unknown[];
  } | null>(null);
  return (
    <>
      <p className="notice">
        New-product CSV import · all-or-nothing commit · up to 500 rows.
        Existing SKUs are rejected. Download the template and use unquoted
        columns without embedded commas or line breaks.
      </p>
      <a className="button" href="/templates/products.csv" download>
        Download CSV template
      </a>
      <div style={{ marginTop: 24 }}>
        <MutationForm
          endpoint="admin/imports"
          fields={[
            { name: "csv", label: "Paste CSV contents", type: "textarea" },
          ]}
          label="Validate import"
          success="Validation finished. No catalogue data has changed."
          onSaved={(r) => setResult(r as typeof result)}
        />
      </div>
      {result && (
        <div className="proposal-card">
          <h3>
            {result.rows.length} valid rows · {result.errors.length} errors
          </h3>
          {result.errors.map((e) => (
            <p key={e.row} className="notice error">
              Row {e.row}: {e.message}
            </p>
          ))}
          {!result.errors.length && (
            <ActionButton
              label="Commit validated batch"
              endpoint={`admin/imports/${result.id}/commit`}
            />
          )}
        </div>
      )}
    </>
  );
}
