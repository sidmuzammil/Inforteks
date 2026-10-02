import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { actorForUser, authenticateKey, type Actor } from "@/domains/identity";
import { invariant } from "@/lib/errors";
import { cache } from "react";
// Deduplicate within one server render; never share sessions across requests.
export const getSession = cache(async () =>
  auth.api.getSession({ headers: await headers() }),
);
export async function requestActor(request?: Request): Promise<Actor> {
  const h = request?.headers ?? (await headers());
  const bearer = h.get("authorization");
  if (bearer?.startsWith("Bearer ")) return authenticateKey(bearer.slice(7));
  const session = await auth.api.getSession({ headers: h });
  invariant(session, 401, "Please sign in.");
  return actorForUser(session.user.id);
}
export function checkOrigin(request: Request) {
  if (
    request.headers.get("authorization")?.startsWith("Bearer ") &&
    new URL(request.url).pathname.startsWith("/api/v1/admin/")
  )
    return;
  const expected = new URL(
    process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  ).origin;
  invariant(
    request.headers.get("origin") === expected,
    403,
    "Request origin is not allowed.",
  );
}
