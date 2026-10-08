import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";
import { Check } from "lucide-react";
import { db } from "@/lib/db";
import { catalogue, getProduct } from "@/domains/catalogue";
import { ProductPurchase, Gallery } from "@/components/store-client";
import { Breadcrumbs, ProductCard, SectionHeading } from "@/components/store";
import type { Metadata } from "next";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const p = await getProduct(slug);
  return {
    title: p?.name ?? "Product unavailable",
    description: p?.description.slice(0, 160),
    alternates: { canonical: `/product/${slug}` },
  };
}
export default async function Product({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sku?: string }>;
}) {
  const { slug } = await params;
  const p = await getProduct(slug);
  if (!p) {
    const redir = await db.slugRedirect.findUnique({
      where: { oldSlug: slug },
    });
    if (redir) permanentRedirect(`/product/${redir.newSlug}`);
    notFound();
  }
  const { sku } = await searchParams;
  const related = await catalogue({ category: p.category.slug, limit: 6 });
  const selectedSku = p.skus.find((item) => item.id === sku) ?? p.skus[0];
  const specifications = Object.entries({
    ...(p.specs as Record<string, unknown>),
    ...(selectedSku?.specs as Record<string, unknown>),
  }).filter(
    ([key, value]) => key !== "dataset" && value !== null && value !== "",
  );
  const relatedProducts = related.products
    .filter((item) => item.id !== p.id)
    .slice(0, 5);
  const schema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: p.description,
    image: p.media.map(
      (m) =>
        new URL(
          m.url,
          process.env.APP_URL ??
            process.env.BETTER_AUTH_URL ??
            process.env.NEXT_PUBLIC_APP_URL ??
            "http://localhost:3000",
        ).href,
    ),
    brand: { "@type": "Brand", name: p.brand.name },
    ...(!p.quoteOnly
      ? {
          offers: p.skus
            .filter((s) => s.price !== null)
            .map((s) => ({
              "@type": "Offer",
              sku: s.code,
              price: (s.price! / 100).toFixed(2),
              priceCurrency: "AED",
              availability: `https://schema.org/${s.available ? "InStock" : "OutOfStock"}`,
              url: `${process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/product/${p.slug}?sku=${s.id}`,
            })),
        }
      : {}),
  };
  return (
    <div className="page-container product-detail-page">
      <Breadcrumbs
        items={[
          { label: p.category.name, href: `/category/${p.category.slug}` },
          { label: p.name },
        ]}
      />
      <div className="product-detail product-detail-marketplace">
        <Gallery product={p} />
        <div className="product-info">
          <div className="product-heading">
            <Link
              className="product-brand-link"
              href={`/brand/${p.brand.slug}`}
            >
              Shop {p.brand.name}
            </Link>
            <h1>{p.name}</h1>
            {p.model && (
              <p className="product-model">
                Model: <b>{p.model}</b>
              </p>
            )}
            <a className="product-review-link" href="#product-reviews">
              {p.reviews.length
                ? `${p.reviews.length} verified purchase ${p.reviews.length === 1 ? "review" : "reviews"}`
                : "Customer reviews"}
            </a>
          </div>
          {p.highlights.length > 0 && (
            <ul className="highlights product-highlights">
              {p.highlights.map((highlight) => (
                <li key={highlight}>
                  <Check size={15} aria-hidden="true" />
                  {highlight}
                </li>
              ))}
            </ul>
          )}
          <div className="product-information-links">
            <a href="#product-specifications">View full specifications</a>
            <Link href={`/category/${p.category.slug}`}>
              More {p.category.name}
            </Link>
          </div>
        </div>
        <div className="product-purchase-panel">
          <ProductPurchase
            key={selectedSku?.id ?? p.id}
            product={p}
            initialSku={sku}
            showSpecifications={false}
            showHighlights={false}
          />
        </div>
      </div>
      {p.demo && (
        <div className="notice">
          Development listing. Prices and specifications are illustrative;
          imagery is representative. This product is not a verified live offer.
        </div>
      )}
      <nav className="product-section-nav" aria-label="Product information">
        <a href="#product-overview">Overview</a>
        <a href="#product-specifications">Specifications</a>
        <a href="#product-reviews">Reviews ({p.reviews.length})</a>
      </nav>
      <div className="product-content-grid">
        <section
          className="product-description product-overview"
          id="product-overview"
        >
          <h2>Product overview</h2>
          <p>
            {p.description ||
              "Contact our team for more information about this product."}
          </p>
          <Link
            href={
              selectedSku
                ? `/contact?${new URLSearchParams({ product: p.slug, sku: selectedSku.id })}`
                : "/contact"
            }
            className="text-button"
          >
            Ask about this product
          </Link>
        </section>
        <section
          className="product-description product-specifications"
          id="product-specifications"
        >
          <h2>Specifications</h2>
          <table className="product-spec-table">
            <tbody>
              <tr>
                <th scope="row">Brand</th>
                <td>{p.brand.name}</td>
              </tr>
              {p.model && (
                <tr>
                  <th scope="row">Model</th>
                  <td>{p.model}</td>
                </tr>
              )}
              {selectedSku && (
                <>
                  <tr>
                    <th scope="row">SKU</th>
                    <td>{selectedSku.code}</td>
                  </tr>
                  {selectedSku.mpn && (
                    <tr>
                      <th scope="row">Manufacturer part number</th>
                      <td>{selectedSku.mpn}</td>
                    </tr>
                  )}
                  <tr>
                    <th scope="row">Condition</th>
                    <td>{selectedSku.condition}</td>
                  </tr>
                </>
              )}
              {specifications.map(([key, value]) => (
                <tr key={key}>
                  <th scope="row">{key.replaceAll("_", " ")}</th>
                  <td>{String(value)}</td>
                </tr>
              ))}
              {selectedSku?.warranty && (
                <tr>
                  <th scope="row">Warranty</th>
                  <td>{selectedSku.warranty}</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
      <section
        className="product-description product-reviews"
        id="product-reviews"
      >
        <h2>Customer reviews</h2>
        {p.reviews.length ? (
          p.reviews.map((r) => (
            <div key={r.id} className="notice">
              <b>{r.rating} / 5 · Verified purchase</b>
              <p>{r.body}</p>
            </div>
          ))
        ) : (
          <p>
            No published reviews yet. Verified purchasers can submit a review
            from their account after fulfillment.
          </p>
        )}
      </section>
      {relatedProducts.length > 0 && (
        <section className="section related-products">
          <SectionHeading
            title="Related products"
            subtitle={`MORE FROM ${p.category.name.toUpperCase()}`}
            href={`/category/${p.category.slug}`}
          />
          <div className="product-grid">
            {relatedProducts.map((r) => (
              <ProductCard key={r.id} product={r} />
            ))}
          </div>
        </section>
      )}
      {!p.demo && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(schema).replaceAll("<", "\\u003c"),
          }}
        />
      )}
    </div>
  );
}
