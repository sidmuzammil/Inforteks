"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "./store-client";
import { money, slugify } from "@/lib/utils";
import { aedToFils, readPrices } from "@/lib/merchant-pricing";
export function PriceFields({
  suffix = "",
  price,
  compareAt,
}: {
  suffix?: string;
  price?: number | null;
  compareAt?: number | null;
}) {
  const [current, setCurrent] = useState(
    price === null || price === undefined ? "" : (price / 100).toFixed(2),
  );
  const [previous, setPrevious] = useState(
    compareAt ? (compareAt / 100).toFixed(2) : "",
  );
  let currentFils: number | null = null,
    previousFils: number | null = null;
  try {
    currentFils = aedToFils(current);
    previousFils = aedToFils(previous);
  } catch {
    /* Inputs retain the user's text until validation. */
  }
  const sale =
    currentFils !== null && previousFils !== null && previousFils > currentFils;
  return (
    <>
      <label>
        Price (AED)
        <input
          type="number"
          aria-label="Price (AED)"
          name={`price${suffix}`}
          min="0"
          max="1000000"
          step="0.01"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
        <small className="form-help">Current selling price.</small>
      </label>
      <label>
        Previous price (AED)
        <input
          type="number"
          aria-label="Previous price (AED)"
          name={`compareAt${suffix}`}
          min="0"
          max="1000000"
          step="0.01"
          value={previous}
          onChange={(e) => setPrevious(e.target.value)}
        />
        <small className="form-help">
          Optional genuine previous price, higher than the current price.
        </small>
      </label>
      <div className="price-preview full" aria-live="polite">
        <small>Storefront price preview</small>
        <strong>
          {currentFils === null ? "Price not set" : money(currentFils)}
        </strong>
        {sale && (
          <>
            <del>{money(previousFils!)}</del>
            <span className="badge">
              Save {Math.round((1 - currentFils! / previousFils!) * 100)}%
            </span>
          </>
        )}
      </div>
    </>
  );
}
export function PriceEditor({
  sku,
}: {
  sku: { id: string; price?: number | null; compareAt?: number | null };
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="form-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        setBusy(true);
        try {
          const payload = readPrices(new FormData(e.currentTarget));
          if (payload.price === null)
            throw new Error("Enter a current selling price.");
          const p = await api<{ id: string }>("admin/proposals", {
            operation: "price.change",
            targetId: sku.id,
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
        <PriceFields price={sku.price} compareAt={sku.compareAt} />
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <button className="button primary" disabled={busy}>
        {busy ? "Preparing…" : "Preview price change"}
      </button>
    </form>
  );
}
export function SpecificationFields({
  name,
  value = {},
  label,
}: {
  name: string;
  value?: unknown;
  label: string;
}) {
  const initial = Object.entries(
    (value ?? {}) as Record<string, string | number>,
  ).map(([key, value]) => ({
    key,
    value: String(value),
    type: typeof value === "number" ? "number" : "text",
  }));
  const [rows, setRows] = useState(initial);
  const [advanced, setAdvanced] = useState(false);
  const [raw, setRaw] = useState("");
  const [error, setError] = useState("");
  const data = Object.fromEntries(
    rows
      .filter((r) => r.key.trim())
      .map((r) => [
        r.key.trim(),
        r.type === "number" && r.value.trim() !== ""
          ? Number(r.value)
          : r.value,
      ]),
  );
  return (
    <div className="spec-editor full">
      <h3>{label}</h3>
      <p className="form-help">
        Add real details, such as RAM, storage or colour. Use numbers for
        comparable specifications.
      </p>
      <button
        type="button"
        className="text-button"
        onClick={() => {
          setError("");
          if (!advanced) {
            setRaw(JSON.stringify(data, null, 2));
            setAdvanced(true);
            return;
          }
          try {
            const parsed = JSON.parse(raw);
            if (
              !parsed ||
              Array.isArray(parsed) ||
              typeof parsed !== "object" ||
              Object.values(parsed).some(
                (v) => !["string", "number"].includes(typeof v),
              )
            )
              throw new Error("Use a JSON object with text or number values.");
            setRows(
              Object.entries(parsed).map(([key, value]) => ({
                key,
                value: String(value),
                type: typeof value === "number" ? "number" : "text",
              })),
            );
            setAdvanced(false);
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        {advanced ? "Use fields" : "Advanced JSON"}
      </button>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {advanced ? (
        <label>
          {label} (JSON)
          <textarea
            name={name}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
        </label>
      ) : (
        <>
          <input type="hidden" name={name} value={JSON.stringify(data)} />
          {rows.map((r, i) => (
            <div className="spec-row" key={i}>
              <label>
                Specification name
                <input
                  aria-label={`${label} name ${i + 1}`}
                  value={r.key}
                  required
                  maxLength={40}
                  pattern="[a-zA-Z0-9_ ]+"
                  onChange={(e) =>
                    setRows(
                      rows.map((v, j) =>
                        j === i ? { ...v, key: e.target.value } : v,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Value
                <input
                  aria-label={`${label} value ${i + 1}`}
                  type={r.type}
                  step="any"
                  value={r.value}
                  maxLength={200}
                  required
                  onChange={(e) =>
                    setRows(
                      rows.map((v, j) =>
                        j === i ? { ...v, value: e.target.value } : v,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Type
                <select
                  value={r.type}
                  onChange={(e) =>
                    setRows(
                      rows.map((v, j) =>
                        j === i ? { ...v, type: e.target.value } : v,
                      ),
                    )
                  }
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                </select>
              </label>
              <button
                type="button"
                className="text-button"
                aria-label={`Remove ${label} ${i + 1}`}
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className="button"
            onClick={() =>
              setRows([...rows, { key: "", value: "", type: "text" }])
            }
          >
            Add {label.toLowerCase()}
          </button>
        </>
      )}
    </div>
  );
}
export function TaxonomyPicker({
  kind,
  options,
  value,
}: {
  kind: "brands" | "categories";
  options: { id: string; name: string }[];
  value?: string;
}) {
  const [items, setItems] = useState(options);
  const [selected, setSelected] = useState(value ?? options[0]?.id ?? "");
  const [adding, setAdding] = useState(!options.length);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const label = kind === "brands" ? "Brand" : "Category";
  return (
    <div className="taxonomy-picker">
      <label>
        {label}
        <select
          aria-label={label}
          name={kind === "brands" ? "brandId" : "categoryId"}
          required
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">Choose {label.toLowerCase()}</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="text-button"
        onClick={() => setAdding(!adding)}
      >
        {adding ? "Close" : `Create ${label.toLowerCase()}`}
      </button>
      {adding && (
        <div className="inline-create">
          <label>
            New {label.toLowerCase()} name
            <input
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="button"
            disabled={busy || name.trim().length < 2}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const item = await api<{ id: string; name: string }>(
                  `admin/${kind}`,
                  { name: name.trim(), slug: slugify(name) },
                );
                setItems([...items, item]);
                setSelected(item.id);
                setAdding(false);
                setName("");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Save {label.toLowerCase()}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </div>
  );
}
function LocalImage({ file, index }: { file: File; index: number }) {
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    if (image.current) image.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <figure>
      <img
        ref={image}
        alt={`Selected image ${index + 1}`}
        width="100"
        height="80"
        style={{ objectFit: "contain" }}
      />
      <figcaption>{file.name}</figcaption>
    </figure>
  );
}
export function ChosenImages({ files }: { files: File[] }) {
  return (
    <div className="thumbnails">
      {files.map((file, i) => (
        <LocalImage
          key={`${file.name}-${file.lastModified}-${i}`}
          file={file}
          index={i}
        />
      ))}
    </div>
  );
}
