import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { money } from "@/lib/utils";
import type { PublicProduct } from "@/domains/catalogue";
import { CardActions, WishlistButton } from "./store-client";
export function ProductCard({
  product: p,
  preview = false,
}: {
  product: PublicProduct;
  preview?: boolean;
}) {
  const s = p.skus[0];
  const href = `/product/${p.slug}${s ? `?sku=${s.id}` : ""}`;
  const model = p.model || s?.mpn;
  const specifications = p.highlights.slice(0, 2);
  const sale =
    !p.quoteOnly && s?.price != null && s.compareAt && s.compareAt > s.price
      ? Math.round((1 - s.price / s.compareAt) * 100)
      : 0;
  return (
    <article
      className={`product-card marketplace-product-card ${p.quoteOnly ? "quote-product" : ""}`}
    >
      <div className="card-image">
        <Link href={href} tabIndex={-1}>
          {p.media[0] ? (
            <img
              src={p.media[0].url}
              alt={p.media[0].alt || p.name}
              width="300"
              height="240"
              loading="lazy"
            />
          ) : (
            <span className="product-image-unavailable">
              {p.brand.name}
              <small>Product image unavailable</small>
            </span>
          )}
        </Link>
        {sale > 0 ? (
          <span className="sale-badge">−{sale}%</span>
        ) : p.demo ? (
          <span className="new-badge">SAMPLE</span>
        ) : null}
        {!preview && <WishlistButton product={p} />}
      </div>
      <div className="card-content">
        <div className="card-brand">{p.brand.name}</div>
        <Link href={href} className="product-name">
          {p.name}
        </Link>
        {model && (
          <p className="card-model">
            <span>Model</span> {model}
          </p>
        )}
        {specifications.length > 0 && (
          <p className="card-spec">{specifications.join(" · ")}</p>
        )}
        <div className="card-price-block">
          <div className="card-price">
            {p.quoteOnly
              ? "Request a quote"
              : s?.price != null
                ? money(s.price)
                : "Price unavailable"}
          </div>
          <div className="price-secondary">
            {sale > 0 && <del>{money(s.compareAt!)}</del>}
            {p.quoteOnly ? (
              <span className="quote-availability">
                Availability on request
              </span>
            ) : s && s.available > 0 ? (
              <span className="stock-dot">In stock</span>
            ) : (
              <span className="muted">Out of stock</span>
            )}
          </div>
          {s?.condition && s.condition !== "New" && (
            <span className="card-condition">{s.condition}</span>
          )}
        </div>
        {p.demo && (
          <small className="sample-label">
            Illustrative sample · not merchant stock
          </small>
        )}
        {preview ? (
          <button className="add-button" disabled>
            Preview only
          </button>
        ) : (
          <CardActions product={p} />
        )}
      </div>
    </article>
  );
}
export function SectionHeading({
  title,
  subtitle,
  href,
  label = "See all",
}: {
  title: string;
  subtitle?: string;
  href: string;
  label?: string;
}) {
  return (
    <div className="section-heading marketplace-section-heading">
      <div>
        <h2>{title}</h2>
        {subtitle && <p className="eyebrow">{subtitle}</p>}
      </div>
      <Link href={href}>
        {label}
        <ArrowRight size={16} />
      </Link>
    </div>
  );
}
