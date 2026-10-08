import Link from "next/link";
import { ArrowRight, ArrowUpRight, ChevronRight } from "lucide-react";
import type { HomeSectionData } from "@/lib/home-sections";
import type { PublicProduct } from "@/domains/catalogue";
import { ProductCard, SectionHeading } from "./catalogue-cards";
import { DepartmentIcon } from "./department-icon";
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
      <section
        className={`hero-grid tone-${c.tone} ${c.showSideCards ? "" : "hero-full"}`}
      >
        <div className="hero-main">
          <img
            className="hero-image"
            src={
              s.bannerMediaId
                ? `/media/${s.bannerMediaId}`
                : "/brand/storefront-hero.webp"
            }
            alt={s.bannerMediaId ? c.imageAlt : ""}
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
                {card.mediaId ? (
                  <img src={`/media/${card.mediaId}`} alt={card.alt} />
                ) : (
                  <span className="mini-hero-decoration" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>
    );
  if (s.kind === "cta")
    return (
      <section className={`editorial-banner tone-${c.tone}`}>
        <div>
          <span className="eyebrow">{c.eyebrow}</span>
          <h2>{s.title}</h2>
          <p>{s.subtitle}</p>
          <Link className="button primary" href={s.href}>
            {s.buttonLabel}
            <ArrowUpRight size={16} />
          </Link>
        </div>
        {s.bannerMediaId ? (
          <img src={`/media/${s.bannerMediaId}`} alt={c.imageAlt} />
        ) : (
          <span className="editorial-decoration" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        )}
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
                <DepartmentIcon name={`${c.slug} ${c.name}`} size={34} />
              </span>
              <b>{c.name}</b>
              <ChevronRight size={13} />
            </Link>
          ))}
        </div>
      ) : (
        <div
          className={c.layout === "rail" ? "product-rail" : "product-grid"}
          tabIndex={c.layout === "rail" ? 0 : undefined}
          aria-label={c.layout === "rail" ? `${s.title} products` : undefined}
        >
          {products.map((p) => (
            <ProductCard key={p.id} product={p} preview={preview} />
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
