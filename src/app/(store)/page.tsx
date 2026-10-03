import Link from "next/link";
import { db } from "@/lib/db";
import { catalogue } from "@/domains/catalogue";
import { cleanBannerHtml } from "@/domains/home-sections";
import { sectionContent } from "@/lib/home-sections";
import { HomeSectionView } from "@/components/home-section-view";
import { Benefits } from "@/components/store";
export default async function Home() {
  const now = new Date();
  const [sections, categories, featured, offers, newest, brands] =
    await Promise.all([
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
      catalogue({ featured: "true", limit: 5 }),
      catalogue({ offers: "true", limit: 5 }),
      catalogue({ sort: "newest", limit: 5 }),
      db.brand.findMany({ take: 7, orderBy: { name: "asc" } }),
    ]);
  return (
    <>
      <div className="container home-content">
        {sections.map((s) => {
          const content = sectionContent(s.content);
          content.html = cleanBannerHtml(content.html);
          return (
            <HomeSectionView
              key={s.id}
              section={{ ...s, content }}
              categories={categories}
              products={
                (s.kind === "featured"
                  ? featured
                  : s.kind === "offers"
                    ? offers
                    : newest
                ).products
              }
            />
          );
        })}
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
