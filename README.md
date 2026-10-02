# Inforteks

A UAE electronics storefront and staff workspace built with Next.js, TypeScript, PostgreSQL, Prisma and Better Auth. The blue/navy identity is based on the supplied Inforteks logo. Business operations live in shared domain services, with permission checks, database constraints and explicit human approvals for sensitive changes.

This is a working development foundation, not an activated retail business. The seed catalogue contains **50 clearly marked demonstration products**. No live payment, courier, email or AI credentials are included. See [delivery status](docs/PROGRESS.md) for implemented features and remaining scope.

## Start development

Requirements: Node 24, Docker with Compose, Python 3, Bash, and network access to the npm registry, Docker registry and `binaries.prisma.sh`.

```bash
bash scripts/setup.sh
pnpm dev
```

Start the durable job worker in a second terminal:

```bash
pnpm worker
```

Setup installs pinned dependencies, prepares a checksum-verified Prisma engine, creates a private local `.env` if missing, starts PostgreSQL on loopback, deploys migrations, and seeds demonstration data. Repeating setup preserves existing configuration and records. It creates **no default administrator**. The local Docker database uses trust authentication and must remain bound to `127.0.0.1`; production must use a separate authenticated managed database.

The web service uses port 3000. `/api/health` checks the process; `/api/ready` checks runtime configuration and the database. Stop the web and worker with Ctrl-C. `docker stop inforteks-postgres` preserves the development volume. Do not remove that volume to resolve routine startup issues.

## Create the first Owner

Choose an email and password you control. These commands prompt for a hidden password without storing it in shell history:

```bash
read -r -p 'Owner email: ' BOOTSTRAP_EMAIL
read -r -p 'Owner name: ' BOOTSTRAP_NAME
read -r -s -p 'Owner password (12+ characters): ' BOOTSTRAP_PASSWORD
printf '\n'
export BOOTSTRAP_EMAIL BOOTSTRAP_NAME BOOTSTRAP_PASSWORD
pnpm bootstrap
unset BOOTSTRAP_EMAIL BOOTSTRAP_NAME BOOTSTRAP_PASSWORD
```

Sign in through `/login`, then open `/admin`. The bootstrap refuses to create another Owner once one exists. Owners create named staff accounts in the workspace; public registration always produces a customer. Test users are temporary and are removed by test teardown.

## Work on the project

| Location          | Responsibility                                                       |
| ----------------- | -------------------------------------------------------------------- |
| `src/app/(store)` | Server-rendered storefront, customer routes and product metadata     |
| `src/app/admin`   | Permission-filtered staff workspace                                  |
| `src/app/api`     | HTTP validation, authentication and response envelopes               |
| `src/domains`     | Catalogue, commerce, permissions, approvals, imports, AI and storage |
| `src/components`  | Reusable storefront and administration UI                            |
| `src/lib`         | Database/auth configuration, runtime validation and API registry     |
| `prisma`          | Relational schema and forward migrations                             |
| `scripts`         | Repeatable setup, bootstrap, worker and documentation generation     |
| `tests`           | Pricing tests, PostgreSQL integration tests and browser journeys     |
| `public`          | Brand artwork and original demonstration illustrations               |

Keep provider integrations on the server. Extend a domain service before exposing an operation through UI, REST or AI. Store money in integer AED fils; never trust client-calculated totals. Add migrations for schema changes instead of editing an applied migration. See [architecture](docs/ARCHITECTURE.md) and [data model](docs/DATA_MODEL.md).

## Verify changes

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm docs:generate
pnpm build
pnpm format:check
```

Integration tests use the separate `inforteks_test` database. Browser tests use the development catalogue and create temporary records: never point them at production. Playwright uses `/usr/bin/chromium` when available; otherwise install its browser with `pnpm exec playwright install --with-deps chromium`. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` can select an installed browser explicitly. Browser reports, local screenshots and traces are ignored by Git and can contain session or customer information.

The production build does not require a reachable database. Production readiness does require HTTPS authentication, a strong secret, private S3 storage and a database. Never turn on `DEV_PAYMENT_SIMULATOR` in production. See the [Railway deployment guide](docs/DEPLOYMENT_RAILWAY.md).

## Documentation

- [Research and reference audit](docs/REFERENCE_AUDIT.md)
- [Administrator guide](docs/ADMIN_GUIDE.md)
- [REST API guide](docs/API_GUIDE.md), [OpenAPI](docs/openapi.json) and [operation matrix](docs/OPERATION_MATRIX.md)
- [AI administration guide](docs/AI_ADMIN_GUIDE.md)
- [Vercel deployment](docs/DEPLOYMENT_VERCEL.md) and [Railway deployment](docs/DEPLOYMENT_RAILWAY.md)
- [Test report](docs/TEST_REPORT.md)
- [Remaining integrations](docs/INTEGRATIONS_LATER.md)
- [Original supplied brief](docs/BUILD_SPEC.md)

The brief is retained as source material. Its aspirations are tracked separately from verified implementation. Generated documentation comes from the operation registry and must be regenerated when endpoints change.

## Cloud environment persistence

Dependencies, source, local uploads and the ignored `.env` remain in the workspace. Docker and web/worker processes need restarting in later sessions. `bash scripts/snapshot-dev-db.sh` creates a private development database snapshot under `.data`; setup restores it only into an empty local database. A fresh remote checkout instead starts with the demo seed. Keep `.data`, `.env`, mailboxes and database snapshots private. Cloud configuration saving does not publish this source or deploy the application.
