/** Authenticated HTTP client only: never imports db, creates an actor, or seeds data. */
import { readFile, writeFile, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import {
  catalogueManifest,
  catalogueManifestProduct,
  type CatalogueImportPreview,
} from "../src/lib/catalogue-manifest";

type Receipt = {
  origin: string;
  manifestPath: string;
  manifestHash: string;
  previews: CatalogueImportPreview[];
  results: Record<string, { externalId: string; productId: string }[]>;
  uploads: Record<string, { sha256: string; mediaId: string }[]>;
  proposals: {
    id: string;
    targetId: string;
    version: number;
    before: unknown;
    expiresAt: string;
  }[];
  published: string[];
};
const digest = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
const [command, inputPath, outputPath] = process.argv.slice(2);
if (
  !command ||
  !inputPath ||
  !["preview", "commit", "upload", "propose", "publish"].includes(command)
) {
  throw new Error(
    "Usage: node --import tsx scripts/catalogue-import.ts preview manifest.json receipt.json | commit receipt.json | upload receipt.json | propose receipt.json | publish receipt.json --reviewed. Set INFORTEKS_ADMIN_ORIGIN and INFORTEKS_SESSION_COOKIE securely.",
  );
}
const origin = new URL(process.env.INFORTEKS_ADMIN_ORIGIN ?? "");
if (
  origin.username ||
  origin.password ||
  origin.pathname !== "/" ||
  origin.search ||
  origin.hash ||
  (origin.protocol !== "https:" &&
    !(
      origin.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(origin.hostname)
    ))
)
  throw new Error(
    "Use the exact HTTPS application origin (HTTP is allowed only on localhost).",
  );
const cookie = process.env.INFORTEKS_SESSION_COOKIE;
if (!cookie)
  throw new Error(
    "An existing authenticated staff session is required. No account will be created or reset.",
  );
async function api<T>(endpoint: string, body?: unknown): Promise<T> {
  const form = body instanceof FormData;
  const response = await fetch(`${origin.origin}/api/v1/admin/${endpoint}`, {
    method: body === undefined ? "GET" : "POST",
    redirect: "error",
    headers: {
      Cookie: cookie!,
      Origin: origin.origin,
      ...(form ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : form ? body : JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      `API ${response.status}: ${result.error?.message ?? "Request failed"}`,
    );
  return result.data as T;
}
const file = path.resolve(
  command === "preview" ? (outputPath ?? "") : inputPath,
);
if (command === "preview" && !outputPath)
  throw new Error(
    "Provide a private receipt output path, preferably under .data.",
  );
const save = async (receipt: Receipt) =>
  writeFile(file, JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600 });
let receipt: Receipt;
if (command === "preview") {
  const manifestBytes = await readFile(path.resolve(inputPath));
  const manifest = catalogueManifest
    .extend({ products: z.array(catalogueManifestProduct).min(1).max(10000) })
    .parse(JSON.parse(manifestBytes.toString()));
  receipt = {
    origin: origin.origin,
    manifestPath: path.resolve(inputPath),
    manifestHash: digest(manifestBytes),
    previews: [],
    results: {},
    uploads: {},
    proposals: [],
    published: [],
  };
  await save(receipt);
  for (let index = 0; index < manifest.products.length; index += 100) {
    receipt.previews.push(
      await api<CatalogueImportPreview>("catalogue-imports", {
        manifest: {
          ...manifest,
          products: manifest.products.slice(index, index + 100),
        },
      }),
    );
    await save(receipt);
  }
} else {
  receipt = JSON.parse(await readFile(file, "utf8")) as Receipt;
  if (receipt.origin !== origin.origin)
    throw new Error(
      "Receipt belongs to another environment. Preview separately in each environment.",
    );
  if (digest(await readFile(receipt.manifestPath)) !== receipt.manifestHash)
    throw new Error("Manifest changed after review. Create a fresh preview.");
  if (command === "commit") {
    if (receipt.previews.some((preview) => preview.summary.conflict))
      throw new Error("Resolve all preview conflicts before creating drafts.");
    for (const preview of receipt.previews) {
      if (receipt.results[preview.id]) continue;
      const result = await api<{
        rows: { externalId: string; productId: string }[];
      }>(`catalogue-imports/${preview.id}/commit`, {
        fingerprint: preview.fingerprint,
      });
      receipt.results[preview.id] = result.rows;
      await save(receipt);
    }
  }
  if (["upload", "propose"].includes(command)) {
    if (command === "propose") {
      // Renew an expired review without retaining proposals that can no longer be applied.
      receipt.proposals = receipt.proposals.filter((proposal) =>
        receipt.published.includes(proposal.id),
      );
      await save(receipt);
    }
    let proposedThisRun = 0;
    if (receipt.previews.some((preview) => !receipt.results[preview.id]))
      throw new Error(
        "Create every reviewed draft batch before attaching photographs.",
      );
    const manifest = catalogueManifest
      .extend({ products: z.array(catalogueManifestProduct).min(1).max(10000) })
      .parse(JSON.parse(await readFile(receipt.manifestPath, "utf8")));
    const directory = await realpath(path.dirname(receipt.manifestPath));
    for (const item of manifest.products) {
      const imported = Object.values(receipt.results)
        .flat()
        .find((row) => row.externalId === item.externalId);
      if (!imported)
        throw new Error("An imported product is missing from the receipt.");
      const product = await api<{
        id: string;
        status: string;
        quoteOnly: boolean;
        media: { id: string }[];
      }>(`products/${imported.productId}`);
      if (product.status === "PUBLISHED") continue;
      if (product.status !== "DRAFT" || !product.quoteOnly)
        throw new Error(
          "An imported product changed. Review it in the product editor.",
        );
      const recorded = receipt.uploads[product.id] ?? [];
      if (
        product.media.some(
          (image) => !recorded.some((upload) => upload.mediaId === image.id),
        )
      )
        throw new Error(
          `Product ${product.id} has images outside this upload receipt. Review it in the product editor; no images were replaced.`,
        );
      if (command === "upload") {
        for (const image of item.images) {
          if (recorded.some((upload) => upload.sha256 === image.sha256))
            continue;
          const imagePath = await realpath(path.resolve(directory, image.file));
          if (!imagePath.startsWith(directory + path.sep))
            throw new Error("Image resolves outside the manifest directory.");
          const bytes = await readFile(imagePath);
          if (digest(bytes) !== image.sha256)
            throw new Error(
              `Photo checksum does not match the reviewed manifest: ${image.file}`,
            );
          const form = new FormData();
          form.set("file", new File([bytes], path.basename(imagePath)));
          form.set("productId", product.id);
          form.set("alt", image.alt);
          const saved = await api<{ id: string }>("media", form);
          recorded.push({ sha256: image.sha256, mediaId: saved.id });
          receipt.uploads[product.id] = recorded;
          await save(receipt);
        }
      } else {
        if (
          item.unresolved.length ||
          !item.images.length ||
          item.images.some(
            (image) =>
              !recorded.some(
                (upload) =>
                  upload.sha256 === image.sha256 &&
                  product.media.some((media) => media.id === upload.mediaId),
              ),
          )
        )
          throw new Error(
            `Resolve research and verify every photograph before proposing publication: ${item.externalId}`,
          );
        const proposal = await api<Receipt["proposals"][number]>(
          `products/${product.id}/publish`,
          {},
        );
        receipt.proposals.push(proposal);
        await save(receipt);
        proposedThisRun += 1;
        if (proposedThisRun >= 100) break;
      }
    }
  }
  if (command === "publish") {
    if (outputPath !== "--reviewed")
      throw new Error(
        "Inspect the exact proposals in the private receipt, then use publish receipt.json --reviewed. Proposals expire after 15 minutes.",
      );
    for (const proposal of receipt.proposals) {
      if (receipt.published.includes(proposal.id)) continue;
      if (new Date(proposal.expiresAt) <= new Date())
        throw new Error(
          "Publication proposals expired. Prepare a fresh review.",
        );
      await api(`proposals/${proposal.id}/approve`, {});
      receipt.published.push(proposal.id);
      await save(receipt);
    }
  }
}
console.log(
  JSON.stringify({
    command,
    receipt: file,
    previewed: receipt.previews.reduce(
      (sum, preview) => sum + preview.rows.length,
      0,
    ),
    conflicts: receipt.previews.reduce(
      (sum, preview) => sum + preview.summary.conflict,
      0,
    ),
    imported: Object.values(receipt.results).flat().length,
    photos: Object.values(receipt.uploads).flat().length,
    proposed: receipt.proposals.length,
    published: receipt.published.length,
  }),
);
