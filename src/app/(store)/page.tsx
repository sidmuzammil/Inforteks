import Link from "next/link";
import { ArrowRight, ArrowUpRight, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { catalogue } from "@/domains/catalogue";
import { ProductCard, SectionHeading, Benefits } from "@/components/store";
export default async function Home() {
  const now = new Date();
  const [sections, categories, featured, newest, brands] = await Promise.all([
    db.homeSection.findMany({
      include: { bannerMedia: { select: { id: true, alt: true } } },
      where: {
        visible: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        ],
      },
      orderBy: { position: "asc" },
    }),
    db.category.findMany({
      where: { visible: true, parentId: null },
      orderBy: { position: "asc" },
    }),
    catalogue({ offers: "true", limit: 5 }),
    catalogue({ sort: "newest", limit: 5 }),
    db.brand.findMany({ take: 7, orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <div className="container home-content">
        {sections.map((s) =>
          s.kind === "hero" ? (
            <section key={s.id} className="hero-grid">
              <div className="hero-main">
                <img
                  className="hero-image"
                  src={
                    s.bannerMedia
                      ? `/media/${s.bannerMedia.id}`
                      : "/brand/hero.png"
                  }
                  alt={
                    s.bannerMedia?.alt ??
                    "Unbranded concept gaming laptop with an illuminated blue display"
                  }
                  fetchPriority="high"
                />
                <div className="hero-overlay" />
                <div className="hero-copy">
                  <span className="hero-tag">
                    <span /> THE NEXT CHAPTER IN TECH
                  </span>
                  <h1>{s.title}</h1>
                  <p>{s.subtitle}</p>
                  <Link href={s.href} className="button white">
                    {s.buttonLabel}
                    <ArrowUpRight size={17} />
                  </Link>
                  <div className="hero-foot">
                    <span>WORK.</span>
                    <span>PLAY.</span>
                    <span>CREATE.</span>
                  </div>
                </div>
                <div className="hero-pagination">
                  <b>01</b>
                  <span />
                  <span />
                  <small>Inforteks edit</small>
                </div>
              </div>
              <div className="hero-side">
                <Link
                  href="/collection/work-smarter"
                  className="mini-hero workspace-hero"
                >
                  <span className="eyebrow">MAKE ROOM FOR MORE</span>
                  <h2>
                    Your workspace.
                    <br />
                    Reimagined.
                  </h2>
                  <span className="text-link">
                    Shop monitors <ArrowRight size={15} />
                  </span>
                  <img
                    src="/illustrations/monitor.svg"
                    alt="Illustrative desktop monitor"
                  />
                </Link>
                <Link
                  href="/category/peripherals"
                  className="mini-hero accessories-hero"
                >
                  <span className="eyebrow">
                    SMALL DETAILS. BIG DIFFERENCE.
                  </span>
                  <h2>
                    Meet your new
                    <br />
                    daily essentials.
                  </h2>
                  <span className="text-link">
                    Explore accessories <ArrowRight size={15} />
                  </span>
                  <img
                    src="/illustrations/headphones.svg"
                    alt="Illustrative over-ear headphones"
                  />
                </Link>
              </div>
            </section>
          ) : s.kind === "categories" ? (
            <section key={s.id} className="section category-section">
              <SectionHeading
                title={s.title}
                subtitle={s.subtitle}
                href={s.href}
                label="All departments"
              />
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
            </section>
          ) : s.kind === "featured" ? (
            <section key={s.id} className="section">
              <SectionHeading
                title={s.title}
                subtitle={s.subtitle}
                href={s.href}
                label="Shop all offers"
              />
              <div className="product-grid">
                {featured.products.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            </section>
          ) : (
            <section key={s.id} className="section">
              <SectionHeading
                title={s.title}
                subtitle={s.subtitle}
                href={s.href}
              />
              <div className="product-grid">
                {newest.products.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            </section>
          ),
        )}
        <section className="editorial-banner">
          <div>
            <span className="eyebrow">BUILT AROUND YOUR AMBITION</span>
            <h2>
              Better together.
              <br />
              Brilliant in every detail.
            </h2>
            <p>Put together a workspace that works for you.</p>
            <Link className="button primary" href="/collection/work-smarter">
              Find your setup <ArrowUpRight size={16} />
            </Link>
          </div>
          <img
            src="/illustrations/desktop.svg"
            alt="Illustrative workstation tower"
          />
          <span className="editorial-word">CREATE.</span>
        </section>
        <section className="brands-strip">
          <p className="eyebrow">EXPLORE THE BRANDS YOU KNOW</p>
          <div>
            {brands.map((b) => (
              <Link key={b.id} href={`/brand/${b.slug}`}>
                {b.name}
              </Link>
            ))}
          </div>
        </section>
      </div>
      <Benefits />
    </>
  );
}
