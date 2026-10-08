export const sectionTypes = {
  hero: "Hero carousel & side banners",
  cta: "Call to action banner",
  html: "Custom HTML banner",
  categories: "Departments",
  featured: "Featured products",
  offers: "Discounted products",
  new: "New arrivals",
  collection: "Curated shopping section",
} as const;
export type BannerCard = {
  title: string;
  eyebrow: string;
  buttonLabel: string;
  href: string;
  mediaId: string | null;
  alt: string;
};
export type HeroSlide = {
  title: string;
  subtitle: string;
  eyebrow: string;
  buttonLabel: string;
  href: string;
  mediaId: string | null;
  productId: string | null;
  alt: string;
  tone: "navy" | "blue" | "light";
};
export type SectionContent = {
  heroSlides: HeroSlide[];
  autoplay: boolean;
  autoProductHero: boolean;
  eyebrow: string;
  footer: string;
  showSideCards: boolean;
  sideCards: BannerCard[];
  html: string;
  imageAlt: string;
  tone: "navy" | "blue" | "light";
  layout: "grid" | "rail";
  productLimit: number;
  categorySlug: string;
  collectionSlug: string;
};
export const defaultContent: SectionContent = {
  heroSlides: [],
  autoplay: false,
  autoProductHero: true,
  tone: "navy",
  layout: "grid",
  productLimit: 5,
  categorySlug: "",
  collectionSlug: "",
  eyebrow: "THE NEXT CHAPTER IN TECH",
  footer: "WORK. PLAY. CREATE.",
  showSideCards: true,
  imageAlt: "",
  html: "",
  sideCards: [
    {
      eyebrow: "MAKE ROOM FOR MORE",
      title: "Your workspace. Reimagined.",
      buttonLabel: "Explore workspaces",
      href: "/categories",
      mediaId: null,
      alt: "",
    },
    {
      eyebrow: "SMALL DETAILS. BIG DIFFERENCE.",
      title: "Meet your new daily essentials.",
      buttonLabel: "Explore accessories",
      href: "/categories",
      mediaId: null,
      alt: "",
    },
  ],
};
export type HomeSectionData = {
  id?: string;
  title: string;
  subtitle: string;
  kind: string;
  href: string;
  buttonLabel: string;
  bannerMediaId: string | null;
  position: number;
  visible: boolean;
  content: SectionContent;
  version?: number;
};
export function sectionContent(raw: unknown): SectionContent {
  const data = (
    raw && typeof raw === "object" ? raw : {}
  ) as Partial<SectionContent>;
  return {
    ...defaultContent,
    ...data,
    sideCards: data.sideCards ?? defaultContent.sideCards,
    heroSlides: data.heroSlides ?? defaultContent.heroSlides,
  };
}

// One selection contract for public sections and staff previews. Catalogue
// remains responsible for publication, store visibility and public DTOs.
export function sectionProductQuery(section: {
  kind: string;
  content: SectionContent;
}) {
  return {
    ...(section.kind === "featured"
      ? { featured: "true" }
      : section.kind === "offers"
        ? { offers: "true" }
        : { sort: "newest" }),
    category: section.content.categorySlug,
    collection: section.content.collectionSlug,
    limit: section.content.productLimit,
  };
}
export const productSectionKinds = ["featured", "offers", "new", "collection"];
