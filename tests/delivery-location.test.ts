import { describe, expect, it } from "vitest";
import {
  countryAt,
  parseDeliveryLocation,
  comingSoon,
} from "../src/lib/delivery-location";
import { checkoutInput } from "../src/domains/commerce";

describe("country suggestions and delivery availability", () => {
  it("identifies representative Gulf locations without confusing nearby countries", async () => {
    for (const [lat, lon, code] of [
      [25.2048, 55.2708, "AE"],
      [24.4539, 54.3773, "AE"],
      [24.7136, 46.6753, "SA"],
      [21.4858, 39.1925, "SA"],
      [25.2854, 51.531, "QA"],
      [23.588, 58.3829, "OM"],
      [26.18, 56.24, "OM"],
      [51.5074, -0.1278, null],
      [NaN, 55, null],
    ] as const)
      expect(await countryAt(lat, lon)).toBe(code);
  });
  it("rejects invalid persisted locations and accepts only UAE checkout", () => {
    expect(parseDeliveryLocation("broken")).toBeNull();
    expect(
      parseDeliveryLocation(
        JSON.stringify({ country: "US", source: "manual" }),
      ),
    ).toBeNull();
    expect(
      parseDeliveryLocation(
        JSON.stringify({
          country: "AE",
          emirate: "Dubai",
          source: "manual",
          latitude: 25,
        }),
      ),
    ).toEqual({ country: "AE", emirate: "Dubai", source: "manual" });
    expect(comingSoon("QA")).toContain("haven’t started operations in Qatar");
    const input = {
      email: "location@example.test",
      address: {
        name: "Test Customer",
        phone: "+971501234567",
        emirate: "Dubai",
        city: "Dubai",
        line1: "Development building",
      },
      paymentMethod: "SIMULATOR",
    };
    expect(checkoutInput.parse(input).country).toBe("AE");
    expect(checkoutInput.safeParse({ ...input, country: "SA" }).success).toBe(
      false,
    );
  });
});
