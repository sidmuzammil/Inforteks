/** Parse money without binary floating-point rounding or accepting exponent notation. */
export function aedToFils(
  value: FormDataEntryValue | string | null,
): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(raw))
    throw new Error("Enter an AED price with at most two decimal places.");
  const [whole, fraction = ""] = raw.split(".");
  const fils = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (fils > 100_000_000)
    throw new Error("The maximum price is AED 1,000,000.");
  return fils;
}
export function readPrices(fd: FormData, suffix = "") {
  const price = aedToFils(fd.get(`price${suffix}`));
  const compareAt = aedToFils(fd.get(`compareAt${suffix}`));
  if (compareAt !== null && (price === null || compareAt <= price))
    throw new Error(
      "Previous price must be higher than the current price. Leave it blank for products without a discount.",
    );
  return { price, compareAt };
}
