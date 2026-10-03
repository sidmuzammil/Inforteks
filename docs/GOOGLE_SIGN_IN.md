# Google customer sign-in

Google uses the existing Better Auth session and PostgreSQL customer record. The Google OAuth web client can belong to the same Google Cloud project as Firebase. This does not create a second Firebase user database or change existing passwords, orders, staff roles or media storage. A Firebase browser API key or merely installing a Firebase connector does not supply OAuth client credentials to Railway.

## Provider configuration

1. In the Inforteks Firebase project's linked Google Cloud project, select the intended **Web application** OAuth client. Preserve any existing Firebase redirect URIs. Configure Google Auth Platform branding, audience and consent for Inforteks, using only `openid`, `email` and `profile`. A project in Testing mode limits sign-in to its permitted test users; finish the provider's production requirements before offering this to all customers.
2. Add exact authorized redirect URIs for the environments being enabled:
   - Production: `https://web-production-b6327.up.railway.app/api/auth/callback/google`
   - Staging: `https://web-staging-4569.up.railway.app/api/auth/callback/google`
   - Local development, with a development client: `http://localhost:3000/api/auth/callback/google`

   Prefer separate production and development/staging OAuth clients. Use only verified origins. Add the exact new callback to Google before a future custom-domain cutover; then update the application's canonical origin deliberately.

3. Save `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` securely on the appropriate Railway **web** service. Neither belongs in `NEXT_PUBLIC_*`, source control, chat, a URL or the worker. When adopting them as shared Railway variables, add references on web in `.railway/railway.ts` so future infrastructure applies preserve them. Never include resolved secret values in an infrastructure diff.
4. Redeploy web and verify actual Google consent, a new customer session, returning sign-in, cancellation, and connection from an existing customer's profile. Confirm customer admin access remains denied. Remove any disposable verification records. Do not run the development browser suite against production.

The button appears only when both server variables are present. Without them, email/password sign-in continues and the Google endpoint returns 503. Configured variables alone do not prove that Google accepted the redirect or completed consent.

## Account behavior

- Customers use **Continue with Google** on `/login` or `/register`. New identities always become `CUSTOMER` with no additional grants.
- Existing email/password accounts are never silently merged by matching email. Sign in using the existing password and choose **Connect Google** under Profile & security. The Google email must match. Connecting requires an Inforteks session created within the last 15 minutes; otherwise sign out and sign back in first.
- A customer who uses Google exclusively sees Google account guidance instead of a form asking for a nonexistent store password. Customers can still revoke their other Inforteks sessions.
- Staff sign-in has no Google button. Server validation rejects Google sign-in/linking for all stored staff roles, revoked staff and customer rows carrying extra grants. Google never grants store-management access.

## Security and verification

Better Auth owns OAuth code exchange, PKCE, state-cookie binding, replay prevention and session creation. The application requires a verified provider email, limits scopes, rejects caller-supplied ID tokens and OAuth parameters, constrains return destinations, and checks the exact request origin. Error pages render fixed application messages, not raw provider descriptions. Responses are `no-store` and `no-referrer`. A database unique index on `(providerId, accountId)` prevents duplicate identity bindings. OAuth token encryption is enabled through Better Auth.

`tests/google-auth-integration.test.ts` runs the real app handlers and database with only Google's token-exchange response mocked; it cannot establish actual Google consent or project authorization. `tests/browser/google.spec.ts` checks the enabled interface using local-only test credentials and intercepts the browser handoff before contacting Google. No test credentials should be configured on Railway.

## Access finding on 2 October 2026

The user reported connecting Firebase, but this cloud task exposes no Firebase connector tools. The CLI has no signed-in account, and neither Railway environment's web service contains Google/Firebase variables. Official Firebase CLI 15.32.1 is installed privately at `.data/firebase-cli`; its login request to `auth.firebase.tools/attest` was blocked by the cloud proxy with CONNECT 403. Required Firebase/Google network domains were saved in the cloud configuration draft; saving does not apply that policy or authorize a Google account. Live Google sign-in remains unverified and disabled until provider access/configuration is available.

## Production activation on 3 October 2026

The user's Cloud Shell identified the Firebase project `inforteks-3da17`. Its Google OAuth web-client credentials were saved directly on the Railway **production web** service through standard input without putting them in source files, command-line arguments or deployment logs. The web service was redeployed. Staging remains unconfigured; workers do not need Google credentials.

Live checks confirmed customer login/registration show **Continue with Google**, staff login does not, and the OAuth start endpoint returns the exact production callback, S256 PKCE and only `openid`, `email` and `profile`. Google accepted the authorization URL and returned its sign-in page without a client or redirect error. Cancellation returned to the store login without creating a customer session. Actual customer consent, token exchange and returning Google sign-in still need a customer to complete Google's interactive flow; reaching Google's sign-in page alone does not prove these steps.

The HTTP checks found that Next.js's global `Referrer-Policy` overrode the route handler's stricter header. The configuration now sets `no-referrer` and `no-store` explicitly for `/api/auth/:path*`. A browser regression checks actual HTTP responses for session retrieval, a rejected cross-origin request and an OAuth error redirect; calling the route handler directly would miss this configuration interaction. The regression, type check and lint passed locally; GitHub Actions run `37108933300` passed. Production deployment `a4466fe7-30ac-4199-ae95-db35696f35dc` succeeded, and the live OAuth checks passed with the correct privacy headers.

Preserve the production web service's two direct OAuth variables when applying infrastructure changes. Never copy production credentials into development fixtures or staging. Before changing the canonical domain, add its exact Google callback, verify DNS/HTTPS and deliberately update the store's canonical origin.

References: [Better Auth Google provider](https://www.better-auth.com/docs/authentication/google), [account linking](https://www.better-auth.com/docs/concepts/users-accounts).
