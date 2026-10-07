import { onlineProductWhere } from "@/lib/product-visibility";
import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const url =
    process.env.APP_URL ??
    process.env.BETTER_AUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000";
  const products = await db.product.findMany({
    where: { ...onlineProductWhere, demo: false },
    select: { slug: true, updatedAt: true },
    take: 50000,
  });
  const categories = await db.category.findMany({ where: { visible: true } });
  return [
    { url, lastModified: new Date() },
    ...categories.map((c) => ({ url: `${url}/category/${c.slug}` })),
    ...products.map((p) => ({
      url: `${url}/product/${p.slug}`,
      lastModified: p.updatedAt,
    })),
  ];
}
