import "dotenv/config";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { databasePoolConfig } from "../src/lib/database-config";

describe("database resource limits", () => {
  it("rejects invalid or excessive pool sizes instead of silently ignoring them", () => {
    for (const max of ["0", "-1", "5000", "many"]) {
      expect(() => databasePoolConfig({ DATABASE_POOL_MAX: max })).toThrow();
    }
  });

  it("cancels an overlong statement and keeps its connection usable", async () => {
    if (!process.env.DATABASE_URL?.includes("inforteks_test")) {
      throw new Error(
        "Database checks require the isolated inforteks_test database.",
      );
    }
    const pool = new Pool(
      databasePoolConfig({
        DATABASE_URL: process.env.DATABASE_URL,
        DATABASE_POOL_MAX: "1",
        DATABASE_STATEMENT_TIMEOUT_MS: "50",
        DATABASE_APPLICATION_NAME: "inforteks-timeout-check",
      }),
    );
    try {
      await expect(pool.query("SELECT pg_sleep(0.2)")).rejects.toMatchObject({
        code: "57014",
      });
      expect((await pool.query("SELECT 1 AS ok")).rows[0].ok).toBe(1);
    } finally {
      await pool.end();
    }
  });
});
