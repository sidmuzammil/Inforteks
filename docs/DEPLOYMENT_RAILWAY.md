# Railway deployment

Deployment files are prepared; **nothing has been deployed or published**. Use separate staging and production databases, buckets and secrets. Do not deploy the demo database as a live shop.

## Services

1. Provision managed PostgreSQL and a private S3-compatible bucket. Use authenticated credentials and enable backups.
2. Create the web service from this repository's Dockerfile. `railway.toml` sets `pnpm db:migrate` as the pre-deploy command and `/api/ready` as the health check. The image honors Railway's `PORT` and listens on `0.0.0.0`.
3. Create a worker service from the same source/image with start command `pnpm worker`. Disable the HTTP health check for this service. Run migrations through the web deployment, and deploy the worker after compatible schema changes.
4. Configure the private variables below on both services as applicable. Builds generate Prisma and Next output without querying a live database. Migration credentials belong at deploy/runtime, not in image layers.

| Variable                                         | Production value                                                     |
| ------------------------------------------------ | -------------------------------------------------------------------- |
| `DATABASE_URL`                                   | Managed PostgreSQL connection string                                 |
| `BETTER_AUTH_SECRET`                             | Random secret of at least 32 characters, stored privately            |
| `BETTER_AUTH_URL`, `APP_URL`                     | Exact canonical HTTPS origin                                         |
| `STORAGE_DRIVER`                                 | `s3`                                                                 |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`          | Private bucket connection details                                    |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`       | Private bucket credentials                                           |
| `S3_FORCE_PATH_STYLE`                            | Provider-specific; `true` for compatible path-style endpoints        |
| `DEV_PAYMENT_SIMULATOR`                          | `false`                                                              |
| `OFFLINE_PAYMENTS_ENABLED`                       | `false` until the merchant has an operational offline process        |
| `EMAIL_PROVIDER`, `EMAIL_FROM`, `RESEND_API_KEY` | `resend`, verified sender and private key if enabling recovery email |
| AI variables                                     | Optional; see AI guide                                               |

`NEXT_PUBLIC_APP_URL` is a local fallback; prefer server-side `APP_URL` for deployment metadata. Never place secrets under `NEXT_PUBLIC_`. The readiness route checks configuration and the database, not a live transaction through every external provider. Provider presence in the admin screen is not proof of connectivity.

The Docker runtime runs as the `node` user. It intentionally retains Prisma CLI, TypeScript worker tooling and migrations so one image supports web, migration and worker commands. This is larger than a minimal web-only image; splitting production images is a later optimization. The image was built and smoke-tested locally. The Railway lifecycle has not been exercised against a remote account.

For a network with an enterprise TLS proxy, the Dockerfile accepts an optional BuildKit secret: `docker build --secret id=build_ca,src=/path/to/trusted-ca-bundle.pem .`. It is mounted only for dependency downloads and is not copied into the image. The cloud verification also needed the proxy hostname resolved inside BuildKit. Do not disable certificate verification to work around proxy setup.

## Launch sequence

After staging is healthy, securely run the Owner bootstrap once. Configure actual merchant identity, approved policies, tax registration/rules, delivery zones and prices. Import verified products and images, set real inventory and publish through approval. Remove or archive demonstration products; production checkout rejects products flagged as demonstration data.

Payment collection remains disabled until an adapter or an approved operational offline method is configured. Card payments need signed, deduplicated webhook processing, reconciliation and tested refunds before use. The current refund execution route does not move money.

Test the canonical domain, cookie login/logout/recovery, private draft media, image persistence across redeployment, representative checkout/order ownership, reservation expiry, worker job outcomes and backup restore. Configure monitoring for failed/blocked jobs and database/bucket capacity. These deployment checks remain future work requiring real infrastructure; passing a local build does not satisfy them.

## Rollback and recovery

Back up PostgreSQL and bucket objects together. Keep migrations backward compatible when web/worker revisions overlap. Roll back application code only to a version compatible with the deployed schema; do not edit an applied migration or run destructive resets against production. Restore backups into a separate environment and verify before cutover. The development snapshot script is not a production backup system.
