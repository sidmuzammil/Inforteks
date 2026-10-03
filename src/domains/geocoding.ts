import { z } from "zod";
import { AppError, invariant } from "@/lib/errors";
import type { AddressSuggestion } from "@/lib/address";
import { rateLimit } from "./identity";

export function addressLookupEnabled() {
  return (
    process.env.ADDRESS_LOOKUP_ENABLED === "true" &&
    Boolean(process.env.GOOGLE_GEOCODING_API_KEY)
  );
}
export const locationLookupInput = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    consent: z.literal(true),
  })
  .strict();
const component = z.object({
  long_name: z.string().max(300),
  short_name: z.string().max(300),
  types: z.array(z.string()),
});
const providerResponse = z.object({
  status: z.string(),
  results: z
    .array(
      z.object({
        types: z.array(z.string()).optional(),
        address_components: z.array(component),
      }),
    )
    .max(100)
    .optional(),
});
export function parseAddressSuggestion(raw: unknown): AddressSuggestion | null {
  const response = providerResponse.parse(raw);
  if (response.status === "ZERO_RESULTS") return null;
  invariant(
    response.status === "OK",
    503,
    "Address lookup is unavailable. Enter your address manually.",
  );
  const result =
    response.results?.find((r) =>
      r.types?.some((t) => ["street_address", "premise"].includes(t)),
    ) ?? response.results?.[0];
  if (!result) return null;
  const part = (type: string) =>
    result.address_components.find((c) => c.types.includes(type));
  invariant(
    part("country")?.short_name === "AE",
    422,
    "Delivery is currently available in the UAE only. Choose a UAE delivery address.",
  );
  const emirateName =
    part("administrative_area_level_1")
      ?.long_name.toLowerCase()
      .replace(/[^a-z]/g, "") ?? "";
  const names: Record<string, string> = {
    dubai: "Dubai",
    abudhabi: "Abu Dhabi",
    sharjah: "Sharjah",
    ashshariqah: "Sharjah",
    ajman: "Ajman",
    ummalquwain: "Umm Al Quwain",
    ummalqaywayn: "Umm Al Quwain",
    rasalkhaimah: "Ras Al Khaimah",
    rasalkhaymah: "Ras Al Khaimah",
    fujairah: "Fujairah",
    alfujayrah: "Fujairah",
  };
  const city = part("locality")?.long_name;
  const area = (
    part("neighborhood") ??
    part("sublocality_level_2") ??
    part("sublocality_level_1") ??
    part("sublocality")
  )?.long_name;
  const district = part("sublocality_level_1")?.long_name;
  const street = [part("street_number")?.long_name, part("route")?.long_name]
    .filter(Boolean)
    .join(" ");
  // Missing components stay blank; never guess a postal code, zone or apartment.
  return {
    ...(names[emirateName] ? { emirate: names[emirateName] } : {}),
    ...(city ? { city: city.slice(0, 100) } : {}),
    ...(area ? { area: area.slice(0, 100) } : {}),
    ...(district && district !== area && district !== city
      ? { zone: district.slice(0, 100) }
      : {}),
    ...(part("postal_code")
      ? { postalCode: part("postal_code")!.long_name.slice(0, 20) }
      : {}),
    ...(street ? { line1: street.slice(0, 250) } : {}),
  };
}
export async function lookupAddress(raw: unknown, requester: string) {
  const input = locationLookupInput.parse(raw);
  invariant(
    addressLookupEnabled(),
    503,
    "Automatic address lookup is not connected. Enter your address manually.",
  );
  await rateLimit(`geocode:${requester}`, 5);
  await rateLimit("geocode:store:daily", 1000, 86_400_000);
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("latlng", `${input.latitude},${input.longitude}`);
  url.searchParams.set("language", "en");
  url.searchParams.set("key", process.env.GOOGLE_GEOCODING_API_KEY!);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    invariant(
      response.ok,
      503,
      "Address lookup is unavailable. Enter your address manually.",
    );
    const suggestion = parseAddressSuggestion(await response.json());
    return { suggestion, attribution: "Google Maps" };
  } catch (error) {
    if (error instanceof AppError) throw error;
    // Never log or return provider URLs, keys, coordinates, or raw provider errors.
    throw new AppError(
      503,
      "Address lookup is unavailable. Enter your address manually.",
    );
  }
}
