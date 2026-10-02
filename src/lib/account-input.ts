import { z } from "zod";
export const customerName = z
  .string()
  .trim()
  .min(2, "Enter your full name.")
  .max(100, "Use no more than 100 characters.")
  .refine((name) => !/[\u0000-\u001f\u007f]/.test(name), "Enter a valid name.");
export const profileInput = z.object({ name: customerName }).strict();
