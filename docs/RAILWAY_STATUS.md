# Railway deployment record

Verified on 3 October 2026 UTC. This records observed deployment state, not a completed retail launch.

- Project: [Inforteks](https://railway.com/project/6c12fe47-eca9-4d35-86b1-8e21e853b941), in the connected Pro workspace.
- Production: <https://web-production-b6327.up.railway.app>
- Staging: <https://web-staging-4569.up.railway.app>
- Staff sign-in: <https://web-production-b6327.up.railway.app/admin/login>
- Application source deployed: `43ae21b469bf6a59e92c4d4d9bbc1c64f53f39c7`. GitHub repository: `sidmuzammil/Inforteks`, branch `main`. Later documentation/CI-only commits do not change the deployed application.

## Verified

Both environments have separate PostgreSQL data, database credentials, authentication secrets, and private media buckets. Web, worker and PostgreSQL deployments passed Railway health checks. All six application migrations succeeded in both environments, including the additive homepage-banner migration, unique provider/account identity index and merchant section settings/media relations. Only web has public HTTPS hostnames; worker and PostgreSQL use private networking. Application placement is one replica per service in Amsterdam.

| Environment | Service | Successful deployment                  |
| ----------- | ------- | -------------------------------------- |
| Staging     | Web     | `db2f59bc-3092-4e83-902d-14b71286db08` |
| Staging     | Worker  | `27f1b0ff-ab10-41d4-ae24-8d349d4f2d04` |
| Production  | Web     | `097878cb-bdd3-4036-b9c0-6e70847ee8a8` |
| Production  | Worker  | `2057a653-7530-4450-81a6-da68af6c4503` |

The merchant editor release removes the language control, fixes first-category creation, supports initial product image uploads and AED current/previous prices, and exposes featured selection and product organization/SEO fields. Full hero/side banners, CTA and sanitized HTML sections share the exact storefront renderer with isolated desktop/mobile previews. Four editable production homepage templates are present; empty product sections stay hidden. No production catalogue seed or dummy product was created.

The real Owner opened the new-product form and every configured homepage editor. Authenticated HTML preview returned sanitized content without saving a record; anonymous preview was denied. Verification used the existing Owner in short-lived sessions that were signed out.

Current release checks passed on staging and production for homepage, readiness, customer and staff login, registration, cart, checkout, comparison and categories. The header contains the four delivery countries and permits same-origin browser geolocation. The comparison API safely reports an unavailable SKU; Google and AI remain gated and production payment methods remain empty. Anonymous `/admin` and `/admin/products` requests redirected to `/admin/login`. The real Owner signed in and opened the workspace, staff, product, order and homepage-section pages successfully, then signed out. No production browser suite or development seed was run.

The requested `sales@inforteks.com` Owner was created with a unique cryptographically generated password. Temporary bootstrap variables were removed and the normal `pnpm db:migrate` pre-deploy command restored. Credentials were delivered through a private local file excluded from Git and deployment uploads. Never print, reset or recreate this Owner as part of future setup.

Inforteks is a single-merchant store. Public registration creates customer accounts only. Staff use dedicated sign-in without registration; the Owner creates named colleagues and assigns or revokes role presets. Server permissions protect product management, stock, homepage banners, content and other modules. See ADMIN_GUIDE.md.

Temporary object upload, authenticated read and deletion were rechecked on 3 October against both Railway media buckets, with temporary objects removed. A full remote browser media journey and anonymous bucket-access check were not performed; local browser tests covered image validation and private-to-public banner publication.

PITR configuration is enabled in both environments. Production has daily, weekly and monthly backup schedules; staging has daily and weekly schedules. Named snapshots `production-after-migrations` and `staging-after-migrations` were created and listed successfully. Before the fourth migration, production snapshot `before-account-and-banner-release` (`a3a0c012-2042-4d01-9471-486adf990fd5`) was created and verified. Before the fifth migration, production snapshot `before-google-identity-release` (`7b69d1c8-faf0-402b-a477-b4f714a6fc92`) was created and listed at `2026-10-02T19:52:06.563Z`. Before migration six, snapshot `before-merchant-editor-release` (`97defc40-36dd-4cdb-a704-06b1abc174c1`) was created and listed at `2026-10-03T05:59:37.499Z`. Continuous WAL coverage and a restore rehearsal still require verification; enabling PITR is not proof of a successful restore.

The merchant editor release passed 63 unit/integration tests and all 19 Chromium journeys against local data. All 69 documented staff API operations denied anonymous/customer access. Dummy product images, featured/discounted publication, stock approvals, checkout/replay, fulfillment, return/restocking and isolated HTML/hero previews were verified. Type checking, lint, formatting, the production build and OpenAPI validation for 98 operations passed.

GitHub Actions [run 37102474211](https://github.com/sidmuzammil/Inforteks/actions/runs/37102474211) passed fresh setup, static/database checks, all browser journeys and the production build on the exact deployed application commit `43ae21b469bf6a59e92c4d4d9bbc1c64f53f39c7`. Fresh setup now waits for a real TCP query to the application database; this fixes the temporary PostgreSQL initialization-server race exposed by CI. Both a fresh isolated disposable database and the existing development database passed this readiness check.

## Remaining launch steps

1. Finish DNS and HTTPS verification. GoDaddy does not support the apex CNAME flattening required by Railway. The straightforward route is `www.inforteks.com` on Railway, with GoDaddy forwarding `inforteks.com` to it using a permanent unmasked HTTPS redirect. Keep mail records intact. A fresh Railway domain-status check still reports the `www` CNAME pointing to `inforteks.com`, with DNS update and ownership validation pending. GoDaddy access is not exposed in this session. Railway requires:

   | Type  | Name                  | Value                                                                             |
   | ----- | --------------------- | --------------------------------------------------------------------------------- |
   | CNAME | `www`                 | `aydctqnk.up.railway.app`                                                         |
   | TXT   | `_railway-verify.www` | `railway-verify=cd0be31f8624abb7353911e1480661008aa16a371beb260695b0df24d07f3fd2` |

   After Railway reports verified DNS and a valid certificate, set both web and worker canonical origins (`APP_URL`, `BETTER_AUTH_URL`) to `https://www.inforteks.com`, update the infrastructure file, redeploy, and verify sign-in. Until then, use the generated production hostname. An apex Railway domain is also reserved, but it needs a DNS provider with flattening if chosen as the canonical host instead.

2. Connect authorized email sending. Microsoft 365 hosts the existing mailbox, but no sending credential/provider authorization is available to the application. `EMAIL_PROVIDER=disabled` remains explicit; recovery reports unavailable instead of claiming an email was sent. A verified Resend sender and a worker-only `RESEND_API_KEY`, plus matching sender/provider configuration on web and worker, are required for the existing adapter. Preserve Microsoft 365 MX records and verify actual delivery before requiring customer email verification.
3. Activate Google customer sign-in with an authorized Firebase-linked Google Cloud OAuth web client and the exact callback URLs in GOOGLE_SIGN_IN.md. No callable Firebase plugin capability or authenticated Firebase CLI account is currently exposed; the CLI login endpoint was blocked by the cloud proxy. Both web environments lack Google OAuth credentials, so the customer Google button stays hidden. Local mocked-exchange tests do not prove live Google consent.
4. Optional AI comparison requires explicit enablement and web-side OpenAI credentials/model. Ordinary live specification comparison works independently. No paid AI response was verified.
5. Grant Railway's GitHub App access to `sidmuzammil/Inforteks` before enabling GitHub autodeploys. Current deployments use an authorized CLI upload. Apply infrastructure changes separately from application source pushes.
6. Verify real merchant products, policies and operational payment/shipping integrations before accepting orders. Production was not seeded with development products, customers or orders. Live card payments and courier automation remain disconnected.
7. Complete a Railway restore rehearsal, monitoring and load review. Custom-domain requests remain blocked from this cloud session and SSH hostname resolution is unavailable. The generated Railway hostname and bucket operations are reachable.

## Configuration notes

`.railway/railway.ts` uses the named `inforteks` partial to preserve Railway-managed PITR buckets outside its ownership. Staging media is `media`; production media is `media-production`. Review every plan for unexpected deletions.

CLI 5.63.1 may show default restart/sleep settings as drift even though the service API reports `ON_FAILURE`, 10 retries and sleeping disabled. Do not repeatedly redeploy solely for those default-value differences. The `environment edit` command prioritizes piped JSON over flags when stdin is not a terminal; use a reviewed JSON patch for automation. Inspect live configuration and the final deployment after applying placement changes.

At the user’s request, duplicate Vercel project `inforteks-4akw` was deleted after confirming it had no variables or custom domains. Project `inforteks` remains in `muzammils-projects`; its homepage, nested paths and query strings were verified to redirect with HTTP 307 to Railway. The previous Vercel private Blob store remains retained. No live source database was present in that Vercel attempt; the local development snapshot remains private and separate.

Web and worker origins are pinned explicitly to the verified generated Railway hostnames. Attaching an unverified custom domain can change `RAILWAY_PUBLIC_DOMAIN`; do not derive authentication origins from that variable until a deliberate domain cutover.
