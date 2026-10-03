export const sectionTypes = {
  hero: "Hero & side banners",
  cta: "Call to action banner",
  html: "Custom HTML banner",
  categories: "Departments",
  featured: "Featured products",
  offers: "Discounted products",
  new: "New arrivals",
} as const;
export type BannerCard = {
  title: string;
  eyebrow: string;
  buttonLabel: string;
  href: string;
  mediaId: string | null;
  alt: string;
};
export type SectionContent = {
  eyebrow: string;
  footer: string;
  showSideCards: boolean;
  sideCards: BannerCard[];
  html: string;
  imageAlt: string;
};
export const defaultContent: SectionContent = {
  eyebrow: "THE NEXT CHAPTER IN TECH",
  footer: "WORK. PLAY. CREATE.",
  showSideCards: true,
  imageAlt: "Unbranded concept gaming laptop with an illuminated blue display",
  html: "",
  sideCards: [
    {
      eyebrow: "MAKE ROOM FOR MORE",
      title: "Your workspace. Reimagined.",
      buttonLabel: "Explore workspaces",
      href: "/categories",
      mediaId: null,
      alt: "Illustrative desktop monitor",
    },
    {
      eyebrow: "SMALL DETAILS. BIG DIFFERENCE.",
      title: "Meet your new daily essentials.",
      buttonLabel: "Explore accessories",
      href: "/categories",
      mediaId: null,
      alt: "Illustrative over-ear headphones",
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
  };
}
