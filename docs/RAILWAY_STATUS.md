# Railway deployment record

Verified on 2 October 2026. This records observed deployment state, not a completed retail launch.

- Project: [Inforteks](https://railway.com/project/6c12fe47-eca9-4d35-86b1-8e21e853b941), in the connected Pro workspace.
- Production: <https://web-production-b6327.up.railway.app>
- Staging: <https://web-staging-4569.up.railway.app>
- Application source deployed: `3c848f86fee9c44962f50778abc83a3386c551b8` or the same application source with infrastructure-only changes. GitHub repository: `sidmuzammil/Inforteks`, branch `main`.

## Verified

Both environments have separate PostgreSQL data, database credentials, authentication secrets, and private media buckets. Web, worker and PostgreSQL deployments passed Railway health checks. All three application migrations succeeded in both environments. Only web has public HTTPS hostnames; worker and PostgreSQL use private networking. Application placement is one replica per service in Amsterdam.

Production web deployment: `bb0205f3-7730-41b4-bc7f-e4ff8612a4a7`.
Production worker deployment: `6423a981-a455-415c-ba19-71d769765442`.

PITR configuration is enabled in both environments. Production has daily, weekly and monthly backup schedules; staging has daily and weekly schedules. Named snapshots `production-after-migrations` and `staging-after-migrations` were created and listed successfully. Continuous WAL coverage and a restore rehearsal still require verification; enabling PITR is not proof of a successful restore.

Type checking, lint and formatting passed after the infrastructure changes. Earlier application validation passed 33 domain/runtime tests and local production container checks. The Railway build succeeded after removing unsupported BuildKit secret mounts; downloads still verify TLS and Prisma engine checksums.

## Remaining launch steps

1. Apply the saved cloud network additions for both Railway hostnames, `t3.storageapi.dev` and `ssh.railway.com`. The cloud proxy blocked public HTTP checks and SSH hostname resolution. Railway's health results do not replace a browser check of pages, sign-in, private media and the first Owner workflow.
2. Create the first Owner from credentials supplied securely by the merchant. There is no default administrator. The owner bootstrap must run once, and temporary bootstrap variables must then be removed. Never put passwords in chat, Git, documentation or command output.
3. Finish DNS and HTTPS verification. GoDaddy does not support the apex CNAME flattening required by Railway. The straightforward route is `www.inforteks.com` on Railway, with GoDaddy forwarding `inforteks.com` to it using a permanent unmasked HTTPS redirect. Keep mail records intact. Railway currently requires:

   | Type  | Name                  | Value                                                                             |
   | ----- | --------------------- | --------------------------------------------------------------------------------- |
   | CNAME | `www`                 | `aydctqnk.up.railway.app`                                                         |
   | TXT   | `_railway-verify.www` | `railway-verify=cd0be31f8624abb7353911e1480661008aa16a371beb260695b0df24d07f3fd2` |

   After Railway reports verified DNS and a valid certificate, set both web and worker canonical origins (`APP_URL`, `BETTER_AUTH_URL`) to `https://www.inforteks.com`, update the infrastructure file, redeploy, and verify sign-in. Until then, use the generated production hostname. An apex Railway domain is also reserved, but it needs a DNS provider with flattening if chosen as the canonical host instead.

4. Grant Railway's GitHub App access to `sidmuzammil/Inforteks` before enabling GitHub autodeploys. Current deployments use an authorized CLI upload. Apply infrastructure changes separately from application source pushes.
5. Verify real merchant products, policies and operational payment/email/shipping integrations before accepting orders. Production was not seeded with development products, customers or orders. Live card payments, email delivery and courier automation remain disconnected.

## Configuration notes

`.railway/railway.ts` uses the named `inforteks` partial to preserve Railway-managed PITR buckets outside its ownership. Staging media is `media`; production media is `media-production`. Review every plan for unexpected deletions.

CLI 5.63.1 may show default restart/sleep settings as drift even though the service API reports `ON_FAILURE`, 10 retries and sleeping disabled. Do not repeatedly redeploy solely for those default-value differences. The `environment edit` command prioritizes piped JSON over flags when stdin is not a terminal; use a reviewed JSON patch for automation. Inspect live configuration and the final deployment after applying placement changes.

The previous Vercel resources are retained until the Railway domain, media and admin checks are complete. No live source database was present in that Vercel attempt; the local development snapshot remains private and separate.
