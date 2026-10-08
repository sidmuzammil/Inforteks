import Link from "next/link";
import { PackageSearch, X } from "lucide-react";
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
    "category",
    "collection",
    "min",
    "max",
    "ram",
    "storage",
    "available",
    "brand",
    "sort",
    "featured",
    "offers",
    "limit",
  ];
  const lockedBrand = base.startsWith("/brand/");
  const refinements = [
    "ram",
    "storage",
    "min",
    "max",
    "available",
    "featured",
    ...(!lockedBrand ? ["brand"] : []),
  ];
  const activeFilters = Object.entries(query).filter(
    ([key, value]) =>
      refinements.includes(key) &&
      value &&
      (!["available", "featured"].includes(key) || value === "true"),
  );
  const hrefFor = (entries: [string, string][]) => {
    const params = new URLSearchParams(entries);
    return `${base}${params.size ? `?${params}` : ""}`;
  };
  const clearHref = hrefFor(
    Object.entries(query).filter(
      ([key, value]) =>
        known.includes(key) && !refinements.includes(key) && value,
    ),
  );
  const filterLabel = (key: string, value: string) => {
    if (key === "brand")
      return (
        result.facets.brands.find((brand) => brand.slug === value)?.name ??
        value
      );
    if (key === "ram") return `${value} GB memory`;
    if (key === "storage") return `${value} GB storage`;
    if (key === "min") return `From AED ${value}`;
    if (key === "max") return `Up to AED ${value}`;
    if (key === "available") return "In stock only";
    return "Featured products";
  };
  const update = (k: string, v: string) => {
    const q = new URLSearchParams(
      Object.entries(query).filter(([key]) => known.includes(key)),
    );
    if (v) q.set(k, v);
    else q.delete(k);
    return hrefFor([...q.entries()].filter(([, value]) => value));
  };
  const pageNumbers = [
    ...new Set([
      1,
      ...Array.from({ length: 5 }, (_, i) => result.page - 2 + i),
      result.pages,
    ]),
  ]
    .filter((page) => page >= 1 && page <= result.pages)
    .sort((a, b) => a - b);
  return (
    <div className="page-container catalogue-page">
      <Breadcrumbs items={[{ label: title }]} />
      <div className="page-heading catalogue-heading">
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <Link className="catalogue-summary" href="/categories">
          Browse all departments
        </Link>
      </div>
      <div className="catalogue-layout">
        <FilterToggle>
          <form action={base} className="catalogue-filter-form">
            <div className="filter-heading">
              <h2>Filters</h2>
              {activeFilters.length > 0 && (
                <Link className="text-button" href={clearHref}>
                  Clear all
                </Link>
              )}
            </div>
            {query.category && (
              <input type="hidden" name="category" value={query.category} />
            )}
            {query.collection && (
              <input type="hidden" name="collection" value={query.collection} />
            )}
            {query.q && <input type="hidden" name="q" value={query.q} />}
            {query.featured === "true" && (
              <input type="hidden" name="featured" value="true" />
            )}
            {query.offers === "true" && (
              <input type="hidden" name="offers" value="true" />
            )}
            {query.limit && (
              <input type="hidden" name="limit" value={query.limit} />
            )}
            {lockedBrand ? (
              <input type="hidden" name="brand" value={query.brand} />
            ) : (
              <fieldset>
                <legend>Brand</legend>
                <label>
                  <input
                    type="radio"
                    name="brand"
                    value=""
                    defaultChecked={!query.brand}
                  />
                  <span className="filter-value-label">All brands</span>
                </label>
                {result.facets.brands.map((b) => (
                  <label key={b.slug}>
                    <input
                      type="radio"
                      name="brand"
                      value={b.slug}
                      defaultChecked={query.brand === b.slug}
                    />
                    <span className="filter-value-label">{b.name}</span>
                    <small>{b.count}</small>
                  </label>
                ))}
              </fieldset>
            )}
            <fieldset>
              <legend>Price range (AED)</legend>
              <div className="filter-price">
                <input
                  type="number"
                  name="min"
                  min="0"
                  max="1000000"
                  step="0.01"
                  placeholder="Min"
                  defaultValue={query.min}
                  aria-label="Minimum price"
                />
                <input
                  type="number"
                  name="max"
                  min="0"
                  max="1000000"
                  step="0.01"
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
            <div className="filter-actions">
              <button className="button primary">Apply filters</button>
              <Link className="text-button" href={clearHref}>
                Reset filters
              </Link>
            </div>
          </form>
        </FilterToggle>
        <div className="catalogue-results">
          <div className="catalogue-toolbar">
            <span className="catalogue-result-count">
              <b>{result.total}</b> products found
              {result.pages > 1 && (
                <small>
                  Page {result.page} of {result.pages}
                </small>
              )}
            </span>
            <form action={base} className="catalogue-sort">
              {Object.entries(query)
                .filter(([k]) => known.includes(k) && k !== "sort")
                .map(([k, v]) => (
                  <input key={k} type="hidden" name={k} value={v} />
                ))}
              <label>
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
          {activeFilters.length > 0 && (
            <div className="active-filters" aria-label="Applied filters">
              {activeFilters.map(([key, value]) => (
                <Link
                  key={key}
                  href={update(key, "")}
                  className="filter-chip"
                  aria-label={`Remove ${filterLabel(key, value)} filter`}
                >
                  {filterLabel(key, value)} <X size={12} aria-hidden="true" />
                </Link>
              ))}
              <Link href={clearHref} className="text-button">
                Clear all
              </Link>
            </div>
          )}
          {result.products.some((product) => product.quoteOnly) && (
            <p className="catalogue-notice">
              Need pricing for a quote product? Open the item and send your
              requirements to our team.
            </p>
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
              <h2>No products found</h2>
              <p>
                Try a broader search or clear a filter to explore more options.
              </p>
              <Link className="button primary" href={clearHref}>
                Clear filters
              </Link>
              <Link className="text-button" href="/categories">
                Browse departments
              </Link>
            </div>
          )}
          {result.pages > 1 && (
            <nav className="pagination" aria-label="Catalogue pages">
              {result.page > 1 && (
                <Link
                  href={update("page", String(result.page - 1))}
                  aria-label="Previous page"
                >
                  ←
                </Link>
              )}
              {pageNumbers.map((page, index) => (
                <span key={page} className="pagination-item">
                  {index > 0 && page - pageNumbers[index - 1] > 1 && (
                    <span aria-hidden="true">…</span>
                  )}
                  <Link
                    href={update("page", String(page))}
                    aria-label={`Page ${page}`}
                    aria-current={page === result.page ? "page" : undefined}
                  >
                    {page}
                  </Link>
                </span>
              ))}
              {result.page < result.pages && (
                <Link
                  href={update("page", String(result.page + 1))}
                  aria-label="Next page"
                >
                  →
                </Link>
              )}
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
