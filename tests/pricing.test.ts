import { describe, it, expect } from "vitest";
import { calculate, allocate } from "../src/domains/pricing";
import { canonical } from "../src/domains/identity";
import { csvCell } from "../src/domains/administration";
describe("deterministic commerce calculations", () => {
  it("allocates every discount fil with stable remainder ordering", () => {
    expect(allocate(5, [100, 100, 100])).toEqual([2, 2, 1]);
    expect(allocate(1, [1, 2, 3]).reduce((a, b) => a + b, 0)).toBe(1);
  });
  it("reconciles exclusive tax, shipping and a coupon", () => {
    expect(
      calculate(
        [
          { price: 10001, quantity: 3 },
          { price: 999, quantity: 1 },
        ],
        2500,
        10,
        500,
        false,
      ),
    ).toMatchObject({
      subtotal: 31002,
      discount: 3100,
      shipping: 2500,
      tax: 1520,
      total: 31922,
    });
  });
  it("extracts inclusive VAT without double charging", () => {
    expect(
      calculate([{ price: 10500, quantity: 1 }], 0, 0, 500, true),
    ).toMatchObject({ total: 10500, tax: 500 });
  });
  it("preserves every fil when intermediate products exceed Number precision", () => {
    const weights = [9999999900, 8888888800, 7777777700];
    const shares = allocate(12345678901, weights);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(12345678901);
    expect(shares.every(Number.isSafeInteger)).toBe(true);
  });
  it("rejects fractional and negative amounts or quantities", () => {
    expect(() => calculate([{ price: 1.5, quantity: 1 }], 0)).toThrow();
    expect(() => calculate([{ price: 100, quantity: 0 }], 0)).toThrow();
  });
  it("canonicalizes keys without changing array order", () => {
    expect(canonical({ b: 2, a: 1 })).toBe(canonical({ a: 1, b: 2 }));
    expect(canonical([1, 2])).not.toBe(canonical([2, 1]));
  });
  it("neutralizes spreadsheet formulas and escapes quotes", () => {
    expect(csvCell('=HYPERLINK("bad")')).toBe('"\'=HYPERLINK(""bad"")"');
  });
});
