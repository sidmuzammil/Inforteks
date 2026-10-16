/** Public research only: no DB connection, application authentication or publication. */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { catalogueManifestProduct } from "../src/lib/catalogue-manifest";

const destination = path.resolve(process.argv[2] ?? ".data/catalogue/supplier");
if (
  (process.env.HTTPS_PROXY || process.env.HTTP_PROXY) &&
  process.env.NODE_USE_ENV_PROXY !== "1" &&
  !process.execArgv.includes("--use-env-proxy")
)
  throw new Error(
    "Preserve the network policy: run Node with --use-env-proxy.",
  );
const origin = "https://www.alershadonline.com";
const itemSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  handle: z.string(),
  vendor: z.string(),
  product_type: z.string(),
  variants: z
    .array(
      z.object({
        id: z.number().int(),
        title: z.string(),
        sku: z.string().nullable().optional(),
        image_id: z.number().nullable().optional(),
      }),
    )
    .min(1),
  images: z
    .array(
      z.object({
        id: z.number().int(),
        src: z.string().url(),
        variant_ids: z.array(z.number()).optional(),
      }),
    )
    .default([]),
});
type Item = z.infer<typeof itemSchema>;
const slug = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 130)
    .replace(/-$/, "");
function category(type: string, title: string) {
  const value = `${type} ${title}`.toLowerCase();
  const printers = { name: "Printers", slug: "printers" };
  if (/imaging drum|drum unit/.test(value))
    return { name: "Imaging Drums", slug: "imaging-drums", parent: printers };
  if (/ink.*cartridge|ink bottle/.test(value))
    return { name: "Ink Cartridges", slug: "ink-cartridges", parent: printers };
  if (/toner/.test(value))
    return {
      name: "Toner Cartridges",
      slug: "toners-cartridges",
      parent: printers,
    };
  if (
    /laptop bag|backpack|dock|adapter|charger|headset|keyboard|mouse/.test(
      value,
    )
  )
    return { name: "Accessories", slug: "accessories" };
  const rules = [
    [/printer|scanner|plotter/, "Printers", "printers"],
    [/laptop|notebook|macbook|chromebook/, "Laptops", "laptops"],
    [/monitor|display screen/, "Monitors", "monitors"],
    [
      /router|network|switch|firewall|access point|mesh wifi/,
      "Networking",
      "networking",
    ],
    [
      /desktop|workstation|mini pc|all.in.one/,
      "Desktops & Workstations",
      "desktops",
    ],
    [
      /hard drive|ssd|flash drive|nas |storage|memory card/,
      "Storage",
      "storage",
    ],
    [
      /processor|motherboard|graphics card|power supply|cooler|computer case|ddr[345]/,
      "PC Components",
      "components",
    ],
    [
      /software|license|microsoft office|windows|antivirus/,
      "Software",
      "software",
    ],
  ] as const;
  for (const [pattern, name, key] of rules)
    if (pattern.test(value)) return { name, slug: key };
  return { name: "Accessories", slug: "accessories" };
}
await mkdir(destination, { recursive: true, mode: 0o700 });
const save = (file: string, data: unknown) =>
  writeFile(
    path.join(destination, file),
    JSON.stringify(data, null, 2) + "\n",
    { mode: 0o600 },
  );
const items: Item[] = [];
const seen = new Set<number>();
let complete = false;
for (let page = 1; page <= 100; page += 1) {
  const response = await fetch(
    `${origin}/products.json?limit=250&page=${page}`,
    {
      redirect: "error",
      signal: AbortSignal.timeout(30000),
      headers: { Accept: "application/json" },
    },
  );
  if (!response.ok)
    throw new Error(
      `Supplier feed returned ${response.status} on page ${page}. Do not bypass a policy denial; update the supported environment configuration.`,
    );
  const batch = z
    .object({ products: z.array(itemSchema) })
    .parse(await response.json()).products;
  if (!batch.length) {
    complete = true;
    break;
  }
  for (const item of batch) {
    if (seen.has(item.id))
      throw new Error(
        `Pagination repeated product ${item.id}; coverage is uncertain. Obtain a stable supplier export.`,
      );
    seen.add(item.id);
    items.push(item);
  }
  // Zod strips commercial HTML, prices, stock, reviews and other non-identity fields.
  await save("identities.json", {
    source: origin,
    complete: false,
    pagesRead: page,
    products: items,
  });
  console.log(`Recorded ${items.length} source products through page ${page}.`);
}
if (!complete)
  throw new Error("Pagination limit reached; source coverage is incomplete.");
const photos: { externalId: string; sourceUrl: string; imageUrls: string[] }[] =
  [];
const products = items.flatMap((item) =>
  item.variants.map((variant) => {
    const externalId = `shopify-${item.id}-${variant.id}`;
    const sourceUrl = `${origin}/products/${encodeURIComponent(item.handle)}`;
    const brand = item.vendor.trim().slice(0, 100);
    const matched = item.images.filter(
      (image) =>
        image.id === variant.image_id ||
        image.variant_ids?.includes(variant.id),
    );
    photos.push({
      externalId,
      sourceUrl,
      imageUrls: (matched.length ? matched : item.images).map(
        (image) => image.src,
      ),
    });
    const variantTitle =
      variant.title && variant.title !== "Default Title"
        ? ` — ${variant.title}`
        : "";
    const fullName = `${item.title}${variantTitle}`.replace(/\s+/g, " ").trim();
    return catalogueManifestProduct.parse({
      externalId,
      sourceUrl,
      name: fullName.slice(0, 180),
      slug: `${slug(item.title)}-${variant.id}`,
      brand: {
        name: brand || "Brand pending verification",
        slug: slug(brand) || "brand-pending-verification",
      },
      category: category(item.product_type, item.title),
      sku: { code: `SUP-${variant.id}` },
      description:
        "Request a quotation for this product. Pricing, the exact configuration and availability will be confirmed for your requirements.",
      images: [],
      unresolved: [
        "Verify the exact manufacturer model and variant against an authoritative source before publication.",
        "Review proposed category and brand; supplier labels do not establish classification or authenticity.",
        "Download and visually verify exact product photos. Source image references are not approved media.",
        ...(brand.toLowerCase() === "genuine" || !brand
          ? ["Supplier vendor label is not a verified manufacturer brand."]
          : []),
        ...(fullName.length > 180
          ? [
              "Source title was shortened for the editor; review the exact product name and configuration.",
            ]
          : []),
      ],
    });
  }),
);
const summary = {
  source: origin,
  capturedAt: new Date().toISOString(),
  complete,
  sourceProducts: items.length,
  sourceVariants: products.length,
  publishReady: 0,
};
await save("identities.json", { ...summary, products: items });
await save("manifest.json", {
  version: 1,
  source: "alershad-supplier-catalogue",
  products,
});
await save("photo-references.json", { ...summary, photos });
await save("coverage.json", summary);
console.log(JSON.stringify(summary));
