import { notFound, permanentRedirect } from "next/navigation";
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
    offers: p.skus.map((s) => ({
      "@type": "Offer",
      sku: s.code,
      price: (s.price / 100).toFixed(2),
      priceCurrency: "AED",
      availability: `https://schema.org/${s.available ? "InStock" : "OutOfStock"}`,
      url: `${process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/product/${p.slug}?sku=${s.id}`,
    })),
  };
  return (
    <div className="page-container">
      <Breadcrumbs
        items={[
          { label: p.category.name, href: `/category/${p.category.slug}` },
          { label: p.name },
        ]}
      />
      <div className="product-detail">
        <Gallery product={p} />
        <div className="product-info">
          <div className="eyebrow">{p.category.name}</div>
          <h1>{p.name}</h1>
          <ProductPurchase product={p} initialSku={sku} />
        </div>
      </div>
      {p.demo && (
        <div className="notice">
          Development listing. Prices and specifications are illustrative;
          imagery is representative. This product is not a verified live offer.
        </div>
      )}
      <section className="product-description">
        <h2>A closer look</h2>
        <p>{p.description}</p>
      </section>
      <section className="product-description">
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
      <section className="section">
        <SectionHeading
          title="More to explore"
          subtitle="FROM THE SAME DEPARTMENT"
          href={`/category/${p.category.slug}`}
        />
        <div className="product-grid">
          {related.products
            .filter((r) => r.id !== p.id)
            .slice(0, 5)
            .map((r) => (
              <ProductCard key={r.id} product={r} />
            ))}
        </div>
      </section>
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
