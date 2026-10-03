import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { money } from "@/lib/utils";
import type { PublicProduct } from "@/domains/catalogue";
import { CardActions, WishlistButton } from "./store-client";
export function ProductCard({ product: p }: { product: PublicProduct }) {
  const s = p.skus[0];
  const sale =
    s?.compareAt && s.compareAt > s.price
      ? Math.round((1 - s.price / s.compareAt) * 100)
      : 0;
  return (
    <article className="product-card">
      <div className="card-image">
        <Link
          href={`/product/${p.slug}${p.skus[0] ? `?sku=${p.skus[0].id}` : ""}`}
          tabIndex={-1}
        >
          <img
            src={p.media[0]?.url ?? "/illustrations/laptop.svg"}
            alt={p.media[0]?.alt ?? p.name}
            width="300"
            height="240"
            loading="lazy"
          />
        </Link>
        {sale > 0 ? (
          <span className="sale-badge">−{sale}%</span>
        ) : p.demo ? (
          <span className="new-badge">EXPLORE</span>
        ) : null}
        <WishlistButton product={p} />
      </div>
      <div className="card-content">
        <div className="card-brand">{p.brand.name}</div>
        <Link
          href={`/product/${p.slug}${p.skus[0] ? `?sku=${p.skus[0].id}` : ""}`}
          className="product-name"
        >
          {p.name}
        </Link>
        <p className="card-spec">
          {p.highlights[0] ?? "Explore product details"}
        </p>
        <div className="card-price">
          {s ? money(s.price) : "Price unavailable"}
        </div>
        <div className="price-secondary">
          {sale > 0 && <del>{money(s.compareAt!)}</del>}
          {s?.available ? (
            <span className="stock-dot">In stock</span>
          ) : (
            <span className="muted">Out of stock</span>
          )}
        </div>
        <CardActions product={p} />
      </div>
    </article>
  );
}
export function SectionHeading({
  title,
  subtitle,
  href,
  label = "View all",
}: {
  title: string;
  subtitle?: string;
  href: string;
  label?: string;
}) {
  return (
    <div className="section-heading">
      <div>
        {subtitle && <p className="eyebrow">{subtitle}</p>}
        <h2>{title}</h2>
      </div>
      <Link href={href}>
        {label}
        <ArrowRight size={16} />
      </Link>
    </div>
  );
}
