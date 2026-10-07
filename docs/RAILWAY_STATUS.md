# Railway deployment record

Verified on 7 October 2026 UTC. This records observed deployment state, not a completed retail launch.

- Project: [Inforteks](https://railway.com/project/6c12fe47-eca9-4d35-86b1-8e21e853b941), in the connected Pro workspace.
- Production: <https://web-production-b6327.up.railway.app>
- Staging: <https://web-staging-4569.up.railway.app>
- Staff sign-in: <https://web-production-b6327.up.railway.app/admin/login>
- Production and staging application source: `4e3b81d9368a422f016864612652ca9f3e956882` (Direct Sales and Online Store workspaces, office visits and shared-stock order entry). GitHub repository: `sidmuzammil/Inforteks`, branch `main`. Later test/documentation changes do not require application redeployment.

## Verified

Both environments have separate PostgreSQL data, database credentials, authentication secrets, and private media buckets. Web, worker and PostgreSQL deployments passed Railway health checks. All eight application migrations succeeded in both environments, including the additive homepage-banner migration, unique provider/account identity index, merchant section settings/media relations nullable delivery-address fields and Direct Sales customer/visit/channel fields. Only web has public HTTPS hostnames; worker and PostgreSQL use private networking. Application placement is one replica per service in Amsterdam.

| Environment | Service | Successful deployment                  |
| ----------- | ------- | -------------------------------------- |
| Staging     | Web     | `03017de3-262f-4e90-90be-aaf065245915` |
| Staging     | Worker  | `9fa58b7f-54a2-480f-abd8-1d704706456b` |
| Production  | Web     | `3759d32f-7586-4b82-9ea2-95bdf773a5f9` |
| Production  | Worker  | `2f969c1d-fd73-4db2-a9f0-098a98cf095f` |

The delivery-address release adds separate city, area, optional zone/postal code and landmark fields, owned address-book editing/deletion, saved-address selection at checkout and a customer-confirmed GPS pin. The written address and optional pin are preserved in each order snapshot and displayed to authorized staff. Existing orders are not changed by address edits. The live Owner opened the new address editor and its scripts, queried the migrated address schema, checked staff pages and signed out; no production customer, address, pin or order was created or changed by verification. Both web deployments passed readiness and access/provider-gate checks. Browser and unit/integration verification used local data; optional Google responses were fixtures. Google Geocoding remains disabled because no key is connected. The user reports enabling Google billing, but this session cannot inspect that billing account. Activation instructions are in DELIVERY_LOCATION.md.

GitHub Actions [run 37119151669](https://github.com/sidmuzammil/Inforteks/actions/runs/37119151669) passed setup, static/database checks, all 22 browser journeys and the production build on the earlier delivery-address application source. The 74 unit/integration tests cover private address ownership, confirmation requirements, field persistence, checkout snapshots and optional provider failure paths. The longer suite respects the real sign-in rate limit by waiting for its retry window. No authentication limit was weakened.

Before migration seven, production snapshot `before-delivery-address-release` (`281e27a6-5c29-4aac-b7b8-795e2b32ecdd`) was created and listed at `2026-10-03T11:00:57.225Z`. The migration adds only nullable columns; workers were not redeployed. A restore rehearsal remains unverified.

The product image editor now supports selecting the main image, moving existing images earlier/later and editing their descriptions without re-uploading. Saves check permissions and product versions, preserve original objects and publication flags, and update the storefront, offers and cart consistently. Concurrent uploads append under the product lock. The existing Owner opened the live five-image product editor: all controls, five original assets and eleven editor scripts were accessible, and public/admin image order agreed. Verification was read-only for products and media; the session was signed out. No migration or worker deployment was needed. GitHub Actions [run 37112237288](https://github.com/sidmuzammil/Inforteks/actions/runs/37112237288) passed setup, static/database checks, all 20 browser journeys and the production build on `8903687ee908e725d81cd64e07ebe20b05c9e1f3`, which added only CI diagnostics and test updates after the image release’s application source.

The merchant editor release removes the language control, fixes first-category creation, supports initial product image uploads and AED current/previous prices, and exposes featured selection and product organization/SEO fields. Full hero/side banners, CTA and sanitized HTML sections share the exact storefront renderer with isolated desktop/mobile previews. Four editable production homepage templates are present; empty product sections stay hidden. No production catalogue seed or dummy product was created.

The real Owner opened the new-product form and every configured homepage editor. Authenticated HTML preview returned sanitized content without saving a record; anonymous preview was denied. Verification used the existing Owner in short-lived sessions that were signed out.

Merchant release checks passed on staging and production for homepage, readiness, customer and staff login, registration, cart, checkout, comparison and categories. The header contains the four delivery countries and permits same-origin browser geolocation. The comparison API safely reports an unavailable SKU; AI remains gated and production payment methods remain empty. Anonymous `/admin` and `/admin/products` requests redirected to `/admin/login`. The real Owner signed in and opened the workspace, staff, product, order and homepage-section pages successfully, then signed out. No production browser suite or development seed was run.

Production Google customer sign-in was configured on 3 October using the existing Firebase-linked Google Cloud project `inforteks-3da17`. Credentials are direct production web-service variables; staging remains unconfigured. Live checks verified the customer buttons, their absence on staff login, readiness, cross-origin rejection, exact callback, S256 PKCE, basic identity scopes, secure HTTP-only cookies, `no-store` and `no-referrer` headers, Google's sign-in page, and safe cancellation without a customer session. Real customer consent and token exchange remain unverified. The configuration fix prevents Next.js's global headers from overriding the auth routes' privacy policy; its new HTTP regression, lint and type check passed locally, and GitHub Actions [run 37108933300](https://github.com/sidmuzammil/Inforteks/actions/runs/37108933300) passed on the exact production web source. Existing six migrations remained applied; no new migration or worker deployment was needed.

The requested `sales@inforteks.com` Owner was created with a unique cryptographically generated password. Temporary bootstrap variables were removed and the normal `pnpm db:migrate` pre-deploy command restored. Credentials were delivered through a private local file excluded from Git and deployment uploads. Never print, reset or recreate this Owner as part of future setup.

Inforteks is a single-merchant store. Public registration creates customer accounts only. Staff use dedicated sign-in without registration; the Owner creates named colleagues and assigns or revokes role presets. Server permissions protect product management, stock, homepage banners, content and other modules. See ADMIN_GUIDE.md.

Temporary object upload, authenticated read and deletion were rechecked on 3 October against both Railway media buckets, with temporary objects removed. A full remote browser media journey and anonymous bucket-access check were not performed; local browser tests covered image validation and private-to-public banner publication.

PITR configuration is enabled in both environments. Production has daily, weekly and monthly backup schedules; staging has daily and weekly schedules. Named snapshots `production-after-migrations` and `staging-after-migrations` were created and listed successfully. Before the fourth migration, production snapshot `before-account-and-banner-release` (`a3a0c012-2042-4d01-9471-486adf990fd5`) was created and verified. Before the fifth migration, production snapshot `before-google-identity-release` (`7b69d1c8-faf0-402b-a477-b4f714a6fc92`) was created and listed at `2026-10-02T19:52:06.563Z`. Before migration six, snapshot `before-merchant-editor-release` (`97defc40-36dd-4cdb-a704-06b1abc174c1`) was created and listed at `2026-10-03T05:59:37.499Z`. Continuous WAL coverage and a restore rehearsal still require verification; enabling PITR is not proof of a successful restore.

The merchant editor release passed 63 unit/integration tests and all 19 Chromium journeys against local data. All 69 documented staff API operations denied anonymous/customer access. Dummy product images, featured/discounted publication, stock approvals, checkout/replay, fulfillment, return/restocking and isolated HTML/hero previews were verified. Type checking, lint, formatting, the production build and OpenAPI validation for 98 operations passed.

GitHub Actions [run 37102474211](https://github.com/sidmuzammil/Inforteks/actions/runs/37102474211) passed fresh setup, static/database checks, all browser journeys and the production build on the exact deployed application commit `43ae21b469bf6a59e92c4d4d9bbc1c64f53f39c7`. Fresh setup now waits for a real TCP query to the application database; this fixes the temporary PostgreSQL initialization-server race exposed by CI. Both a fresh isolated disposable database and the existing development database passed this readiness check.

## Direct Sales release — 7 October

The administrator now has Direct Sales and Online Store workspaces with shared products, prices and stock. Office contacts require no customer login. Staff can record visits/follow-ups and place reviewed, idempotent direct orders; payments remain pending until explicitly recorded by authorised staff. The Sales representative role cannot access website orders or financial/settings mutations.

GitHub Actions [run 37585441869](https://github.com/sidmuzammil/Inforteks/actions/runs/37585441869) passed fresh setup, static/database checks, all 25 browser journeys and the production build on `4e3b81d9368a422f016864612652ca9f3e956882`. There are 81 unit/integration tests and 115 documented API operations. Browser fixtures respect the real shared-IP sign-in retry window; no authentication limits were changed.

Before the production migration, snapshot `before-direct-sales-release` (`e3921fa8-b226-46b8-8de1-8c5b385036d9`) was created and listed at `2026-10-07T07:06:36.513Z`. This is a verified snapshot, not a restore rehearsal. Existing orders default to ONLINE; no historical orders were guessed to be direct sales.

Staging readiness and private endpoint checks passed. The existing production Owner opened both channels, office/customer/order forms, follow-ups, filtered orders and the Sales representative option. All twelve referenced editor scripts loaded, and the migrated office/order endpoints answered authorised read requests. Anonymous requests were denied, the Owner signed out, and no production business records were created or changed by verification. Public offline checkout remains disabled; the private direct-order workflow does not charge money or activate a payment provider.

## Remaining launch steps

1. Finish DNS and HTTPS verification. GoDaddy does not support the apex CNAME flattening required by Railway. The straightforward route is `www.inforteks.com` on Railway, with GoDaddy forwarding `inforteks.com` to it using a permanent unmasked HTTPS redirect. Keep mail records intact. A fresh Railway domain-status check still reports the `www` CNAME pointing to `inforteks.com`, with DNS update and ownership validation pending. GoDaddy access is not exposed in this session. Railway requires:

   | Type  | Name                  | Value                                                                             |
   | ----- | --------------------- | --------------------------------------------------------------------------------- |
   | CNAME | `www`                 | `aydctqnk.up.railway.app`                                                         |
   | TXT   | `_railway-verify.www` | `railway-verify=cd0be31f8624abb7353911e1480661008aa16a371beb260695b0df24d07f3fd2` |

   After Railway reports verified DNS and a valid certificate, set both web and worker canonical origins (`APP_URL`, `BETTER_AUTH_URL`) to `https://www.inforteks.com`, update the infrastructure file, redeploy, and verify sign-in. Until then, use the generated production hostname. An apex Railway domain is also reserved, but it needs a DNS provider with flattening if chosen as the canonical host instead.

2. Connect authorized email sending. Microsoft 365 hosts the existing mailbox, but no sending credential/provider authorization is available to the application. `EMAIL_PROVIDER=disabled` remains explicit; recovery reports unavailable instead of claiming an email was sent. A verified Resend sender and a worker-only `RESEND_API_KEY`, plus matching sender/provider configuration on web and worker, are required for the existing adapter. Preserve Microsoft 365 MX records and verify actual delivery before requiring customer email verification.
3. Complete a real Google customer sign-in and returning sign-in using the configured production client; the authorization handoff and cancellation have passed. If Google still uses a Testing audience, add permitted test users and complete its production requirements before general availability. Existing password customers must explicitly connect Google from Profile & security. Preserve the production web service's OAuth variables during infrastructure updates, and register exact new callbacks before changing domains. Staging intentionally remains unconfigured. See GOOGLE_SIGN_IN.md.
4. Optional AI comparison requires explicit enablement and web-side OpenAI credentials/model. Ordinary live specification comparison works independently. No paid AI response was verified.
5. Grant Railway's GitHub App access to `sidmuzammil/Inforteks` before enabling GitHub autodeploys. Current deployments use an authorized CLI upload. Apply infrastructure changes separately from application source pushes.
6. Verify real merchant products, policies and operational payment/shipping integrations before accepting orders. Production was not seeded with development products, customers or orders. Live card payments and courier automation remain disconnected.
7. Complete a Railway restore rehearsal, monitoring and load review. Custom-domain requests remain blocked from this cloud session and SSH hostname resolution is unavailable. The generated Railway hostname and bucket operations are reachable.

## Configuration notes

`.railway/railway.ts` uses the named `inforteks` partial to preserve Railway-managed PITR buckets outside its ownership. Staging media is `media`; production media is `media-production`. Review every plan for unexpected deletions.

CLI 5.63.1 may show default restart/sleep settings as drift even though the service API reports `ON_FAILURE`, 10 retries and sleeping disabled. Do not repeatedly redeploy solely for those default-value differences. The `environment edit` command prioritizes piped JSON over flags when stdin is not a terminal; use a reviewed JSON patch for automation. Inspect live configuration and the final deployment after applying placement changes.

At the user’s request, duplicate Vercel project `inforteks-4akw` was deleted after confirming it had no variables or custom domains. Project `inforteks` remains in `muzammils-projects`; its homepage, nested paths and query strings were verified to redirect with HTTP 307 to Railway. The previous Vercel private Blob store remains retained. No live source database was present in that Vercel attempt; the local development snapshot remains private and separate.

Web and worker origins are pinned explicitly to the verified generated Railway hostnames. Attaching an unverified custom domain can change `RAILWAY_PUBLIC_DOMAIN`; do not derive authentication origins from that variable until a deliberate domain cutover.
