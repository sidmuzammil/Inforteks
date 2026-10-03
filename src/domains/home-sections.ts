import sanitizeHtml from "sanitize-html";
import { z } from "zod";
import { db, type Tx } from "@/lib/db";
import { invariant } from "@/lib/errors";
import { defaultContent, sectionContent } from "@/lib/home-sections";
import { requireScope, type Actor } from "./identity";
import { catalogue } from "./catalogue";
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
        eyebrow: z.string().max(100),
        footer: z.string().max(100),
        showSideCards: z.boolean(),
        sideCards: z.array(card).length(2),
        html: z.string().max(40000),
        imageAlt: z.string().max(250),
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
  const ids = [
    ...new Set([
      ...(d.bannerMediaId ? [d.bannerMediaId] : []),
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
export async function previewHomeSection(actor: Actor, raw: unknown) {
  requireScope(actor, "content:write");
  const section = await prepareHomeSection(raw);
  const [products, categories] = await Promise.all([
    ["featured", "offers", "new"].includes(section.kind)
      ? catalogue({
          ...(section.kind === "featured"
            ? { featured: "true" }
            : section.kind === "offers"
              ? { offers: "true" }
              : { sort: "newest" }),
          limit: 5,
        })
      : null,
    section.kind === "categories"
      ? db.category.findMany({
          where: { visible: true, parentId: null },
          orderBy: { position: "asc" },
        })
      : [],
  ]);
  return { section, products: products?.products ?? [], categories };
}
