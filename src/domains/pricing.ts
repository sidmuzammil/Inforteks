import { invariant } from "@/lib/errors";
export function allocate(amount: number, weights: number[]) {
  const total = weights.reduce((a, b) => a + b, 0);
  if (!total) return weights.map(() => 0);
  const shares = weights.map((w) =>
    Number((BigInt(amount) * BigInt(w)) / BigInt(total)),
  );
  let remaining = amount - shares.reduce((a, b) => a + b, 0);
  const order = weights
    .map((w, i) => ({
      i,
      remainder: (BigInt(amount) * BigInt(w)) % BigInt(total),
    }))
    .sort((a, b) =>
      a.remainder === b.remainder
        ? a.i - b.i
        : a.remainder > b.remainder
          ? -1
          : 1,
    );
  for (const { i } of order) {
    if (!remaining) break;
    shares[i]++;
    remaining--;
  }
  return shares;
}
export function calculate(
  lines: { price: number; quantity: number }[],
  shipping: number,
  percent = 0,
  taxBps = 0,
  inclusive = false,
) {
  invariant(
    Number.isSafeInteger(shipping) &&
      shipping >= 0 &&
      Number.isInteger(percent) &&
      percent >= 0 &&
      percent <= 100 &&
      Number.isInteger(taxBps) &&
      taxBps >= 0 &&
      taxBps <= 10000,
    422,
    "Invalid pricing configuration.",
  );
  for (const l of lines)
    invariant(
      Number.isSafeInteger(l.price) &&
        l.price >= 0 &&
        Number.isInteger(l.quantity) &&
        l.quantity > 0 &&
        l.quantity <= 99,
      422,
      "Invalid cart line.",
    );
  const amounts = lines.map((l) => l.price * l.quantity);
  const subtotal = amounts.reduce((a, b) => a + b, 0);
  invariant(
    Number.isSafeInteger(subtotal),
    422,
    "Order subtotal exceeds supported range.",
  );
  const round = (n: bigint, d: bigint) => Number((n + d / 2n) / d);
  const discount = round(BigInt(subtotal) * BigInt(percent), 100n);
  const discounts = allocate(discount, amounts);
  const taxable = subtotal - discount + shipping;
  const tax = round(
    BigInt(taxable) * BigInt(taxBps),
    BigInt(inclusive ? 10000 + taxBps : 10000),
  );
  const total = taxable + (inclusive ? 0 : tax);
  invariant(
    Number.isSafeInteger(total),
    422,
    "Order total exceeds supported range.",
  );
  return {
    subtotal,
    discount,
    shipping,
    tax,
    total,
    discounts,
    taxInclusive: inclusive,
  };
}
