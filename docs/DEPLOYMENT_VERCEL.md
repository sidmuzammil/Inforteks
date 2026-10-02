# Deploying Inforteks on Vercel

The repository includes Vercel's Next.js configuration. The application uses server-rendered pages and requires a reachable PostgreSQL database at runtime; it cannot run as a static export. The cloud development database is bound to its own loopback address and is not reachable from Vercel.

## Connect the repository

Import `sidmuzammil/Inforteks` into the intended Vercel account/team, select the repository root and Node.js 24. Vercel uses the pinned pnpm version and `vercel.json` commands. Builds generate Prisma without connecting to the database. Do not commit `.vercel`, `.env`, database snapshots or provider secrets.

The import page is `https://vercel.com/new`. Importing a repository is separate from a successful deployment; do not distribute a deployment link until its database-backed homepage works.

## Required services and private variables

| Variable                                   | Requirement                                                                                    |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                             | Reachable managed PostgreSQL; use the provider's connection-pooling URL for serverless traffic |
| `BETTER_AUTH_SECRET`                       | A private random secret of at least 32 characters                                              |
| `BETTER_AUTH_URL`                          | Exact HTTPS origin of the intended deployment/domain                                           |
| `APP_URL`                                  | Same canonical HTTPS origin for metadata and URLs                                              |
| `STORAGE_DRIVER`                           | `blob` for the configured private Vercel store, or `s3` for an external bucket                 |
| `BLOB_READ_WRITE_TOKEN`                    | Required for `blob`; supplied by the connected private Vercel store                            |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`    | Required only for `s3`: private bucket settings                                                |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Required only for `s3`: private bucket credentials                                             |
| `S3_FORCE_PATH_STYLE`                      | Set according to the bucket provider                                                           |
| `DEV_PAYMENT_SIMULATOR`                    | `false`                                                                                        |
| `OFFLINE_PAYMENTS_ENABLED`                 | `false` until the merchant has an operational offline payment process                          |

Set private application variables in Vercel Project Settings, with separate staging/production credentials where possible. The `.env.example` describes optional email and AI settings. Never paste private keys into chat or prefix them with `NEXT_PUBLIC_`.

Do not reuse the local database URL or copy the local `.env` into Vercel: it deliberately enables development behavior that production readiness rejects. Vercel's filesystem is ephemeral; product uploads use private Vercel Blob or S3 storage. The server and upload form limit images to 4 MB to leave multipart headroom beneath Vercel's request-size limit. `/api/ready` checks configuration and the database, not the live availability of every provider.

## Database and worker

Apply `pnpm db:migrate` against the intended remote database from a trusted deployment process before routing traffic. For a pooler with migration limitations, use the provider's direct database URL for the migration command only. Database migrations are deliberately not part of Vercel's build: preview builds must not mutate a shared production schema.

Create the first Owner with the documented secure bootstrap. Supply verified catalogue/business data for a real launch. Demonstration data is clearly labelled and production checkout rejects demonstration products. Missing payment providers do not result in simulated paid orders.

Run `pnpm worker` as a separate persistent service using the existing Docker/Railway configuration and the same intended database. Vercel HTTP functions do not run this application's continuous worker loop. Without a worker, imports, recovery email and AI jobs remain queued and reservation expiry is not processed. Do not describe those workflows as operational until the worker is running.

## Deployment verification

Check `/api/health`, `/api/ready`, the catalogue homepage, a product page, registration/login, customer order ownership and private draft media. Upload a test image to the configured private bucket and verify it survives a redeploy. Run a durable job through the worker. Live payments, executed refunds, courier integration and order-email delivery remain separate work described in the integration guide.

No successful Vercel deployment is claimed by the presence of this file. Account authorization, usable runtime services and verification of the resulting URL are required.

## Inforteks custom domain

The `inforteks` project in `muzammils-projects` has `inforteks.com` and `www.inforteks.com` attached. GoDaddy still manages DNS. Vercel recommended these records on 2026-10-02; recheck the project's Domains settings before applying them later:

| Type  | Name | Value                               |
| ----- | ---- | ----------------------------------- |
| A     | @    | 216.198.79.1                        |
| A     | @    | 64.29.17.1                          |
| CNAME | www  | 665b70cbb21cdc40.vercel-dns-017.com |

Preserve existing email records. Attaching the domain to Vercel does not update GoDaddy or deploy the application. After DNS verification and HTTPS are working, use `https://inforteks.com` for both `BETTER_AUTH_URL` and `APP_URL`, redirect `www` to the canonical domain, and redeploy. Test sign-in on the canonical origin. Staff access uses `/admin` in the same application and requires an authorized staff account.
