import Link from "next/link";
import { ArrowRight, ArrowUpRight, ChevronRight } from "lucide-react";
import type { HomeSectionData } from "@/lib/home-sections";
import type { PublicProduct } from "@/domains/catalogue";
import { ProductCard, SectionHeading } from "./catalogue-cards";
export type SectionPreviewData = {
  section: HomeSectionData;
  products: PublicProduct[];
  categories: { id: string; name: string; slug: string; icon: string }[];
};
export function HomeSectionView({
  section: s,
  products = [],
  categories = [],
  preview = false,
}: SectionPreviewData & { preview?: boolean }) {
  const c = s.content;
  if (s.kind === "html")
    return (
      <section
        className="custom-home-banner"
        aria-label={s.title}
        dangerouslySetInnerHTML={{ __html: c.html }}
      />
    );
  if (s.kind === "hero")
    return (
      <section className={`hero-grid ${c.showSideCards ? "" : "hero-full"}`}>
        <div className="hero-main">
          <img
            className="hero-image"
            src={
              s.bannerMediaId ? `/media/${s.bannerMediaId}` : "/brand/hero.png"
            }
            alt={c.imageAlt}
            fetchPriority="high"
          />
          <div className="hero-overlay" />
          <div className="hero-copy">
            <span className="hero-tag">
              <span /> {c.eyebrow}
            </span>
            <h1>{s.title}</h1>
            <p>{s.subtitle}</p>
            <Link href={s.href} className="button white">
              {s.buttonLabel}
              <ArrowUpRight size={17} />
            </Link>
            <div className="hero-foot">{c.footer}</div>
          </div>
        </div>
        {c.showSideCards && (
          <div className="hero-side">
            {c.sideCards.map((card, i) => (
              <Link
                key={i}
                href={card.href}
                className={`mini-hero ${i === 0 ? "workspace-hero" : "accessories-hero"}`}
              >
                <span className="eyebrow">{card.eyebrow}</span>
                <h2>{card.title}</h2>
                <span className="text-link">
                  {card.buttonLabel}
                  <ArrowRight size={15} />
                </span>
                <img
                  src={
                    card.mediaId
                      ? `/media/${card.mediaId}`
                      : `/illustrations/${i === 0 ? "monitor" : "headphones"}.svg`
                  }
                  alt={card.alt}
                />
              </Link>
            ))}
          </div>
        )}
      </section>
    );
  if (s.kind === "cta")
    return (
      <section className="editorial-banner">
        <div>
          <span className="eyebrow">{c.eyebrow}</span>
          <h2>{s.title}</h2>
          <p>{s.subtitle}</p>
          <Link className="button primary" href={s.href}>
            {s.buttonLabel}
            <ArrowUpRight size={16} />
          </Link>
        </div>
        <img
          src={
            s.bannerMediaId
              ? `/media/${s.bannerMediaId}`
              : "/illustrations/desktop.svg"
          }
          alt={c.imageAlt}
        />
        <span className="editorial-word">{c.footer}</span>
      </section>
    );
  if (
    !preview &&
    (s.kind === "categories" ? !categories.length : !products.length)
  )
    return null;
  return (
    <section
      className={`section ${s.kind === "categories" ? "category-section" : ""}`}
    >
      <SectionHeading
        title={s.title}
        subtitle={s.subtitle}
        href={s.href}
        label={s.buttonLabel}
      />
      {s.kind === "categories" ? (
        <div className="category-shortcuts">
          {categories.map((c) => (
            <Link href={`/category/${c.slug}`} key={c.id}>
              <span className="category-art">
                <img
                  src={`/illustrations/${c.icon}.svg`}
                  alt=""
                  width="110"
                  height="88"
                />
              </span>
              <b>{c.name}</b>
              <ChevronRight size={13} />
            </Link>
          ))}
        </div>
      ) : (
        <div className="product-grid">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
      {preview &&
        !(s.kind === "categories" ? categories.length : products.length) && (
          <p className="notice">
            No published {s.kind === "categories" ? "departments" : "products"}{" "}
            match this section yet. It stays hidden on the storefront until
            content is available.
          </p>
        )}
    </section>
  );
}
