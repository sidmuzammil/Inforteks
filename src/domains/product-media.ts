import { db } from "@/lib/db";
import { invariant } from "@/lib/errors";
import { productMediaInput, productMediaOrder } from "@/lib/product-media";
import { audit, requireScope, type Actor } from "./identity";

export async function updateProductMedia(
  actor: Actor,
  productId: string,
  raw: unknown,
) {
  requireScope(actor, "catalog:write");
  const data = productMediaInput.parse(raw);
  return db.$transaction(async (tx) => {
    const product = await tx.product.findUnique({ where: { id: productId } });
    invariant(product, 404, "Product not found.");
    if (product.status === "PUBLISHED") requireScope(actor, "catalog:publish");
    invariant(
      product.version === data.version,
      409,
      "This product changed while you were editing. Reload images before saving again.",
    );
    // This row also serializes uploads and invalidates older product proposals.
    const claimed = await tx.product.updateMany({
      where: { id: productId, version: data.version },
      data: { version: { increment: 1 } },
    });
    invariant(
      claimed.count === 1,
      409,
      "This product changed while you were editing. Reload images before saving again.",
    );
    const before = await tx.media.findMany({
      where: { productId },
      orderBy: productMediaOrder,
    });
    const ids = new Set(before.map((image) => image.id));
    invariant(
      before.length === data.images.length &&
        data.images.every((image) => ids.has(image.id)),
      422,
      "Include every image belonging to this product exactly once.",
    );
    const media = [];
    for (const [position, image] of data.images.entries()) {
      media.push(
        await tx.media.update({
          where: { id: image.id },
          data: { position, alt: image.alt },
          select: {
            id: true,
            alt: true,
            key: true,
            public: true,
            position: true,
          },
        }),
      );
    }
    await audit(
      tx,
      actor,
      "product.media.edit",
      productId,
      before.map(({ id, alt, position }) => ({ id, alt, position })),
      media.map(({ id, alt, position }) => ({ id, alt, position })),
    );
    return { version: data.version + 1, media };
  });
}
