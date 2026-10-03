import { z } from "zod";
import { emirates } from "./utils";

const optionalText = (max: number) => z.string().trim().max(max).optional();
export const deliveryPinInput = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracy: z.number().min(0).max(200),
    confirmed: z.literal(true),
  })
  .strict();
export type DeliveryPin = z.infer<typeof deliveryPinInput>;
export const addressInput = z
  .object({
    name: z.string().trim().min(2).max(100),
    phone: z
      .string()
      .trim()
      .transform((value) => value.replace(/[ ()-]/g, ""))
      .pipe(
        z
          .string()
          .regex(/^\+971[0-9]{8,9}$/, "Use a UAE number starting +971."),
      ),
    emirate: z.enum(emirates as [string, ...string[]]),
    city: z.string().trim().min(2).max(100),
    area: optionalText(100),
    zone: optionalText(100),
    postalCode: optionalText(20),
    line1: z.string().trim().min(5).max(250),
    landmark: optionalText(200),
    location: deliveryPinInput.optional(),
  })
  .strict();
export type DeliveryAddress = z.infer<typeof addressInput>;
export type AddressSuggestion = Partial<
  Pick<
    DeliveryAddress,
    "emirate" | "city" | "area" | "zone" | "postalCode" | "line1"
  >
>;
export function readDeliveryAddress(form: FormData): DeliveryAddress {
  const raw = form.get("location");
  return addressInput.parse({
    ...Object.fromEntries(
      [
        "name",
        "phone",
        "emirate",
        "city",
        "area",
        "zone",
        "postalCode",
        "line1",
        "landmark",
      ].map((key) => [key, String(form.get(key) ?? "")]),
    ),
    ...(raw ? { location: JSON.parse(String(raw)) } : {}),
  });
}
export function deliveryMapUrl(pin: DeliveryPin) {
  return `https://www.google.com/maps/search/?api=1&query=${pin.latitude},${pin.longitude}`;
}
