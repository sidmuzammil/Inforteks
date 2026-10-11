import { z } from "zod";

export const catalogueFacetLimit = 24;
export const catalogueFacetValueLimit = 50;
const facetKey = /^[a-zA-Z0-9_ ]{1,40}$/;
const excludedKeys = new Set([
  "dataset",
  "__proto__",
  "constructor",
  "prototype",
]);

export function isCatalogueFacetKey(key: string) {
  return (
    facetKey.test(key) &&
    Boolean(key.trim()) &&
    !excludedKeys.has(key.toLowerCase())
  );
}

export function isCatalogueFacetParameter(parameter: string) {
  return (
    parameter.startsWith("spec.") && isCatalogueFacetKey(parameter.slice(5))
  );
}

const selectedFacets = z
  .record(
    z
      .string()
      .refine(isCatalogueFacetParameter, "Invalid specification filter."),
    z.string().max(200),
  )
  .refine(
    (values) =>
      Object.values(values).filter((value) => value !== "").length <=
      catalogueFacetLimit,
    "Too many specification filters.",
  );

/** Keep existing RAM/storage links working without maintaining a second facet path. */
export function catalogueFacetSelections(input: Record<string, unknown>) {
  const values = Object.fromEntries(
    Object.entries(input).filter(([key]) => key.startsWith("spec.")),
  );
  for (const key of ["ram", "storage"])
    if (input[key] && !Object.hasOwn(values, `spec.${key}`))
      values[`spec.${key}`] = input[key];
  return Object.entries(selectedFacets.parse(values))
    .filter(([, value]) => value !== "")
    .map(([parameter, value]) => ({
      parameter,
      key: parameter.slice(5),
      value,
    }));
}

export function catalogueFacetLabel(key: string) {
  return key
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function catalogueFacetValue(value: string, unit: string | null) {
  // Units describe numeric values only; a stored "1 Gbps" must stay exactly that.
  return unit && /^-?\d+(\.\d+)?$/.test(value) ? `${value} ${unit}` : value;
}
