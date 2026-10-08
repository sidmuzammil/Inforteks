"use client";
import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  PriceFields,
  PriceEditor,
  SpecificationFields,
  TaxonomyPicker,
  ChosenImages,
} from "./merchant-inputs";
import { readPrices } from "@/lib/merchant-pricing";
import { sampleProducts, type SampleProductId } from "@/lib/sample-products";
import { MAX_IMAGE_BYTES } from "@/lib/uploads";
import { ProductMediaEditor } from "./product-media-editor";
import { Sparkles, Plus, ArrowRight, ExternalLink } from "lucide-react";
import { api } from "./store-client";
import { Fields, MutationForm, readFields, type Field } from "./forms";
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
  version: number;
  featured: boolean;
  store: boolean;
  quoteOnly: boolean;
  model?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
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
  const [quoteOnly, setQuoteOnly] = useState(false);
  const [sampleId, setSampleId] = useState<SampleProductId | null>(null);
  const sample = sampleProducts.find((s) => s.id === sampleId);
  const [sampleRevision, setSampleRevision] = useState(0);
  const [skuCount, setSkuCount] = useState(1);
  const [files, setFiles] = useState<File[]>([]);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState(0);
  useEffect(() => {
    function guard(e: BeforeUnloadEvent) {
      if (dirty) e.preventDefault();
    }
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  const overview: Field[] = [
    {
      name: "name",
      label: "Product name",
      value: product?.name ?? sample?.name,
    },
    ...(!product
      ? [
          {
            name: "store",
            label: "Show in online store",
            type: "checkbox",
            value: !sample,
            help: "Turn off for Direct Sales only. This applies to all variants; stock stays shared. Drafts stay private until activated.",
          },
        ]
      : []),
    { name: "model", label: "Model", value: product?.model, required: false },
    {
      name: "featured",
      label: "Feature on homepage",
      type: "checkbox",
      value: product?.featured ?? false,
    },
    {
      name: "seoTitle",
      label: "Search engine title",
      value: product?.seoTitle,
      required: false,
    },
    {
      name: "seoDescription",
      label: "Search engine description",
      value: product?.seoDescription,
      required: false,
    },
    {
      name: "slug",
      label: "URL slug",
      value: product?.slug,
      help: "Leave blank to generate from the product name. Lowercase letters, numbers and hyphens.",
      required: Boolean(product),
    },
    {
      name: "description",
      label: "Product description",
      type: "textarea",
      value: product?.description ?? sample?.description,
    },
    {
      name: "highlights",
      label: "Highlights (one per line)",
      type: "textarea",
      value: product?.highlights.join("\n") ?? sample?.highlights.join("\n"),
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
        ...(!product ? { quoteOnly } : {}),
        slug: values.slug || undefined,
        brandId: fd.get("brandId"),
        categoryId: fd.get("categoryId"),
        specs: JSON.parse(String(fd.get("specs") ?? "{}")),
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
          ...(scopes.includes("pricing:write") && !quoteOnly
            ? readPrices(fd, `_${i}`)
            : { price: null, compareAt: null }),
          mpn: String(fd.get(`mpn_${i}`) ?? ""),
          warranty: String(fd.get(`warranty_${i}`) ?? "") || null,
          condition: String(fd.get(`condition_${i}`) ?? "New"),
          specs: JSON.parse(String(fd.get(`specs_${i}`) ?? "{}")),
          options: JSON.parse(String(fd.get(`options_${i}`) ?? "{}")),
        }));
        for (const file of files)
          if (file.size > MAX_IMAGE_BYTES)
            throw new Error(
              `${file.name}: choose an image of 4 MB or smaller.`,
            );
        const p = createdId
          ? { id: createdId }
          : await api<{ id: string }>("admin/products", {
              ...common,
              ...(sampleId ? { sampleTemplate: sampleId } : {}),
              brandId: fd.get("brandId"),
              categoryId: fd.get("categoryId"),
              specs: JSON.parse(String(fd.get("specs") ?? "{}")),
              skus,
            });
        setCreatedId(p.id);
        for (let i = uploaded; i < files.length; i++) {
          const form = new FormData();
          form.set("file", files[i]);
          form.set("productId", p.id);
          form.set("alt", String(fd.get("imageAlt") || values.name));
          await api("admin/media", form);
          setUploaded(i + 1);
        }
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
          ...(product ? ["Channels"] : []),
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
      {!product && !createdId && (
        <details className="draft-kit">
          <summary>Sample draft starters</summary>
          <p>
            Original illustrative concepts. Choosing a starter only fills this
            form. Saving creates a private sample draft with Online Store
            visibility off and no stock. No price or warranty is invented.
          </p>
          <div className="draft-kit-grid">
            {sampleProducts.map((starter) => (
              <button
                type="button"
                key={starter.id}
                onClick={() => {
                  if (
                    dirty &&
                    !window.confirm(
                      "Replace the unsaved form with this sample draft?",
                    )
                  )
                    return;
                  setSampleId(starter.id);
                  setSampleRevision((revision) => revision + 1);
                  setError("");
                  setSkuCount(1);
                  setFiles([]);
                  setDirty(false);
                }}
              >
                <b>{starter.name}</b>
                <small>{starter.category} · Draft only</small>
              </button>
            ))}
          </div>
          {sample && (
            <button
              type="button"
              className="button"
              onClick={() => {
                if (
                  dirty &&
                  !window.confirm(
                    "Discard unsaved sample edits and start a blank product?",
                  )
                )
                  return;
                setSampleId(null);
                setSampleRevision((revision) => revision + 1);
                setFiles([]);
                setSkuCount(1);
                setError("");
                setDirty(false);
              }}
            >
              Start blank product
            </button>
          )}
        </details>
      )}
      {sample && (
        <p className="notice">
          Sample draft selected. Choose an existing or new brand and category.
          Price and stock remain unset; this draft is excluded from the Online
          Store.
        </p>
      )}
      <form
        key={`${sampleId ?? "product"}-${sampleRevision}`}
        className="form-card form-stack"
        onSubmit={submit}
        onChange={() => setDirty(true)}
      >
        <section className="editor-section" id="overview">
          <h2>Overview</h2>
          <div className="form-grid">
            <Fields fields={overview} />
          </div>
          {!product && (
            <div className="quote-mode-control">
              <label className="check-row">
                <input
                  type="checkbox"
                  name="quoteOnly"
                  checked={quoteOnly}
                  onChange={(event) => setQuoteOnly(event.target.checked)}
                />
                Request a quote instead of online checkout
              </label>
              <p className="form-help">
                Publish real products without a selling price or stock claim.
                Customers send an inquiry with the selected product; they cannot
                add it to the online cart.
              </p>
              {quoteOnly && (
                <div className="quote-mode-preview">
                  <small>Storefront preview</small>
                  <strong>Request a quote</strong>
                  <span>Availability on request</span>
                  <span className="button primary" aria-hidden="true">
                    Enquire now →
                  </span>
                </div>
              )}
            </div>
          )}
        </section>
        <section className="editor-section" id="organization">
          <h2>Organization</h2>
          <div className="form-grid">
            <TaxonomyPicker
              kind="brands"
              options={brands}
              value={product?.brandId}
            />
            <TaxonomyPicker
              kind="categories"
              options={categories}
              value={product?.categoryId}
            />
          </div>
        </section>
        <SpecificationFields
          name="specs"
          value={product?.specs ?? sample?.specs}
          label="Product specifications"
        />
        {!product && (
          <>
            <section id="media" className="editor-section">
              <h2>Product images</h2>
              <p className="form-help">
                JPEG, PNG, WebP or AVIF. Up to 4 MB each, at least 100 × 100
                pixels. The first image becomes the cover.
              </p>
              <label>
                Choose product images
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  disabled={Boolean(createdId)}
                  onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                />
              </label>
              <ChosenImages files={files} />
              <label>
                Image description
                <input
                  name="imageAlt"
                  maxLength={250}
                  placeholder="Describe the product shown; defaults to the product name"
                />
              </label>
            </section>
            <section className="editor-section" id="specifications">
              <h2>Specifications & variants</h2>
              {Array.from({ length: skuCount }, (_, i) => (
                <div key={i} className="panel" style={{ marginTop: 18 }}>
                  <h3>SKU {i + 1}</h3>
                  <div className="form-grid" style={{ marginTop: 16 }}>
                    <label>
                      SKU code
                      <input
                        name={`sku_${i}`}
                        required
                        defaultValue={
                          sampleId
                            ? `SAMPLE-${sampleId.toUpperCase()}-${i + 1}`
                            : ""
                        }
                      />
                    </label>
                    {scopes.includes("pricing:write") && !quoteOnly && (
                      <PriceFields suffix={`_${i}`} />
                    )}
                    <label>
                      Manufacturer part number
                      <input name={`mpn_${i}`} maxLength={100} />
                    </label>
                    <label>
                      Condition
                      <select name={`condition_${i}`}>
                        <option>New</option>
                        <option>Refurbished</option>
                        <option>Used</option>
                      </select>
                    </label>
                    <label>
                      Supplied warranty details
                      <input name={`warranty_${i}`} maxLength={200} />
                    </label>
                    <SpecificationFields
                      name={`specs_${i}`}
                      label="SKU specifications"
                    />
                    <SpecificationFields
                      name={`options_${i}`}
                      label="Variant options"
                    />
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="button"
                style={{ marginTop: 15 }}
                disabled={skuCount >= 50}
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
        {createdId && error && (
          <p className="notice">
            Your draft is saved. Retry to resume the remaining uploads, or{" "}
            <Link href={`/admin/products/${createdId}`}>
              open the saved draft
            </Link>
            . A second product will not be created.
          </p>
        )}
        <p className="form-help">
          {product
            ? "Changes are prepared as an exact proposal. Review and approve to apply them; existing live content remains unchanged until then."
            : sample
              ? "This saves a private sample draft only. It does not publish or add stock."
              : "This saves an unpublished draft with your images. Review stock and publish in the next step."}
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
          <StoreVisibility
            productId={product.id}
            store={product.store}
            canEdit={scopes.includes("catalog:publish")}
          />
          <QuoteOnlyControl
            productId={product.id}
            quoteOnly={product.quoteOnly}
            canEdit={scopes.includes("catalog:publish")}
          />
          <ProductMediaEditor
            key={product.id}
            productId={product.id}
            initialVersion={product.version}
            initialMedia={product.media}
            published={product.status === "PUBLISHED"}
            canEdit={
              scopes.includes("catalog:write") &&
              (product.status !== "PUBLISHED" ||
                scopes.includes("catalog:publish"))
            }
          />
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
            {product.quoteOnly && (
              <p className="notice">
                The Online Store shows “Request a quote”. Internal prices remain
                available for authorised Direct Sales and are not displayed
                online.
              </p>
            )}
            {product.skus.map((s) => (
              <div key={s.id} style={{ marginBottom: 25 }}>
                <h3 style={{ marginBottom: 15 }}>{s.code}</h3>
                {scopes.includes("pricing:write") ? (
                  <PriceEditor sku={s} />
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
              Current status: <b>{product.status}</b>. Activation validates
              active SKU prices, images and required specifications.
              {product.store
                ? " This product is enabled for the online store."
                : " This product is for Direct Sales only and stays hidden from the website."}
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
                        : product.store
                          ? "Publish product"
                          : "Activate for Direct Sales"
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
export function QuoteOnlyControl({
  productId,
  quoteOnly,
  canEdit,
}: {
  productId: string;
  quoteOnly: boolean;
  canEdit: boolean;
}) {
  const [selected, setSelected] = useState(quoteOnly);
  return (
    <section className="editor-section panel">
      <h2>Online buying experience</h2>
      <p className="form-help">
        This setting controls how customers enquire or buy online. It preserves
        shared stock, internal pricing and Direct Sales.
      </p>
      <label className="check-row">
        <input
          type="checkbox"
          checked={selected}
          disabled={!canEdit}
          onChange={(event) => setSelected(event.target.checked)}
        />
        Request a quote instead of online checkout
      </label>
      <div className="quote-mode-preview">
        <small>Preview after approval</small>
        <strong>
          {selected ? "Request a quote" : "Show listed selling price"}
        </strong>
        <span>
          {selected
            ? "Availability on request · No online cart action"
            : "Online checkout uses the current price and available stock"}
        </span>
      </div>
      {canEdit ? (
        <ActionButton
          endpoint="admin/proposals"
          payload={{
            operation: "product.quoteOnly",
            targetId: productId,
            payload: { quoteOnly: selected },
          }}
          label="Review buying experience"
          proposal
        />
      ) : (
        <p className="form-help">
          Publishing access is required to change this setting.
        </p>
      )}
    </section>
  );
}
export function StoreVisibility({
  productId,
  store,
  canEdit,
}: {
  productId: string;
  store: boolean;
  canEdit: boolean;
}) {
  return (
    <section id="channels" className="editor-section panel">
      <h2>Sales channels</h2>
      <p className="notice">
        {store ? "Online Store & Direct Sales" : "Direct Sales only"}. Products
        must also be active to sell. This setting applies to every variant and
        does not change stock or existing orders.
      </p>
      {canEdit ? (
        <ProposalForm
          key={`${productId}-${store}`}
          operation="product.store"
          targetId={productId}
          fields={[
            {
              name: "store",
              label: "Show in online store",
              type: "checkbox",
              value: store,
              help: "Off: hidden from website listings, search and online checkout. Your team can still take Direct Sales orders.",
            },
          ]}
          label="Review store visibility"
        />
      ) : (
        <p className="form-help">
          A colleague with publishing access can change store visibility.
        </p>
      )}
    </section>
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
