import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { emailDeliveryEnabled } from "@/lib/email-policy";
const handlers = toNextJsHandler(auth);
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
