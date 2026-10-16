"use client";

import { useState } from "react";
import Link from "next/link";
import {
  catalogueManifest,
  catalogueManifestProduct,
  type CatalogueImportPreview,
} from "@/lib/catalogue-manifest";
import { z } from "zod";

async function request<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`/api/v1/admin/catalogue-imports${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error?.message ?? "Catalogue import failed.");
  return result.data;
}

export function CatalogueImport() {
  const [previews, setPreviews] = useState<CatalogueImportPreview[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [created, setCreated] = useState<
    { externalId: string; productId: string }[]
  >([]);
  const [committed, setCommitted] = useState<string[]>([]);
  const [reviewed, setReviewed] = useState(false);
  const rows = previews.flatMap((preview) => preview.rows);
  async function preview(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    setMessage("");
    setPreviews([]);
    setCreated([]);
    setCommitted([]);
    setReviewed(false);
    try {
      if (file.size > 20_000_000)
        throw new Error("Use a JSON manifest smaller than 20 MB.");
      const manifest = catalogueManifest
        .extend({
          products: z.array(catalogueManifestProduct).min(1).max(10000),
        })
        .parse(JSON.parse(await file.text()));
      const batches: CatalogueImportPreview[] = [];
      for (let index = 0; index < manifest.products.length; index += 100) {
        batches.push(
          await request<CatalogueImportPreview>("", {
            manifest: {
              ...manifest,
              products: manifest.products.slice(index, index + 100),
            },
          }),
        );
        setMessage(
          `Reviewed ${Math.min(index + 100, manifest.products.length)} of ${manifest.products.length} products.`,
        );
      }
      setPreviews(batches);
      setMessage(
        "Preview ready. No products have been created. Review every conflict and research note below.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the manifest.");
    } finally {
      setBusy(false);
    }
  }
  async function commit() {
    setBusy(true);
    setError("");
    try {
      for (const preview of previews.filter((p) => !committed.includes(p.id))) {
        const result = await request<{
          rows: { externalId: string; productId: string }[];
        }>(`/${preview.id}/commit`, { fingerprint: preview.fingerprint });
        setCreated((current) => [...current, ...result.rows]);
        setCommitted((current) => [...current, preview.id]);
      }
      setMessage(
        "Draft creation complete. Products have no price or stock. Add verified photos and review normal publication proposals in each product editor.",
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Draft creation failed. Completed batches are retained; retrying will not duplicate them.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel" style={{ marginBottom: 24 }}>
      <h2>Researched catalogue import</h2>
      <p>
        Import genuine product details as request-a-quote drafts. Existing
        products, stock and prices are preserved. Photographs and publication
        are reviewed separately.
      </p>
      <label className="field" style={{ display: "block", marginBlock: 16 }}>
        <span>Research manifest (JSON)</span>
        <input
          type="file"
          accept="application/json,.json"
          disabled={busy}
          onChange={(event) => void preview(event.target.files?.[0])}
        />
      </label>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {!!rows.length && (
        <>
          <h3>
            {rows.filter((r) => r.status === "create").length} new ·{" "}
            {rows.filter((r) => r.status === "existing").length} already
            imported · {rows.filter((r) => r.status === "conflict").length}{" "}
            conflicts
          </h3>
          <details>
            <summary>Review all product rows and research notes</summary>
            <div style={{ overflowX: "auto", maxHeight: 480 }}>
              <table>
                <thead>
                  <tr>
                    <th>Product / SKU</th>
                    <th>Action</th>
                    <th>Review notes</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={`${row.externalId}-${index}`}>
                      <td>
                        {row.name}
                        <br />
                        <small>{row.code}</small>
                      </td>
                      <td>
                        {row.status === "create"
                          ? "Create quote-only draft"
                          : row.status === "existing"
                            ? "Keep existing"
                            : "Resolve conflict"}
                        {row.productId && (
                          <>
                            <br />
                            <Link href={`/admin/products/${row.productId}`}>
                              Open product
                            </Link>
                          </>
                        )}
                      </td>
                      <td>
                        {row.issues.length
                          ? row.issues.join(" ")
                          : "Research complete; verify uploaded photos before publication."}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <label style={{ display: "block", marginBlock: 16 }}>
            <input
              type="checkbox"
              checked={reviewed}
              disabled={busy}
              onChange={(e) => setReviewed(e.target.checked)}
            />{" "}
            I reviewed these rows. Create only quote-only drafts and preserve
            existing records.
          </label>
          <button
            className="button"
            type="button"
            onClick={() => void commit()}
            disabled={
              busy ||
              !reviewed ||
              rows.some((r) => r.status === "conflict") ||
              committed.length === previews.length
            }
          >
            {busy ? "Working…" : "Create reviewed drafts"}
          </button>
          <p>
            <small>
              Previews expire after 15 minutes. Imports run in atomic batches of
              up to 100; completed batches remain available if a later batch
              needs review.
            </small>
          </p>
        </>
      )}
      {!!created.length && (
        <details>
          <summary>Open {created.length} imported products</summary>
          <ul>
            {created.map((row) => (
              <li key={row.productId}>
                <Link href={`/admin/products/${row.productId}`}>
                  {row.externalId}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
