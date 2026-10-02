import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { emailDeliveryEnabled } from "@/lib/email-policy";
import { googleSignInEnabled } from "@/lib/google-auth";
import { googleCustomerAllowed } from "@/domains/customer-google";
import { safeReturnPath } from "@/lib/auth-navigation";
import { z } from "zod";
const handlers = toNextJsHandler(auth);
const googleRequest = z
  .object({
    provider: z.literal("google"),
    callbackURL: z.string().max(2048).optional(),
    errorCallbackURL: z.string().max(2048).optional(),
    newUserCallbackURL: z.string().max(2048).optional(),
    disableRedirect: z.boolean().optional(),
    requestSignUp: z.boolean().optional(),
  })
  .strict();
function privateResponse(response: Response) {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
export async function GET(request: Request) {
  return privateResponse(await handlers.GET(request));
}
export async function POST(request: Request) {
  const origin = new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000")
    .origin;
  if (request.headers.get("origin") !== origin) {
    return privateResponse(
      Response.json(
        { code: "INVALID_ORIGIN", message: "Request origin is not allowed." },
        { status: 403 },
      ),
    );
  }
  const path = new URL(request.url).pathname;
  if (["/api/auth/sign-in/social", "/api/auth/link-social"].includes(path)) {
    if (!googleSignInEnabled())
      return privateResponse(
        Response.json({ code: "GOOGLE_UNAVAILABLE" }, { status: 503 }),
      );
    // This store uses the browser authorization-code flow only. Disallow supplied
    // ID tokens, extra scopes and caller-controlled OAuth state/parameters.
    const parsed = googleRequest.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success)
      return privateResponse(
        Response.json({ code: "INVALID_GOOGLE_REQUEST" }, { status: 400 }),
      );
    const linking = path.endsWith("/link-social");
    if (linking) {
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session)
        return privateResponse(
          Response.json({ code: "UNAUTHORIZED" }, { status: 401 }),
        );
      if (!(await googleCustomerAllowed(session.user.id)))
        return privateResponse(
          Response.json({ code: "GOOGLE_CUSTOMER_ONLY" }, { status: 403 }),
        );
      if (
        Date.now() - new Date(session.session.createdAt).getTime() >
        15 * 60_000
      )
        return privateResponse(
          Response.json({ code: "SESSION_NOT_FRESH" }, { status: 403 }),
        );
    }
    const next = linking
      ? "/account/profile"
      : safeReturnPath(parsed.data.callbackURL);
    const payload = {
      provider: "google",
      callbackURL: next,
      newUserCallbackURL: next,
      errorCallbackURL: linking
        ? "/account/profile"
        : `/login?next=${encodeURIComponent(next)}`,
      disableRedirect: true,
      requestSignUp: parsed.data.requestSignUp,
    };
    request = new Request(request.url, {
      method: "POST",
      headers: new Headers(request.headers),
      body: JSON.stringify(payload),
    });
    request.headers.delete("content-length");
    request.headers.set("content-type", "application/json");
  }
  // Return the same result for every address before any user lookup.
  if (
    !emailDeliveryEnabled() &&
    [
      "/api/auth/request-password-reset",
      "/api/auth/send-verification-email",
    ].includes(path)
  ) {
    return privateResponse(
      Response.json(
        {
          code: "EMAIL_UNAVAILABLE",
          message:
            "Email recovery is temporarily unavailable. Please try again later.",
        },
        { status: 503 },
      ),
    );
  }
  return privateResponse(await handlers.POST(request));
}
