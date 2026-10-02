import { z } from "zod";

const positive = (fallback: number, max: number) =>
  z.coerce.number().int().min(1).max(max).default(fallback);

export function databasePoolConfig(
  env: Record<string, string | undefined> = process.env,
) {
  const options = z
    .object({
      DATABASE_POOL_MAX: positive(10, 100),
      DATABASE_CONNECT_TIMEOUT_MS: positive(5000, 60000),
      DATABASE_IDLE_TIMEOUT_MS: positive(30000, 300000),
      DATABASE_STATEMENT_TIMEOUT_MS: positive(30000, 300000),
      DATABASE_APPLICATION_NAME: z.string().min(1).max(63).default("inforteks"),
    })
    .parse(env);
  return {
    connectionString: env.DATABASE_URL,
    max: options.DATABASE_POOL_MAX,
    connectionTimeoutMillis: options.DATABASE_CONNECT_TIMEOUT_MS,
    idleTimeoutMillis: options.DATABASE_IDLE_TIMEOUT_MS,
    statement_timeout: options.DATABASE_STATEMENT_TIMEOUT_MS,
    application_name: options.DATABASE_APPLICATION_NAME,
  };
}
