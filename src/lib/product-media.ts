import { z } from "zod";

export const productMediaOrder = [
  { position: "asc" as const },
  { createdAt: "asc" as const },
  { id: "asc" as const },
];

export const productMediaInput = z
  .object({
    version: z.number().int().positive(),
    images: z
      .array(
        z
          .object({
            id: z.string().min(1).max(128),
            alt: z.string().trim().min(1).max(250),
          })
          .strict(),
      )
      .min(1)
      .max(1000)
      .refine(
        (images) =>
          new Set(images.map((image) => image.id)).size === images.length,
        "Each image must appear exactly once.",
      ),
  })
  .strict();
