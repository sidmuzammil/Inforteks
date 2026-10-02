import {
  bucket,
  defineRailway,
  postgres,
  project,
  ref,
  service,
} from "railway/iac";

// Own application resources while leaving Railway-managed PITR backup buckets
// outside this partial. Removing an owned resource can still delete its data.
export const partial = "inforteks";

// Staging and production have separate data, storage and authentication secrets.
export default defineRailway((ctx) => {
  if (!["staging", "production"].includes(ctx.environment ?? "")) {
    throw new Error("Select the Inforteks staging or production environment.");
  }

  const database = postgres("Postgres", { region: "europe-west4" });
  const media = bucket(
    ctx.isEnvironment("production") ? "media-production" : "media",
    {
      region: "ams",
    },
  );
  // Attaching an unverified custom domain can change RAILWAY_PUBLIC_DOMAIN.
  // Pin the working origin until custom-domain DNS and HTTPS are verified.
  const origin = ctx.isEnvironment("production")
    ? "https://web-production-b6327.up.railway.app"
    : "https://web-staging-4569.up.railway.app";
  const common = {
    NODE_ENV: "production",
    DATABASE_URL: database.env.DATABASE_URL,
    DATABASE_CONNECT_TIMEOUT_MS: "5000",
    DATABASE_IDLE_TIMEOUT_MS: "30000",
    DATABASE_STATEMENT_TIMEOUT_MS: "30000",
    BETTER_AUTH_SECRET: ctx.shared.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: origin,
    APP_URL: origin,
    STORAGE_DRIVER: "s3",
    S3_ENDPOINT: ref(media, "ENDPOINT"),
    S3_REGION: ref(media, "REGION"),
    S3_BUCKET: ref(media, "BUCKET"),
    S3_ACCESS_KEY_ID: ref(media, "ACCESS_KEY_ID"),
    S3_SECRET_ACCESS_KEY: ref(media, "SECRET_ACCESS_KEY"),
    S3_FORCE_PATH_STYLE: "true",
    DEV_PAYMENT_SIMULATOR: "false",
    OFFLINE_PAYMENTS_ENABLED: "false",
    EMAIL_PROVIDER: "disabled",
  };
  const build = {
    builder: "DOCKERFILE",
    dockerfilePath: "Dockerfile",
  } as const;
  const deploy = {
    sleepApplication: false,
    restartPolicyType: "ON_FAILURE",
    restartPolicyMaxRetries: 10,
    multiRegionConfig: { "europe-west4-drams3a": { numReplicas: 1 } },
  } as const;

  // Source is uploaded with `railway up` until the Railway GitHub App is granted
  // access to sidmuzammil/Inforteks. No repository credentials belong here.
  const web = service("web", {
    build,
    start: "node .next/standalone/server.js",
    preDeploy: "pnpm db:migrate",
    healthcheck: "/api/ready",
    healthcheckTimeout: 120,
    deploy: { ...deploy, overlapSeconds: 15, drainingSeconds: 120 },
    env: {
      ...common,
      PORT: "3000",
      DATABASE_POOL_MAX: "10",
      DATABASE_APPLICATION_NAME: `inforteks-${ctx.environment}-web`,
    },
  });
  const worker = service("worker", {
    build,
    start: "node --import tsx scripts/worker.ts",
    healthcheck: "/health",
    healthcheckTimeout: 120,
    deploy: { ...deploy, overlapSeconds: 0, drainingSeconds: 180 },
    env: {
      ...common,
      PORT: "8081",
      DATABASE_POOL_MAX: "3",
      DATABASE_APPLICATION_NAME: `inforteks-${ctx.environment}-worker`,
      WORKER_POLL_MS: "3000",
      WORKER_MAX_ATTEMPTS: "3",
    },
  });
  return project("Inforteks", { resources: [database, media, web, worker] });
});
