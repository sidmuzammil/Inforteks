import Link from "next/link";
import { PackageSearch } from "lucide-react";
import { catalogue } from "@/domains/catalogue";
import { ProductCard, Breadcrumbs } from "./store";
import { FilterToggle } from "./store-client";
export async function CataloguePage({
  title,
  subtitle,
  query,
  base,
}: {
  title: string;
  subtitle: string;
  query: Record<string, string>;
  base: string;
}) {
  const result = await catalogue(query);
  const known = [
    "q",
    "min",
    "max",
    "ram",
    "storage",
    "available",
    "brand",
    "sort",
    "featured",
  ];
  const update = (k: string, v: string) => {
    const q = new URLSearchParams(
      Object.entries(query).filter(([key]) => known.includes(key)),
    );
    q.set(k, v);
    return `${base}?${q}`;
  };
  return (
    <div className="page-container">
      <Breadcrumbs items={[{ label: title }]} />
      <div className="page-heading">
        <div className="eyebrow">FIND YOUR NEXT UPGRADE</div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="catalogue-layout">
        <FilterToggle>
          <form action={base}>
            <h3>Refine your search</h3>
            {query.q && <input type="hidden" name="q" value={query.q} />}
            {query.featured === "true" && (
              <input type="hidden" name="featured" value="true" />
            )}
            <fieldset>
              <legend>Brand</legend>
              {result.facets.brands.map((b) => (
                <label key={b.slug}>
                  <input
                    type="radio"
                    name="brand"
                    value={b.slug}
                    defaultChecked={query.brand === b.slug}
                  />
                  {b.name}
                  <small>{b.count}</small>
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend>Price range (AED)</legend>
              <div className="filter-price">
                <input
                  type="number"
                  name="min"
                  min="0"
                  placeholder="Min"
                  defaultValue={query.min}
                  aria-label="Minimum price"
                />
                <input
                  type="number"
                  name="max"
                  min="0"
                  placeholder="Max"
                  defaultValue={query.max}
                  aria-label="Maximum price"
                />
              </div>
            </fieldset>
            {result.facets.ram.length > 0 && (
              <fieldset>
                <legend>Memory</legend>
                <select
                  name="ram"
                  defaultValue={query.ram ?? ""}
                  aria-label="Memory"
                >
                  <option value="">All memory sizes</option>
                  {result.facets.ram.map((v) => (
                    <option key={v} value={v!}>
                      {v} GB
                    </option>
                  ))}
                </select>
              </fieldset>
            )}
            {result.facets.storage.length > 0 && (
              <fieldset>
                <legend>Storage</legend>
                <select
                  name="storage"
                  defaultValue={query.storage ?? ""}
                  aria-label="Storage"
                >
                  <option value="">All capacities</option>
                  {result.facets.storage.map((v) => (
                    <option key={v} value={v!}>
                      {v} GB
                    </option>
                  ))}
                </select>
              </fieldset>
            )}
            <fieldset>
              <legend>Availability</legend>
              <label>
                <input
                  type="checkbox"
                  name="available"
                  value="true"
                  defaultChecked={query.available === "true"}
                />
                In stock only
              </label>
            </fieldset>
            <input
              type="hidden"
              name="sort"
              value={query.sort ?? "relevance"}
            />
            <button className="button primary">Apply filters</button>
            <Link className="button" href={base}>
              Clear all
            </Link>
          </form>
        </FilterToggle>
        <div>
          <div className="catalogue-toolbar">
            <span>
              <b>{result.total}</b> products found
            </span>
            <form action={base}>
              {Object.entries(query)
                .filter(([k]) => known.includes(k) && k !== "sort")
                .map(([k, v]) => (
                  <input key={k} type="hidden" name={k} value={v} />
                ))}
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 11,
                }}
              >
                Sort by
                <select
                  name="sort"
                  defaultValue={query.sort ?? "relevance"}
                  aria-label="Sort products"
                >
                  <option value="relevance">Recommended</option>
                  <option value="price-asc">Price: low to high</option>
                  <option value="price-desc">Price: high to low</option>
                  <option value="newest">Newest first</option>
                </select>
                <button className="text-button">Apply</button>
              </label>
            </form>
          </div>
          {Object.entries(query).some(
            ([k, v]) =>
              ["ram", "storage", "min", "max", "available", "brand"].includes(
                k,
              ) && v,
          ) && (
            <div className="active-filters">
              {Object.entries(query)
                .filter(
                  ([k, v]) =>
                    [
                      "ram",
                      "storage",
                      "min",
                      "max",
                      "available",
                      "brand",
                    ].includes(k) && v,
                )
                .map(([k, v]) => (
                  <Link key={k} href={update(k, "")} className="filter-chip">
                    {k}: {v} ×
                  </Link>
                ))}
              <Link href={base} className="text-button">
                Clear all
              </Link>
            </div>
          )}
          {result.products.length ? (
            <div className="product-grid catalogue-products">
              {result.products.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <PackageSearch size={38} />
              <h2>No matches just yet</h2>
              <p>
                Try a broader search or clear a filter to explore more options.
              </p>
              <Link className="button primary" href={base}>
                Clear filters
              </Link>
              <Link className="text-button" href="/categories">
                Browse departments
              </Link>
            </div>
          )}
          {result.pages > 1 && (
            <nav className="pagination" aria-label="Catalogue pages">
              {Array.from(
                { length: Math.min(result.pages, 15) },
                (_, i) => i + 1,
              ).map((p) => (
                <Link
                  key={p}
                  href={update("page", String(p))}
                  aria-current={p === result.page ? "page" : undefined}
                >
                  {p}
                </Link>
              ))}
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
