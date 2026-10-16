import { Fragment } from "react";
import Link from "next/link";
import { db } from "@/lib/db";
import { catalogue } from "@/domains/catalogue";
import { cleanBannerHtml, resolveHeroProducts } from "@/domains/home-sections";
import {
  defaultContent,
  sectionContent,
  sectionProductQuery,
  productSectionKinds,
} from "@/lib/home-sections";
import { HomeSectionView } from "@/components/home-section-view";
import { DepartmentIcon } from "@/components/department-icon";
import { Benefits } from "@/components/store";
export default async function Home() {
  const now = new Date();
  const [sections, categories, brands] = await Promise.all([
    db.homeSection.findMany({
      where: {
        visible: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        ],
      },
      orderBy: [{ position: "asc" }, { id: "asc" }],
    }),
    db.category.findMany({
      where: { visible: true, parentId: null },
      orderBy: { position: "asc" },
    }),
    db.brand.findMany({ take: 12, orderBy: { name: "asc" } }),
  ]);
  const prepared = await Promise.all(
    sections.map(async (section) => {
      const content = sectionContent(section.content);
      content.html = cleanBannerHtml(content.html);
      const preparedSection = { ...section, content };
      const [selection, heroProducts] = await Promise.all([
        productSectionKinds.includes(section.kind)
          ? catalogue(sectionProductQuery(preparedSection))
          : null,
        resolveHeroProducts(preparedSection),
      ]);
      return {
        section: preparedSection,
        products: selection?.products ?? [],
        heroProducts,
      };
    }),
  );
  // A published product need not be featured or discounted to be discoverable.
  // Existing curated shelves retain their settings; an otherwise empty homepage
  // gets the newest eligible catalogue products through the same public query.
  const catalogueShelf = prepared.some(({ products }) => products.length)
    ? null
    : await catalogue({ sort: "newest", limit: 12 });
  // Like a department store floor, every top-level department with published
  // products gets its own shelf unless an existing section already curates it.
  const curated = new Set(
    prepared.map(({ section }) => section.content.categorySlug).filter(Boolean),
  );
  const departmentShelves = (
    await Promise.all(
      categories
        .filter((category) => !curated.has(category.slug))
        .slice(0, 10)
        .map(async (category) => ({
          category,
          selection: await catalogue({
            category: category.slug,
            sort: "newest",
            limit: 12,
          }),
        })),
    )
  ).filter(({ selection }) => selection.products.length > 0);
  const heroIndex = prepared.findIndex(
    ({ section }) => section.kind === "hero",
  );
  const showCategoryShortcuts =
    categories.length > 0 &&
    !prepared.some(({ section }) => section.kind === "categories");
  return (
    <>
      <div className="container home-content marketplace-home">
        {showCategoryShortcuts && (
          <nav
            className="marketplace-quick-categories"
            aria-label="Shop by department"
          >
            {categories.map((category) => (
              <Link key={category.id} href={`/category/${category.slug}`}>
                <DepartmentIcon
                  name={`${category.slug} ${category.name}`}
                  size={22}
                />
                <span>{category.name}</span>
              </Link>
            ))}
            <Link href="/categories" className="all-departments-link">
              All departments
            </Link>
          </nav>
        )}
        {heroIndex < 0 && <Benefits strip />}
        {prepared.map(({ section, products, heroProducts }, index) => (
          <Fragment key={section.id}>
            <HomeSectionView
              section={section}
              categories={categories}
              products={products}
              heroProducts={heroProducts}
              front={index === heroIndex}
            />
            {index === heroIndex && <Benefits strip />}
          </Fragment>
        ))}
        {catalogueShelf &&
          !departmentShelves.length &&
          catalogueShelf.products.length > 0 && (
            <HomeSectionView
              section={{
                kind: "collection",
                title: "Discover our products",
                subtitle: "Browse the latest additions to Inforteks",
                href: "/search",
                buttonLabel: `View all ${catalogueShelf.total} products`,
                bannerMediaId: null,
                position: 0,
                visible: true,
                content: { ...defaultContent, productLimit: 12 },
              }}
              products={catalogueShelf.products}
              categories={[]}
            />
          )}
        {departmentShelves.map(({ category, selection }) => (
          <HomeSectionView
            key={category.id}
            section={{
              kind: "collection",
              title: category.name,
              subtitle: `${selection.total} ${selection.total === 1 ? "product" : "products"}`,
              href: `/category/${category.slug}`,
              buttonLabel: "View all",
              bannerMediaId: null,
              position: 0,
              visible: true,
              content: { ...defaultContent, layout: "rail", productLimit: 12 },
            }}
            products={selection.products}
            categories={[]}
          />
        ))}
        {brands.length > 0 && (
          <section className="brands-strip marketplace-brands">
            <h2>Shop by brand</h2>
            <div>
              {brands.map((b) => (
                <Link key={b.id} href={`/brand/${b.slug}`}>
                  {b.name}
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
