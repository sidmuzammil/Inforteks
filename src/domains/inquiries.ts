import { z } from "zod";
import { db } from "@/lib/db";
import { invariant } from "@/lib/errors";
import { onlineProductWhere } from "@/lib/product-visibility";

export const inquiryInput = z
  .object({
    name: z.string().trim().min(2).max(100),
    email: z.email().max(200),
    subject: z.string().trim().min(2).max(150),
    message: z.string().trim().min(10).max(5000),
    productSlug: z.string().min(1).max(200).optional(),
    skuId: z.string().min(1).max(100).optional(),
    quantity: z.number().int().min(1).max(10000).optional(),
  })
  .strict()
  .refine((data) => Boolean(data.productSlug) === Boolean(data.skuId), {
    message:
      "A product request requires both the product and its configuration.",
  });

// A saved inquiry is a request, never an order, reservation or stock assertion.
// Resolve references again on submission instead of trusting prefilled page text.
export async function createInquiry(raw: unknown) {
  const data = inquiryInput.parse(raw);
  let message = data.message;
  let subject = data.subject;
  if (data.productSlug && data.skuId) {
    const sku = await db.sku.findFirst({
      where: {
        id: data.skuId,
        active: true,
        product: { ...onlineProductWhere, slug: data.productSlug },
      },
      select: {
        code: true,
        mpn: true,
        product: { select: { name: true, slug: true } },
      },
    });
    invariant(
      sku,
      404,
      "This product is no longer available for a website inquiry.",
    );
    subject = `Quote: ${sku.product.name}`.slice(0, 150);
    message = [
      `Product: ${sku.product.name}`,
      `Product URL: /product/${sku.product.slug}`,
      `SKU: ${sku.code}`,
      ...(sku.mpn ? [`Manufacturer part number: ${sku.mpn}`] : []),
      `Requested quantity: ${data.quantity ?? 1}`,
      "",
      data.message,
    ].join("\n");
  }
  const row = await db.inquiry.create({
    data: { name: data.name, email: data.email, subject, message },
  });
  return {
    id: row.id,
    message: "Your request has been saved for the Inforteks team.",
  };
}
