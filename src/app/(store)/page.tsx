import Link from "next/link";
import { db } from "@/lib/db";
import { catalogue } from "@/domains/catalogue";
import { cleanBannerHtml } from "@/domains/home-sections";
import {
  sectionContent,
  sectionProductQuery,
  productSectionKinds,
} from "@/lib/home-sections";
import { HomeSectionView } from "@/components/home-section-view";
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
    db.brand.findMany({ take: 7, orderBy: { name: "asc" } }),
  ]);
  const prepared = await Promise.all(
    sections.map(async (section) => {
      const content = sectionContent(section.content);
      content.html = cleanBannerHtml(content.html);
      const products = productSectionKinds.includes(section.kind)
        ? (await catalogue(sectionProductQuery({ ...section, content })))
            .products
        : [];
      return { section: { ...section, content }, products };
    }),
  );
  return (
    <>
      <div className="container home-content">
        <div className="store-intro">
          <span>THE INFORTEKS STORE</span>
          <p>Find your next everyday upgrade.</p>
          <Link href="/categories">Explore all technology →</Link>
        </div>
        {prepared.map(({ section, products }) => (
          <HomeSectionView
            key={section.id}
            section={section}
            categories={categories}
            products={products}
          />
        ))}
        {brands.length > 0 && (
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
        )}
      </div>
      <Benefits />
    </>
  );
}
