import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "@/lib/db";
import { invariant } from "@/lib/errors";
import { audit, requireScope, type Actor } from "./identity";
import { slugify } from "@/lib/utils";

const spec = z.record(
  z.string().regex(/^[a-zA-Z0-9_ ]{1,40}$/),
  z.union([z.string().max(200), z.number().finite()]),
);
export const skuInput = z
  .object({
    code: z.string().min(2).max(80),
    mpn: z.string().max(100).optional(),
    options: spec.default({}),
    specs: spec.default({}),
    price: z.number().int().min(0).max(100_000_000).nullable().default(null),
    compareAt: z.number().int().min(0).nullable().default(null),
    warranty: z.string().max(200).nullable().default(null),
    condition: z.enum(["New", "Refurbished", "Used"]).default("New"),
  })
  .strict()
  .refine(
    (s) => s.compareAt === null || (s.price !== null && s.compareAt > s.price),
    {
      message: "Previous price must exceed the current price.",
      path: ["compareAt"],
    },
  );
export const productInput = z
  .object({
    name: z.string().min(3).max(180),
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(180)
      .optional(),
    description: z.string().max(20000).default(""),
    highlights: z.array(z.string().max(250)).max(12).default([]),
    brandId: z.string().min(1, "Choose or create a brand."),
    categoryId: z.string().min(1, "Choose or create a category."),
    featured: z.boolean().default(false),
    seoTitle: z.string().max(180).optional(),
    seoDescription: z.string().max(300).optional(),
    model: z.string().max(100).optional(),
    specs: spec.default({}),
    skus: z.array(skuInput).min(1).max(50),
  })
  .strict();
export type ProductInput = z.infer<typeof productInput>;
export const includeProduct = {
  brand: true,
  category: true,
  skus: { orderBy: { price: "asc" as const } },
  media: {
    orderBy: [
      { position: "asc" as const },
      { createdAt: "asc" as const },
      { id: "asc" as const },
    ],
  },
  reviews: {
    where: { status: "APPROVED", verified: true },
    select: { id: true, rating: true, body: true, createdAt: true },
  },
};
export type FullProduct = Prisma.ProductGetPayload<{
  include: typeof includeProduct;
}>;
export function publicProduct(p: FullProduct, preview = false) {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    highlights: p.highlights,
    model: p.model,
    specs: p.specs,
    brand: p.brand,
    category: p.category,
    demo: p.demo,
    media: p.media
      .filter((m) => preview || m.public)
      .map((m) => ({
        id: m.id,
        alt: m.alt,
        url: m.key.startsWith("illustrations/")
          ? `/${m.key}`
          : `/media/${m.id}`,
      })),
    reviews: p.reviews,
    skus: p.skus
      .filter((s) => s.active && s.price !== null)
      .map((s) => ({
        id: s.id,
        code: s.code,
        mpn: s.mpn,
        options: s.options,
        specs: s.specs,
        price: s.price!,
        compareAt: s.compareAt,
        condition: s.condition,
        warranty: s.warranty,
        available: Math.max(0, s.onHand - s.reserved),
      })),
  };
}
export type PublicProduct = ReturnType<typeof publicProduct>;
export async function getProduct(slug: string, preview?: Actor) {
  if (preview) requireScope(preview, "catalog:read");
  const p = await db.product.findFirst({
    where: { slug, ...(preview ? {} : { status: "PUBLISHED" }) },
    include: includeProduct,
  });
  return p ? publicProduct(p, Boolean(preview)) : null;
}
export const searchInput = z.object({
  q: z.string().max(100).default(""),
  category: z.string().max(100).default(""),
  brand: z.string().max(100).default(""),
  collection: z.string().max(100).default(""),
  min: z.coerce.number().min(0).max(1000000).default(0),
  max: z.coerce.number().min(0).max(1000000).default(1000000),
  ram: z.string().max(30).default(""),
  storage: z.string().max(30).default(""),
  available: z.string().default(""),
  sort: z
    .enum(["relevance", "price-asc", "price-desc", "newest"])
    .default("relevance"),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(20),
  offers: z.string().default(""),
  featured: z.string().default(""),
});
export async function catalogue(input: Record<string, unknown> = {}) {
  const f = searchInput.parse(input);
  const conditions: Prisma.Sql[] = [
    Prisma.sql`p.status = 'PUBLISHED'`,
    Prisma.sql`s.active = true`,
    Prisma.sql`s.price IS NOT NULL`,
    Prisma.sql`c.visible = true`,
    Prisma.sql`s.price BETWEEN ${Math.round(f.min * 100)} AND ${Math.round(f.max * 100)}`,
  ];
  if (f.q) {
    const term = `%${f.q.replace(/[\\%_]/g, "\\$&")}%`;
    conditions.push(
      Prisma.sql`(p.name ILIKE ${term} OR p.model ILIKE ${term} OR s.code ILIKE ${term} OR s.mpn ILIKE ${term} OR b.name ILIKE ${term} OR s.specs::text ILIKE ${term})`,
    );
  }
  if (f.category)
    conditions.push(
      Prisma.sql`(c.slug = ${f.category} OR c."parentId" = (SELECT id FROM "Category" WHERE slug = ${f.category}))`,
    );
  if (f.brand) conditions.push(Prisma.sql`b.slug = ${f.brand}`);
  if (f.ram) conditions.push(Prisma.sql`s.specs->>'ram' = ${f.ram}`);
  if (f.storage)
    conditions.push(Prisma.sql`s.specs->>'storage' = ${f.storage}`);
  if (f.available === "true")
    conditions.push(Prisma.sql`s."onHand" > s.reserved`);
  if (f.featured === "true") conditions.push(Prisma.sql`p.featured = true`);
  if (f.offers === "true") conditions.push(Prisma.sql`s."compareAt" > s.price`);
  if (f.collection)
    conditions.push(
      Prisma.sql`EXISTS (SELECT 1 FROM "CollectionProduct" cp JOIN "Collection" co ON co.id = cp."collectionId" WHERE cp."productId" = p.id AND co.slug = ${f.collection})`,
    );
  const from = Prisma.sql`FROM "Product" p JOIN "Sku" s ON s."productId" = p.id JOIN "Brand" b ON b.id = p."brandId" JOIN "Category" c ON c.id = p."categoryId" WHERE ${Prisma.join(conditions, " AND ")}`;
  const sort =
    f.sort === "price-asc"
      ? Prisma.sql`price ASC, id`
      : f.sort === "price-desc"
        ? Prisma.sql`price DESC, id`
        : f.sort === "newest"
          ? Prisma.sql`created DESC, id`
          : Prisma.sql`exact DESC, featured DESC, id`;
  const [ids, count, brandFacets, specFacets] = await Promise.all([
    db.$queryRaw<{ id: string; matched: string[] }[]>(
      Prisma.sql`SELECT p.id, array_agg(s.id ORDER BY s.price,s.id) AS matched, MIN(s.price) AS price, MAX(p."createdAt") AS created, BOOL_OR(p.featured) AS featured, BOOL_OR(lower(s.code) = lower(${f.q}) OR lower(COALESCE(p.model,'')) = lower(${f.q})) AS exact ${from} GROUP BY p.id ORDER BY ${sort} LIMIT ${f.limit} OFFSET ${(f.page - 1) * f.limit}`,
    ),
    db.$queryRaw<{ count: bigint }[]>(
      Prisma.sql`SELECT count(DISTINCT p.id) AS count ${from}`,
    ),
    db.$queryRaw<{ name: string; slug: string; count: bigint }[]>(
      Prisma.sql`SELECT b.name,b.slug,count(DISTINCT p.id) AS count ${from} GROUP BY b.id ORDER BY b.name`,
    ),
    db.$queryRaw<{ ram: string | null; storage: string | null }[]>(
      Prisma.sql`SELECT DISTINCT s.specs->>'ram' AS ram,s.specs->>'storage' AS storage ${from} LIMIT 100`,
    ),
  ]);
  const records = await db.product.findMany({
    where: { id: { in: ids.map((r) => r.id) } },
    include: includeProduct,
  });
  const products = ids.map(({ id, matched }) => {
    const p = publicProduct(records.find((p) => p.id === id)!);
    p.skus.sort(
      (a, b) => Number(matched.includes(b.id)) - Number(matched.includes(a.id)),
    );
    return p;
  });
  return {
    products,
    total: Number(count[0].count),
    page: f.page,
    pages: Math.ceil(Number(count[0].count) / f.limit),
    facets: {
      brands: brandFacets.map((b) => ({ ...b, count: Number(b.count) })),
      ram: [...new Set(specFacets.map((s) => s.ram).filter(Boolean))],
      storage: [...new Set(specFacets.map((s) => s.storage).filter(Boolean))],
    },
  };
}
export async function createProduct(actor: Actor, raw: unknown, tx?: Tx) {
  requireScope(actor, "catalog:write");
  const data = productInput.parse(raw);
  if (data.skus.some((s) => s.price !== null || s.compareAt !== null))
    requireScope(actor, "pricing:write");
  invariant(
    new Set(data.skus.map((s) => s.code)).size === data.skus.length,
    422,
    "SKU codes must be unique.",
  );
  const create = async (conn: Tx) => {
    invariant(
      await conn.brand.count({ where: { id: data.brandId } }),
      422,
      "Choose an existing brand or create one first.",
    );
    invariant(
      await conn.category.count({ where: { id: data.categoryId } }),
      422,
      "Choose an existing category or create one first.",
    );
    const p = await conn.product.create({
      data: {
        ...data,
        slug: data.slug ?? slugify(data.name),
        skus: { create: data.skus },
      },
    });
    await audit(conn, actor, "product.create", p.id, undefined, {
      name: p.name,
      status: p.status,
    });
    return p;
  };
  return tx ? create(tx) : db.$transaction(create);
}
export async function validatePublication(tx: Tx, id: string) {
  const p = await tx.product.findUnique({
    where: { id },
    include: {
      skus: true,
      media: true,
      category: { include: { attributes: true } },
    },
  });
  invariant(p, 404, "Product not found.");
  invariant(
    p.skus.some((s) => s.active) &&
      p.skus
        .filter((s) => s.active)
        .every((s) => s.price !== null && s.price >= 0),
    422,
    "Every active SKU needs an authorized price.",
  );
  invariant(
    p.media.length > 0,
    422,
    "Add at least one product image before publishing.",
  );
  for (const a of p.category.attributes.filter((a) => a.required)) {
    for (const s of p.skus.filter((s) => s.active))
      invariant(
        (a.scope === "product" ? p.specs : (s.specs as object)) &&
          Object.hasOwn(
            (a.scope === "product" ? p.specs : s.specs) as object,
            a.key,
          ),
        422,
        `Missing required specification: ${a.label}.`,
      );
  }
  for (const a of p.category.attributes)
    for (const sku of p.skus.filter((s) => s.active)) {
      const values = (a.scope === "product" ? p.specs : sku.specs) as Record<
        string,
        unknown
      >;
      if (values[a.key] !== undefined) {
        invariant(
          a.type !== "number" || typeof values[a.key] === "number",
          422,
          `${a.label} must be numeric${a.unit ? ` (${a.unit})` : ""}.`,
        );
        invariant(
          !a.allowed.length || a.allowed.includes(String(values[a.key])),
          422,
          `${a.label} has an unsupported value.`,
        );
      }
    }
  return p;
}
