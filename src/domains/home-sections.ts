import sanitizeHtml from "sanitize-html";
import { z } from "zod";
import { db, type Tx } from "@/lib/db";
import { invariant } from "@/lib/errors";
import {
  defaultContent,
  sectionContent,
  sectionProductQuery,
  productSectionKinds,
  type HomeSectionData,
} from "@/lib/home-sections";
import { onlineProductWhere } from "@/lib/product-visibility";
import { requireScope, type Actor } from "./identity";
import { catalogue, includeProduct, publicProduct } from "./catalogue";
const internalPath = z
  .string()
  .regex(/^\/(?!\/)[a-zA-Z0-9/?=&_#%-]*$/, "Use a path within this store.")
  .max(300);
const card = z
  .object({
    title: z.string().max(150),
    eyebrow: z.string().max(100),
    buttonLabel: z.string().max(60),
    href: internalPath,
    mediaId: z.string().min(1).nullable(),
    alt: z.string().max(250),
  })
  .strict();
const heroSlide = z
  .object({
    title: z.string().trim().min(2).max(150),
    subtitle: z.string().max(350),
    eyebrow: z.string().max(100),
    buttonLabel: z.string().trim().min(2).max(60),
    href: internalPath,
    mediaId: z.string().min(1).nullable(),
    productId: z.string().min(1).nullable(),
    alt: z.string().max(250),
    tone: z.enum(["navy", "blue", "light"]),
  })
  .strict()
  .refine((slide) => Boolean(slide.mediaId || slide.productId), {
    message: "Choose a published product or upload a real product banner.",
  })
  .refine((slide) => !slide.mediaId || slide.alt.trim().length >= 3, {
    message: "Describe the uploaded banner image.",
    path: ["alt"],
  });
export const homeSectionInput = z
  .object({
    title: z.string().trim().min(2).max(150),
    subtitle: z.string().max(350),
    kind: z.enum([
      "hero",
      "cta",
      "html",
      "categories",
      "featured",
      "offers",
      "new",
      "collection",
    ]),
    href: internalPath,
    buttonLabel: z.string().trim().min(2).max(60).default("Explore collection"),
    bannerMediaId: z.string().min(1).nullable().optional(),
    position: z.number().int().min(0).max(10000),
    visible: z.boolean(),
    startsAt: z.coerce.date().nullable().optional(),
    endsAt: z.coerce.date().nullable().optional(),
    version: z.number().int().positive().optional(),
    content: z
      .object({
        heroSlides: z.array(heroSlide).max(6).default([]),
        autoplay: z.boolean().default(false),
        autoProductHero: z.boolean().default(true),
        eyebrow: z.string().max(100),
        footer: z.string().max(100),
        showSideCards: z.boolean(),
        sideCards: z.array(card).length(2),
        html: z.string().max(40000),
        imageAlt: z.string().max(250),
        tone: z.enum(["navy", "blue", "light"]).default("navy"),
        layout: z.enum(["grid", "rail"]).default("grid"),
        productLimit: z.number().int().min(1).max(12).default(5),
        categorySlug: z
          .string()
          .regex(/^[a-z0-9-]*$/)
          .max(100)
          .default(""),
        collectionSlug: z
          .string()
          .regex(/^[a-z0-9-]*$/)
          .max(100)
          .default(""),
      })
      .strict()
      .optional(),
  })
  .strict();
// HTML is merchant content, never executable application code. The same sanitizer runs on save, preview and display.
export function cleanBannerHtml(html: string) {
  return sanitizeHtml(html, {
    allowedTags: [
      "section",
      "div",
      "p",
      "h1",
      "h2",
      "h3",
      "h4",
      "span",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "del",
      "br",
      "ul",
      "ol",
      "li",
      "a",
      "img",
    ],
    allowedAttributes: {
      "*": ["style"],
      a: ["href"],
      img: ["src", "alt", "width", "height"],
    },
    allowedSchemes: [],
    allowProtocolRelative: false,
    allowedStyles: {
      "*": {
        color: [/^#[0-9a-f]{3,8}$/i],
        "background-color": [/^#[0-9a-f]{3,8}$/i],
        "text-align": [/^(left|center|right)$/],
        "font-weight": [/^(normal|bold|[1-9]00)$/],
        "font-size": [/^(?:[1-9]|[1-6][0-9]|7[0-2])px$/],
        "line-height": [/^[1-2](?:\.[0-9])?$/],
        padding: [/^\d{1,2}px(?: \d{1,2}px){0,3}$/],
        margin: [/^\d{1,2}px(?: \d{1,2}px){0,3}$/],
        "border-radius": [/^\d{1,2}px$/],
        display: [/^(block|inline|inline-block|flex|grid)$/],
        "flex-wrap": [/^wrap$/],
        "align-items": [/^(center|start|end)$/],
        "justify-content": [/^(center|space-between|start|end)$/],
        gap: [/^\d{1,2}px$/],
        width: [/^(100%|auto)$/],
        "max-width": [/^(100%|\d{1,4}px)$/],
        height: [/^auto$/],
      },
    },
    transformTags: {
      a: (_, attrs) => ({
        tagName: "a",
        attribs: {
          ...attrs,
          href: /^\/(?!\/)[a-zA-Z0-9/?=&_#%-]*$/.test(attrs.href ?? "")
            ? attrs.href
            : "/categories",
        },
      }),
      img: (_, attrs) => ({
        tagName: "img",
        attribs: {
          ...attrs,
          src: /^\/(?:media\/[a-zA-Z0-9_-]+|(?:brand|illustrations)\/[a-zA-Z0-9_.-]+)$/.test(
            attrs.src ?? "",
          )
            ? attrs.src
            : "",
        },
      }),
    },
  });
}
export async function prepareHomeSection(raw: unknown, conn: Tx = db) {
  const d = homeSectionInput.parse(raw);
  invariant(
    !d.startsAt || !d.endsAt || d.endsAt > d.startsAt,
    422,
    "End date must be after start date.",
  );
  const content = sectionContent(d.content ?? defaultContent);
  content.html = cleanBannerHtml(content.html);
  if (d.kind === "hero") {
    const requestedProducts = new Set(
      content.heroSlides.flatMap((slide) =>
        slide.productId ? [slide.productId] : [],
      ),
    );
    if (requestedProducts.size) {
      const products = await resolveHeroProducts({ ...d, content }, conn);
      invariant(
        products.length === requestedProducts.size,
        422,
        "Choose published Online Store products with an active variant and a published product photo. Samples and private products cannot appear in banners.",
      );
    }
  }
  const ids = [
    ...new Set([
      ...(d.bannerMediaId ? [d.bannerMediaId] : []),
      ...(d.kind === "hero"
        ? content.heroSlides.flatMap((slide) =>
            slide.mediaId ? [slide.mediaId] : [],
          )
        : []),
      ...(d.kind === "hero" && content.showSideCards
        ? content.sideCards.flatMap((c) => (c.mediaId ? [c.mediaId] : []))
        : []),
      ...(d.kind === "html"
        ? [...content.html.matchAll(/src="\/media\/([a-zA-Z0-9_-]+)"/g)].map(
            (m) => m[1],
          )
        : []),
    ]),
  ];
  invariant(
    ids.length <= 12,
    422,
    "Use at most 12 uploaded images in one section.",
  );
  const count = await conn.media.count({
    where: { id: { in: ids }, productId: null },
  });
  invariant(
    count === ids.length,
    422,
    "Use images uploaded in the homepage editor.",
  );
  return { ...d, content, mediaIds: ids };
}
// Resolve again on every public render and staff preview: a saved product
// binding never grants access after its product, category or media is hidden.
export async function resolveHeroProducts(
  section: Pick<HomeSectionData, "kind" | "content"> & {
    bannerMediaId?: string | null;
  },
  conn: Tx = db,
) {
  if (section.kind !== "hero") return [];
  const ids = [
    ...new Set(
      section.content.heroSlides.flatMap((slide) =>
        slide.productId ? [slide.productId] : [],
      ),
    ),
  ];
  const automatic =
    !section.content.heroSlides.length &&
    !section.bannerMediaId &&
    section.content.autoProductHero;
  if (!ids.length && !automatic) return [];
  const records = await conn.product.findMany({
    where: {
      ...onlineProductWhere,
      demo: false,
      ...(ids.length ? { id: { in: ids } } : {}),
      OR: [
        { quoteOnly: true, skus: { some: { active: true } } },
        {
          quoteOnly: false,
          skus: { some: { active: true, price: { not: null } } },
        },
      ],
      media: {
        some: { public: true, NOT: { key: { startsWith: "illustrations/" } } },
      },
    },
    include: includeProduct,
    orderBy: [{ featured: "desc" }, { updatedAt: "desc" }, { id: "asc" }],
    take: 6,
  });
  return records
    .map((record) => {
      const product = publicProduct(record);
      return {
        ...product,
        media: product.media.filter((media) => media.url.startsWith("/media/")),
      };
    })
    .filter((product) => product.skus.length > 0 && product.media.length > 0);
}
export async function previewHomeSection(actor: Actor, raw: unknown) {
  requireScope(actor, "content:write");
  const section = await prepareHomeSection(raw);
  const [products, categories, heroProducts] = await Promise.all([
    productSectionKinds.includes(section.kind)
      ? catalogue(sectionProductQuery(section))
      : null,
    section.kind === "categories"
      ? db.category.findMany({
          where: { visible: true, parentId: null },
          orderBy: { position: "asc" },
        })
      : [],
    resolveHeroProducts(section),
  ]);
  return {
    section,
    products: products?.products ?? [],
    categories,
    heroProducts,
  };
}
