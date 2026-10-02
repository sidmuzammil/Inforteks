import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { db } from "@/lib/db";
import { invariant } from "@/lib/errors";
import { audit, requireScope, type Actor } from "./identity";
const root = () =>
  path.resolve(
    /* turbopackIgnore: true */ process.env.UPLOAD_DIR ?? ".data/uploads",
  );
function s3() {
  return new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? "auto",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    },
  });
}
export async function storeImage(
  actor: Actor,
  file: File,
  productId: string,
  alt: string,
) {
  requireScope(actor, "catalog:write");
  invariant(
    file.size > 0 && file.size <= 8 * 1024 * 1024,
    422,
    "Images must be smaller than 8 MB.",
  );
  invariant(
    alt.trim().length > 0 && alt.length <= 250,
    422,
    "Add meaningful alternative text.",
  );
  const product = await db.product.findUnique({ where: { id: productId } });
  invariant(product, 404, "Product not found.");
  // Media for a live product is staged; explicit publication makes the new asset public.
  if (product.status === "PUBLISHED") requireScope(actor, "catalog:publish");
  const source = Buffer.from(await file.arrayBuffer());
  const metadata = await sharp(source, {
    limitInputPixels: 25_000_000,
  }).metadata();
  invariant(
    ["jpeg", "png", "webp", "avif"].includes(metadata.format ?? "") &&
      (metadata.width ?? 0) >= 100 &&
      (metadata.height ?? 0) >= 100,
    422,
    "Upload a JPEG, PNG, WebP, or AVIF image at least 100 × 100 pixels.",
  );
  const { data, info } = await sharp(source, { limitInputPixels: 25_000_000 })
    .rotate()
    .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer({ resolveWithObject: true });
  const key = `${randomUUID()}.webp`;
  if (process.env.STORAGE_DRIVER === "s3")
    await s3().send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: data,
        ContentType: "image/webp",
      }),
    );
  else {
    invariant(
      process.env.NODE_ENV !== "production",
      503,
      "Production requires S3-compatible storage.",
    );
    await mkdir(root(), { recursive: true });
    await writeFile(path.join(root(), key), data);
  }
  return db.$transaction(async (tx) => {
    const media = await tx.media.create({
      data: { key, productId, alt, width: info.width, height: info.height },
    });
    await tx.product.update({
      where: { id: productId },
      data: { version: { increment: 1 } },
    });
    await audit(tx, actor, "media.upload", media.id, undefined, {
      productId,
      alt,
    });
    return media;
  });
}
export async function readImage(id: string, actor?: Actor) {
  const m = await db.media.findUnique({
    where: { id },
    include: { product: { select: { status: true } } },
  });
  invariant(m, 404, "Image not found.");
  if (!m.public || m.product?.status !== "PUBLISHED") {
    invariant(actor, 404, "Image not found.");
    requireScope(actor, "catalog:read");
  }
  invariant(/^[a-f0-9-]+\.webp$/.test(m.key), 404, "Image not found.");
  const body =
    process.env.STORAGE_DRIVER === "s3"
      ? Buffer.from(
          await (
            await s3().send(
              new GetObjectCommand({
                Bucket: process.env.S3_BUCKET,
                Key: m.key,
              }),
            )
          ).Body!.transformToByteArray(),
        )
      : await readFile(path.join(root(), m.key));
  return {
    body,
    mime: m.mime,
    public: m.public && m.product?.status === "PUBLISHED",
  };
}
