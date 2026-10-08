import { z } from "zod";
import { db, type Tx } from "@/lib/db";
import { invariant } from "@/lib/errors";
import { json } from "@/lib/utils";
import type { Prisma } from "@/generated/prisma/client";
import {
  catalogueImportInput,
  catalogueImportCommitInput,
  catalogueManifest,
  type CatalogueManifest,
  type CatalogueManifestProduct,
  type CatalogueImportRow,
} from "@/lib/catalogue-manifest";
import {
  audit,
  actorForUser,
  requireScope,
  hash,
  type Actor,
} from "./identity";
import { createProduct } from "./catalogue";

// Canonical object ordering makes a retry independent of JSON key ordering.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .filter(([, v]) => v !== undefined)
      .map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
const fingerprint = (value: unknown) => hash(canonical(value));
const storedInput = z.object({
  kind: z.literal("researched-catalogue-v1"),
  manifest: catalogueManifest,
  fingerprint: z.string(),
  results: z
    .array(z.object({ externalId: z.string(), productId: z.string() }))
    .optional(),
});

async function inspect(tx: Tx, manifest: CatalogueManifest) {
  const rows: CatalogueImportRow[] = [];
  const identifiers = new Set<string>();
  for (const item of manifest.products) {
    const row: CatalogueImportRow = {
      externalId: item.externalId,
      code: item.sku.code,
      name: item.name,
      status: "create",
      issues: [...item.unresolved],
    };
    if (!item.images.length)
      row.issues.push(
        "A verified product photograph is required before publication.",
      );
    const keys = [
      `source:${item.externalId}`,
      `sku:${item.sku.code.toLowerCase()}`,
      `slug:${item.slug}`,
      ...(item.sku.mpn
        ? [`mpn:${item.brand.slug}:${item.sku.mpn.toLowerCase()}`]
        : []),
    ];
    if (keys.some((key) => identifiers.has(key))) {
      row.status = "conflict";
      row.issues.push(
        "Duplicate source identity, SKU, model part number or slug in this batch.",
      );
    }
    keys.forEach((key) => identifiers.add(key));
    const source = await tx.catalogueSource.findUnique({
      where: {
        source_externalId: {
          source: manifest.source,
          externalId: item.externalId,
        },
      },
    });
    if (source) {
      row.productId = source.productId;
      if (source.manifestHash !== fingerprint(item)) {
        row.status = "conflict";
        row.issues.push(
          "This source was previously imported with different details. Review the existing product in its editor.",
        );
      } else if (row.status !== "conflict") row.status = "existing";
    } else {
      const collision = await tx.sku.findFirst({
        where: {
          OR: [
            { code: { equals: item.sku.code, mode: "insensitive" } },
            ...(item.sku.mpn
              ? [
                  {
                    mpn: { equals: item.sku.mpn, mode: "insensitive" as const },
                    product: { brand: { slug: item.brand.slug } },
                  },
                ]
              : []),
          ],
        },
        select: { productId: true },
      });
      const slugCollision = await tx.product.findUnique({
        where: { slug: item.slug },
        select: { id: true },
      });
      if (collision || slugCollision) {
        row.status = "conflict";
        row.productId = collision?.productId ?? slugCollision?.id;
        row.issues.push(
          "An existing product uses this SKU, manufacturer part number or slug. It will not be overwritten or linked automatically.",
        );
      }
    }
    const category = await tx.category.findUnique({
      where: { slug: item.category.slug },
      include: { parent: true, attributes: true },
    });
    if (
      item.category.parent?.slug === item.category.slug ||
      (category &&
        (category.parent?.slug ?? null) !==
          (item.category.parent?.slug ?? null))
    ) {
      row.status = "conflict";
      row.issues.push(
        "The category parent differs from the existing hierarchy.",
      );
    }
    if (item.category.parent) {
      const parent = await tx.category.findUnique({
        where: { slug: item.category.parent.slug },
      });
      if (parent?.parentId) {
        row.status = "conflict";
        row.issues.push("A category must belong to a top-level department.");
      }
    }
    for (const attribute of category?.attributes.filter((a) => a.required) ??
      []) {
      if (!Object.hasOwn(item.specs, attribute.key))
        row.issues.push(
          `Required specification needs review: ${attribute.label}.`,
        );
    }
    rows.push(row);
  }
  return rows;
}
const summary = (rows: CatalogueImportRow[]) => ({
  create: rows.filter((r) => r.status === "create").length,
  existing: rows.filter((r) => r.status === "existing").length,
  conflict: rows.filter((r) => r.status === "conflict").length,
});

export async function previewCatalogueImport(actor: Actor, raw: unknown) {
  requireScope(actor, "catalog:write");
  const { manifest } = catalogueImportInput.parse(raw);
  return db.$transaction(
    async (tx) => {
      const rows = await inspect(tx, manifest);
      const digest = fingerprint(manifest);
      const batch = await tx.importBatch.create({
        data: {
          actorId: actor.id,
          status: "CATALOGUE_PREVIEW",
          rows: json<Prisma.InputJsonValue>({
            kind: "researched-catalogue-v1",
            manifest,
            fingerprint: digest,
          }),
          errors: json<Prisma.InputJsonValue>(rows),
        },
      });
      await audit(tx, actor, "catalogue-import.preview", batch.id, undefined, {
        source: manifest.source,
        fingerprint: digest,
        ...summary(rows),
      });
      return {
        id: batch.id,
        fingerprint: digest,
        rows,
        summary: summary(rows),
      };
    },
    { timeout: 30000 },
  );
}

async function taxonomy(tx: Tx, actor: Actor, item: CatalogueManifestProduct) {
  let brand = await tx.brand.findUnique({ where: { slug: item.brand.slug } });
  if (!brand) {
    brand = await tx.brand.create({ data: item.brand });
    await audit(tx, actor, "brands.save", brand.id, undefined, brand);
  }
  let parentId: string | undefined;
  if (item.category.parent) {
    let parent = await tx.category.findUnique({
      where: { slug: item.category.parent.slug },
    });
    if (!parent) {
      parent = await tx.category.create({ data: item.category.parent });
      await audit(tx, actor, "categories.save", parent.id, undefined, parent);
    }
    parentId = parent.id;
  }
  let category = await tx.category.findUnique({
    where: { slug: item.category.slug },
  });
  if (!category) {
    category = await tx.category.create({
      data: { name: item.category.name, slug: item.category.slug, parentId },
    });
    await audit(tx, actor, "categories.save", category.id, undefined, category);
  }
  return { brandId: brand.id, categoryId: category.id };
}

export async function commitCatalogueImport(
  actor: Actor,
  id: string,
  raw: unknown,
) {
  requireScope(actor, "catalog:write");
  invariant(
    actor.human && actor.source === "admin",
    403,
    "An authenticated staff member must review and create these drafts.",
  );
  const current = await actorForUser(actor.id);
  requireScope(current, "catalog:write");
  const confirmation = catalogueImportCommitInput.parse(raw);
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 8))`;
      const batch = await tx.importBatch.findFirst({
        where: {
          id,
          actorId: current.id,
          status: { in: ["CATALOGUE_PREVIEW", "CATALOGUE_COMPLETED"] },
        },
      });
      invariant(batch, 404, "Catalogue import preview not found.");
      const saved = storedInput.parse(batch.rows);
      invariant(
        saved.fingerprint === confirmation.fingerprint,
        409,
        "The manifest differs from the reviewed preview.",
      );
      if (batch.status === "CATALOGUE_COMPLETED")
        return { id, rows: saved.results ?? [], replay: true };
      invariant(
        batch.createdAt.getTime() > Date.now() - 15 * 60_000,
        409,
        "This preview expired. Review a fresh preview before creating drafts.",
      );
      // Serializes catalogue batches, including two independently reviewed previews of the same source.
      // Other product writers remain protected by the database's unique SKU/slug constraints.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('researched-catalogue-import', 8))`;
      const review = await inspect(tx, saved.manifest);
      invariant(
        !review.some((row) => row.status === "conflict"),
        409,
        "Products changed or conflict with this import. Create a fresh preview; existing records were preserved.",
      );
      const results: { externalId: string; productId: string }[] = [];
      for (const [index, item] of saved.manifest.products.entries()) {
        const existing = review[index].productId;
        if (existing) {
          results.push({ externalId: item.externalId, productId: existing });
          continue;
        }
        const ids = await taxonomy(tx, current, item);
        const product = await createProduct(
          current,
          {
            ...ids,
            name: item.name,
            slug: item.slug,
            description: item.description,
            model: item.model,
            highlights: item.highlights,
            specs: item.specs,
            featured: item.featured,
            store: item.store,
            quoteOnly: true,
            skus: [
              { ...item.sku, specs: item.specs, price: null, compareAt: null },
            ],
          },
          tx,
        );
        await tx.catalogueSource.create({
          data: {
            source: saved.manifest.source,
            externalId: item.externalId,
            productId: product.id,
            manifestHash: fingerprint(item),
          },
        });
        results.push({ externalId: item.externalId, productId: product.id });
      }
      await tx.importBatch.update({
        where: { id },
        data: {
          status: "CATALOGUE_COMPLETED",
          rows: json<Prisma.InputJsonValue>({ ...saved, results }),
        },
      });
      await audit(
        tx,
        current,
        "catalogue-import.create-drafts",
        id,
        undefined,
        {
          source: saved.manifest.source,
          fingerprint: saved.fingerprint,
          created: summary(review).create,
          existing: summary(review).existing,
        },
      );
      return { id, rows: results, replay: false };
    },
    { timeout: 30000 },
  );
}
