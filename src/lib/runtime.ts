import { z } from "zod";
export function validateRuntime() {
  const config = z
    .object({
      DATABASE_URL: z.url(),
      BETTER_AUTH_URL: z.url(),
      BETTER_AUTH_SECRET: z.string().min(32),
      STORAGE_DRIVER: z.enum(["local", "s3", "blob"]).default("local"),
    })
    .parse(process.env);
  if (process.env.NODE_ENV === "production") {
    if (process.env.DEV_PAYMENT_SIMULATOR === "true")
      throw new Error("Development payments are forbidden in production.");
    if (!config.BETTER_AUTH_URL.startsWith("https://"))
      throw new Error("Production authentication requires HTTPS.");
    if (config.STORAGE_DRIVER === "local")
      throw new Error("Production requires private object storage.");
  }
  if (config.STORAGE_DRIVER === "s3") {
    z.object({
      S3_ENDPOINT: z.url(),
      S3_BUCKET: z.string().min(1),
      S3_ACCESS_KEY_ID: z.string().min(1),
      S3_SECRET_ACCESS_KEY: z.string().min(1),
    }).parse(process.env);
  }
  if (config.STORAGE_DRIVER === "blob") {
    z.object({ BLOB_READ_WRITE_TOKEN: z.string().min(1) }).parse(process.env);
  }
  return config;
}
