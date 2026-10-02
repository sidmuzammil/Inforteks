# Railway deployment

Railway is the intended host for the storefront, admin, worker, PostgreSQL and private product media. Repository configuration is not evidence that an account has been provisioned. Remote deployment and domain verification remain required.

## Service layout

Use one Inforteks project with separate `staging` and `production` environments. Each environment must have its own database, media bucket and authentication secrets. Public registration never creates staff accounts.

| Service    | Source / configuration                                     | Exposure                                            | Initial connection budget                              |
| ---------- | ---------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------ |
| `web`      | `sidmuzammil/Inforteks`, Dockerfile, `.railway/railway.ts` | HTTPS storefront, customer account and `/admin`     | 10 per process                                         |
| `worker`   | Same commit and Dockerfile, `.railway/railway.ts`          | Private health endpoint; no public domain           | 3 per process                                          |
| `Postgres` | Railway PostgreSQL with persistent volume                  | Private network                                     | Reserve capacity for deployment overlap and operations |
| `media`    | Private Railway storage bucket                             | Authenticated S3 API; images served through the app | Not applicable                                         |

Railway's current Infrastructure as Code configuration is `.railway/railway.ts`, using the pinned `railway` SDK. The legacy per-service TOML format is deprecated and unavailable for new services. Select the intended project/environment, run `railway config plan`, inspect the exact changes, then run `railway config apply --yes`. This file owns the complete environment: removing a resource can delete it. Keep secret values out of source and plans shared with others.

Each environment requires its own cryptographically random `BETTER_AUTH_SECRET` shared variable, configured securely before deployment. The services reference it. The SDK's deterministic `ctx.randomString` helper must not be used for credentials. PostgreSQL, web and worker use Amsterdam, with an Amsterdam private bucket. Generated Railway hostnames supply the initial application origin.

Until Railway's GitHub App is granted access to `sidmuzammil/Inforteks`, deployment uses `railway up --service web --environment staging` from the reviewed checkout, followed by the worker after web readiness succeeds. Repeat for production only after staging verification. GitHub pushes alone do not apply infrastructure configuration. Once repository access is authorized, connect the source explicitly and continue applying infrastructure changes separately.

Web runs schema migrations as a pre-deploy step, then checks `/api/ready`. Worker starts with `node --import tsx scripts/worker.ts`, checks `/health`, and never runs migrations. Both configurations disable sleeping. Deploy web/migrations successfully before deploying a worker that depends on the new schema.

The image runs Next's generated standalone server with its public/static assets, honors Railway's `PORT`, binds to `0.0.0.0`, runs as the non-root `node` user and excludes `.env`, provider configuration, uploads and snapshots. Web receives termination signals directly. Worker shutdown stops claiming jobs, finishes its active job, then disconnects; its deployment allows 180 seconds to drain. Worker readiness requires successful database work and becomes unavailable during shutdown or after five minutes without progress.

Start with one web and one worker replica per active environment. This is a starting configuration, not a high-availability claim or proven traffic capacity. Scale after measuring query latency, pool saturation, CPU, memory and queue age. PostgreSQL locks protect inventory and job claims across processes. The connection budget is approximately `web replicas × 10 + worker replicas × 3`, plus deployment overlap and operational connections. Keep it below the database's configured capacity.

## Variables

Use Railway service references for credentials. The examples assume database service `Postgres` and bucket `media`; substitute the actual names. Never print resolved secrets or commit them.

| Variable                                | Value / requirement                                                                                            |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                          | `${{Postgres.DATABASE_URL}}`, using Railway's private network                                                  |
| `DIRECT_DATABASE_URL`                   | Optional direct PostgreSQL URL for migrations if `DATABASE_URL` uses PgBouncer; otherwise omit                 |
| `DATABASE_POOL_MAX`                     | `10` on web, `3` on worker                                                                                     |
| `DATABASE_CONNECT_TIMEOUT_MS`           | `5000`                                                                                                         |
| `DATABASE_IDLE_TIMEOUT_MS`              | `30000`                                                                                                        |
| `DATABASE_STATEMENT_TIMEOUT_MS`         | `30000`; tune with measured queries                                                                            |
| `DATABASE_APPLICATION_NAME`             | `inforteks-web` or `inforteks-worker`                                                                          |
| `BETTER_AUTH_SECRET`                    | Private random secret of at least 32 characters, shared by web/worker within one environment                   |
| `BETTER_AUTH_URL`, `APP_URL`            | Exact canonical HTTPS origin; initially the verified Railway hostname, then `https://inforteks.com` at cutover |
| `STORAGE_DRIVER`                        | `s3`                                                                                                           |
| `S3_ENDPOINT`                           | `${{media.ENDPOINT}}`                                                                                          |
| `S3_REGION`                             | `${{media.REGION}}`                                                                                            |
| `S3_BUCKET`                             | `${{media.BUCKET}}`                                                                                            |
| `S3_ACCESS_KEY_ID`                      | `${{media.ACCESS_KEY_ID}}`                                                                                     |
| `S3_SECRET_ACCESS_KEY`                  | `${{media.SECRET_ACCESS_KEY}}`                                                                                 |
| `S3_FORCE_PATH_STYLE`                   | `true`                                                                                                         |
| `DEV_PAYMENT_SIMULATOR`                 | `false`                                                                                                        |
| `OFFLINE_PAYMENTS_ENABLED`              | `false` until an operational offline payment method is approved                                                |
| `EMAIL_PROVIDER`                        | `disabled` until a verified live sender is configured                                                          |
| `WORKER_POLL_MS`, `WORKER_MAX_ATTEMPTS` | `3000`, `3`                                                                                                    |

Optional email/AI variables are documented in `.env.example`. Missing providers remain disconnected. Readiness verifies application/database health, not successful payment, email or storage transactions.

Never run `setup.sh`, `db:seed` or browser tests against production. Development setup requires a loopback `inforteks` database. Integration tests override both runtime and migration URLs with `inforteks_test`, preventing an inherited direct production URL from redirecting test migrations.

## Migration and cutover

1. Inspect the existing Railway workspace, billing limits and Inforteks resources before creating anything. Back up an existing database before modifying it. Preserve unrelated projects.
2. Validate staging with isolated resources: migrations, private media, a durable import, shutdown behavior and a backup restore.
3. Provision production resources, configure backups/variables, and deploy schema/web before worker. Builds require no live database or runtime secrets. Application traffic uses the private database address.
4. Inventory the migration source. The Vercel attempt in this task had no operational database; the local 50-product catalogue is demonstration data, not merchant stock. Preserve the local snapshot separately. If an existing real database is identified, take a consistent backup plus media objects, verify row counts/ownership, and rehearse restoration. Preserve media keys and verify hashes when moving objects between Blob and S3.
5. Securely create the first Owner using `pnpm bootstrap` with the intended identity/password through private environment bindings or a hidden-input terminal. There is no default staff password. Configure business details, policies, shipping/tax rules and verified products.
6. Verify Railway's generated HTTPS hostname before domain cutover. Add `inforteks.com` and `www.inforteks.com` to **web only** and obtain Railway's actual DNS instructions. The previous Vercel A/CNAME records are not Railway records. Change website records in GoDaddy, preserve mail records and configure a canonical-domain redirect. Never invent a Railway hostname or IP.
7. After domain verification and HTTPS succeed, set both canonical-origin variables, redeploy, and verify sign-in/cookies. Keep the previous host and objects until migration checks pass; then retire only superseded Inforteks resources.

Card payments, executed refunds, courier automation and order-email delivery still need provider integrations. Hosting this code does not activate those operations. Production checkout rejects demonstration products.

## Recovery and monitoring

Follow [operations](OPERATIONS.md) for backup schedules, restore checks, monitoring, rollback and launch evidence. A database volume alone is not a backup; deployment health checks are not ongoing uptime monitoring.

Railway's Docker builder supports cache mounts but rejects BuildKit secret mounts. The deployment Dockerfile uses the base image's trusted CA bundle and keeps TLS verification enabled. Builds behind an enterprise proxy need a separately configured trusted build environment; do not copy proxy credentials or certificates into the production image.
