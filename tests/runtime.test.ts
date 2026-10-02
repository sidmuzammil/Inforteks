import { afterEach, describe, expect, it, vi } from "vitest";
import { validateRuntime } from "../src/lib/runtime";

afterEach(() => vi.unstubAllEnvs());

function production() {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("DATABASE_URL", "postgresql://test@localhost/inforteks_test");
  vi.stubEnv("BETTER_AUTH_URL", "https://inforteks.example.test");
  vi.stubEnv(
    "BETTER_AUTH_SECRET",
    "test-only-secret-with-at-least-thirty-two-characters",
  );
  vi.stubEnv("DEV_PAYMENT_SIMULATOR", "false");
}

describe("production storage readiness", () => {
  it("accepts private Blob configuration and rejects a missing credential", () => {
    production();
    vi.stubEnv("STORAGE_DRIVER", "blob");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "test-only-placeholder");
    expect(validateRuntime().STORAGE_DRIVER).toBe("blob");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    expect(validateRuntime).toThrow();
  });

  it("rejects ephemeral storage and simulated payments in production", () => {
    production();
    vi.stubEnv("STORAGE_DRIVER", "local");
    expect(validateRuntime).toThrow("private object storage");
    vi.stubEnv("STORAGE_DRIVER", "blob");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "test-only-placeholder");
    vi.stubEnv("DEV_PAYMENT_SIMULATOR", "true");
    expect(validateRuntime).toThrow("Development payments are forbidden");
  });
});
