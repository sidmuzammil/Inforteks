import { z } from "zod";

const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(180);
const taxonomy = z
  .object({ name: z.string().trim().min(2).max(100), slug })
  .strict();
const sourceUrl = z
  .string()
  .url()
  .max(2000)
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  }, "Use a public HTTPS source URL without credentials.");
const specs = z.record(
  z.string().regex(/^[a-zA-Z0-9_ ]{1,40}$/),
  z.union([z.string().max(200), z.number().finite()]),
);

export const catalogueManifestProduct = z
  .object({
    externalId: z.string().trim().min(1).max(160),
    sourceUrl,
    name: z.string().trim().min(3).max(180),
    slug,
    brand: taxonomy,
    category: taxonomy.extend({ parent: taxonomy.optional() }).strict(),
    sku: z
      .object({
        code: z.string().trim().min(2).max(80),
        mpn: z.string().trim().min(1).max(100).optional(),
      })
      .strict(),
    model: z.string().max(100).optional(),
    description: z.string().max(20000).default(""),
    highlights: z.array(z.string().max(250)).max(12).default([]),
    specs: specs.default({}),
    featured: z.boolean().default(false),
    store: z.boolean().default(true),
    images: z
      .array(
        z
          .object({
            file: z
              .string()
              .max(500)
              .regex(/^[a-zA-Z0-9][a-zA-Z0-9_./ -]*$/)
              .refine(
                (value) => !value.split("/").includes(".."),
                "Image paths must stay inside the manifest directory.",
              ),
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
            alt: z.string().trim().min(1).max(250),
            sourceUrl,
          })
          .strict(),
      )
      .max(8)
      .default([]),
    unresolved: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  })
  .strict();

export const catalogueManifest = z
  .object({
    version: z.literal(1),
    source: z.string().regex(/^[a-z0-9][a-z0-9-]{1,79}$/),
    products: z.array(catalogueManifestProduct).min(1).max(100),
  })
  .strict();
export const catalogueImportInput = z
  .object({ manifest: catalogueManifest })
  .strict();
export const catalogueImportCommitInput = z
  .object({ fingerprint: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
export type CatalogueManifest = z.infer<typeof catalogueManifest>;
export type CatalogueManifestProduct = z.infer<typeof catalogueManifestProduct>;
export type CatalogueImportRow = {
  externalId: string;
  code: string;
  name: string;
  status: "create" | "existing" | "conflict";
  productId?: string;
  issues: string[];
};
export type CatalogueImportPreview = {
  id: string;
  fingerprint: string;
  rows: CatalogueImportRow[];
  summary: { create: number; existing: number; conflict: number };
};
