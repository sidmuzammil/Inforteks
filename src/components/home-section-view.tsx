import Link from "next/link";
import { ArrowRight, ArrowUpRight, ChevronRight } from "lucide-react";
import type { HomeSectionData } from "@/lib/home-sections";
import type { PublicProduct } from "@/domains/catalogue";
import { ProductCard, SectionHeading } from "./catalogue-cards";
import { DepartmentIcon } from "./department-icon";
import {
  ProductHeroCarousel,
  type ProductHeroSlide,
} from "./product-hero-carousel";
import { money } from "@/lib/utils";
export type SectionPreviewData = {
  section: HomeSectionData;
  products: PublicProduct[];
  heroProducts?: PublicProduct[];
  categories: { id: string; name: string; slug: string; icon: string }[];
};

function heroProductFacts(product: PublicProduct) {
  const sku = product.skus[0];
  return {
    category: product.category.name,
    price: product.quoteOnly
      ? "Request a quote"
      : sku?.price != null
        ? `${product.skus.length > 1 ? "From " : ""}${money(sku.price)}`
        : undefined,
    priceNote: product.quoteOnly ? "Availability on request" : undefined,
  };
}

function productSlides(
  section: HomeSectionData,
  products: PublicProduct[],
): ProductHeroSlide[] {
  const realProducts = products.filter(
    (product) =>
      !product.demo &&
      product.media.some((media) => media.url.startsWith("/media/")),
  );
  const configured = section.content.heroSlides;
  if (configured.length)
    return configured.flatMap((slide, index) => {
      const product = slide.productId
        ? realProducts.find((item) => item.id === slide.productId)
        : undefined;
      if (slide.productId && !product) return [];
      const media = product?.media.find((item) =>
        item.url.startsWith("/media/"),
      );
      const image = slide.mediaId ? `/media/${slide.mediaId}` : media?.url;
      if (!image) return [];
      return [
        {
          id: `configured-${index}`,
          title: slide.title || product?.name || section.title,
          subtitle: slide.subtitle,
          eyebrow: slide.eyebrow || product?.brand.name || "INFORTEKS",
          buttonLabel: slide.buttonLabel || "Explore product",
          href:
            slide.href || (product ? `/product/${product.slug}` : section.href),
          image,
          alt: slide.alt || media?.alt || product?.name || slide.title,
          tone: slide.tone,
          ...(product ? heroProductFacts(product) : {}),
        },
      ];
    });
  if (!section.content.autoProductHero || section.bannerMediaId) return [];
  return realProducts.slice(0, 6).map((product, index) => {
    const media = product.media.find((item) => item.url.startsWith("/media/"))!;
    return {
      id: product.id,
      title: product.name,
      subtitle: "",
      eyebrow: product.brand.name,
      buttonLabel: "Explore product",
      href: `/product/${product.slug}${product.skus[0] ? `?sku=${product.skus[0].id}` : ""}`,
      image: media.url,
      alt: media.alt || product.name,
      tone: index % 3 === 1 ? "blue" : "light",
      highlights: product.highlights.slice(0, 2),
      ...heroProductFacts(product),
    };
  });
}

export function HomeSectionView({
  section: s,
  products = [],
  heroProducts = [],
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
  if (s.kind === "hero") {
    const slides = productSlides(s, heroProducts);
    const sideCards = c.showSideCards
      ? c.sideCards.filter((card) => card.mediaId)
      : [];
    const legacyBanner = !c.heroSlides.length && s.bannerMediaId;
    return (
      <div
        className={`hero-composition marketplace-hero ${sideCards.length ? "has-side-banners" : ""}`}
      >
        {slides.length ? (
          <ProductHeroCarousel
            slides={slides}
            autoplay={c.autoplay}
            preview={preview}
          />
        ) : legacyBanner ? (
          <section
            className={`hero-main hero-legacy tone-${c.tone}`}
            aria-label={s.title}
          >
            <img
              className="hero-image"
              src={`/media/${s.bannerMediaId}`}
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
          </section>
        ) : (
          <section className="store-discovery" aria-label="Discover Inforteks">
            <div>
              <span className="eyebrow">EXPLORE INFORTEKS</span>
              <h1>Find your next essential.</h1>
              <p>
                Explore our departments or search for the product you have in
                mind.
              </p>
            </div>
            <Link href="/categories" className="button primary">
              Browse departments <ArrowUpRight size={18} />
            </Link>
          </section>
        )}
        {sideCards.length > 0 && (
          <div className="hero-side real-side-banners">
            {sideCards.map((card, i) => (
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
                <img src={`/media/${card.mediaId}`} alt={card.alt} />
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }
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
        ) : null}
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
      className={`section marketplace-shelf shelf-${s.kind} ${s.kind === "categories" ? "category-section" : ""}`}
    >
      <SectionHeading
        title={s.title}
        subtitle={s.subtitle}
        href={s.href}
        label={s.buttonLabel}
      />
      {s.kind === "categories" ? (
        <div className="category-shortcuts marketplace-departments">
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
          className={
            c.layout === "rail"
              ? "product-rail marketplace-product-rail"
              : "product-grid marketplace-product-grid"
          }
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
