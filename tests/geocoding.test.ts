import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/domains/identity", () => ({ rateLimit: vi.fn() }));
import {
  lookupAddress,
  parseAddressSuggestion,
} from "../src/domains/geocoding";
import { rateLimit } from "../src/domains/identity";
const part = (type: string, long_name: string, short_name = long_name) => ({
  types: [type],
  long_name,
  short_name,
});
const response = {
  status: "OK",
  results: [
    {
      types: ["street_address"],
      address_components: [
        part("country", "United Arab Emirates", "AE"),
        part("administrative_area_level_1", "Dubai"),
        part("locality", "Dubai"),
        part("neighborhood", "Downtown Dubai"),
        part("sublocality_level_1", "Business district"),
        part("route", "Test Street"),
      ],
    },
  ],
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
describe("optional consent-based address lookup", () => {
  it("maps explicit provider fields without fabricating postal codes or building details", () => {
    expect(parseAddressSuggestion(response)).toEqual({
      emirate: "Dubai",
      city: "Dubai",
      area: "Downtown Dubai",
      zone: "Business district",
      line1: "Test Street",
    });
    expect(parseAddressSuggestion({ status: "ZERO_RESULTS" })).toBeNull();
    expect(() =>
      parseAddressSuggestion({
        status: "OK",
        results: [{ address_components: [part("country", "Qatar", "QA")] }],
      }),
    ).toThrow("UAE only");
  });
  it("requires consent and configured credentials before making a network call", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    vi.stubEnv("ADDRESS_LOOKUP_ENABLED", "false");
    await expect(
      lookupAddress({ latitude: 25, longitude: 55, consent: false }, "test"),
    ).rejects.toThrow();
    await expect(
      lookupAddress({ latitude: 25, longitude: 55, consent: true }, "test"),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("uses the fixed provider with bounded usage and hides provider errors", async () => {
    vi.stubEnv("ADDRESS_LOOKUP_ENABLED", "true");
    vi.stubEnv("GOOGLE_GEOCODING_API_KEY", "test-only-geocoding-key");
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(response)));
    vi.stubGlobal("fetch", fetch);
    const result = await lookupAddress(
      { latitude: 25.1972, longitude: 55.2744, consent: true },
      "fixture",
    );
    expect(result.attribution).toBe("Google Maps");
    expect(rateLimit).toHaveBeenCalledWith("geocode:fixture", 5);
    expect(rateLimit).toHaveBeenCalledWith(
      "geocode:store:daily",
      1000,
      86400000,
    );
    const url = fetch.mock.calls[0][0] as URL;
    expect(url.origin).toBe("https://maps.googleapis.com");
    expect(fetch.mock.calls[0][1]).toMatchObject({
      cache: "no-store",
      redirect: "error",
    });
    fetch.mockRejectedValue(new Error("private key and coordinates"));
    await expect(
      lookupAddress({ latitude: 25, longitude: 55, consent: true }, "fixture"),
    ).rejects.toMatchObject({
      status: 503,
      message: "Address lookup is unavailable. Enter your address manually.",
    });
  });
});
