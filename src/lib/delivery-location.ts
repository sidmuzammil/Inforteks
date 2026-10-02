export const deliveryCountries = [
  { code: "AE", name: "United Arab Emirates", short: "UAE", active: true },
  { code: "SA", name: "Saudi Arabia", short: "Saudi Arabia", active: false },
  { code: "QA", name: "Qatar", short: "Qatar", active: false },
  { code: "OM", name: "Oman", short: "Oman", active: false },
] as const;
export type DeliveryCountry = (typeof deliveryCountries)[number]["code"];
export type DeliveryLocation = {
  country: DeliveryCountry;
  emirate?: string;
  source: "manual" | "detected";
};
export function comingSoon(country: DeliveryCountry) {
  const name = deliveryCountries.find((item) => item.code === country)!.name;
  return `Sorry, we haven’t started operations in ${name} yet. Coming soon. You can still browse our UAE store.`;
}
export function parseDeliveryLocation(raw: string): DeliveryLocation | null {
  try {
    const value = JSON.parse(raw);
    if (
      !deliveryCountries.some((item) => item.code === value.country) ||
      !["manual", "detected"].includes(value.source)
    )
      return null;
    const allowed = [
      "Dubai",
      "Abu Dhabi",
      "Sharjah",
      "Ajman",
      "Umm Al Quwain",
      "Ras Al Khaimah",
      "Fujairah",
    ];
    return {
      country: value.country,
      source: value.source,
      ...(value.country === "AE" && allowed.includes(value.emirate)
        ? { emirate: value.emirate }
        : {}),
    };
  } catch {
    return null;
  }
}
function inside(point: number[], ring: number[][]) {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x, y] = ring[i];
    const [px, py] = ring[j];
    if (
      y > point[1] !== py > point[1] &&
      point[0] < ((px - x) * (point[1] - y)) / (py - y) + x
    )
      result = !result;
  }
  return result;
}
/** Coordinates remain in the browser. Boundary data loads only after permission. */
export async function countryAt(
  latitude: number,
  longitude: number,
): Promise<DeliveryCountry | null> {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  )
    return null;
  const { default: regions } = await import("@/data/gulf-countries.json");
  const point = [longitude, latitude];
  const region = regions.find((region) =>
    region.polygons.some(
      (polygon) =>
        inside(point, polygon[0]) &&
        !polygon.slice(1).some((hole) => inside(point, hole)),
    ),
  );
  return region ? (region.code as DeliveryCountry) : null;
}
