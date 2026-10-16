import { createHash, randomBytes } from "node:crypto";
import { db, type Tx } from "@/lib/db";
import { AppError, invariant } from "@/lib/errors";
import { json } from "@/lib/utils";
import type { Prisma } from "@/generated/prisma/client";

export const permissions = [
  "catalog:read",
  "catalog:write",
  "catalog:publish",
  "pricing:read",
  "pricing:write",
  "costs:read",
  "costs:write",
  "inventory:read",
  "inventory:adjust",
  "direct_sales:read",
  "direct_sales:write",
  "crm:read",
  "crm:write",
  "orders:read",
  "orders:update",
  "orders:cancel",
  "payments:record",
  "fulfillments:write",
  "returns:write",
  "refunds:request",
  "refunds:execute",
  "customers:read",
  "customers:export",
  "content:read",
  "content:write",
  "promotions:write",
  "reports:read",
  "reports:financial",
  "staff:manage",
  "api_keys:manage",
  "integrations:manage",
  "audit:read",
  "ai:use",
] as const;
export type Permission = (typeof permissions)[number];
export const roles: Record<string, readonly Permission[]> = {
  OWNER: permissions,
  MANAGER: permissions.filter(
    (p) =>
      ![
        "staff:manage",
        "api_keys:manage",
        "integrations:manage",
        "refunds:execute",
        "customers:export",
      ].includes(p),
  ),
  EDITOR: [
    "catalog:read",
    "catalog:write",
    "content:read",
    "content:write",
    "ai:use",
  ],
  CATALOG: [
    "catalog:read",
    "catalog:write",
    "catalog:publish",
    "pricing:read",
    "pricing:write",
  ],
  CONTENT: ["content:read", "content:write"],
  INVENTORY: ["catalog:read", "inventory:read", "inventory:adjust", "ai:use"],
  SUPPORT: [
    "orders:read",
    "orders:update",
    "orders:cancel",
    "fulfillments:write",
    "returns:write",
    "refunds:request",
    "customers:read",
    "ai:use",
  ],
  SALES: ["direct_sales:read", "direct_sales:write", "crm:read", "crm:write"],
  ANALYST: ["reports:read"],
  CUSTOMER: [],
  STAFF_DISABLED: [],
};
export const staffRoleLabels: Record<string, string> = {
  MANAGER: "Store manager — daily operations",
  CATALOG: "Product manager — listings, prices & publishing",
  CONTENT: "Content editor — banners, pages & reviews",
  EDITOR: "Editor — product drafts & content",
  INVENTORY: "Inventory — stock levels",
  SUPPORT: "Support — orders, fulfilment & returns",
  SALES: "Sales representative — office CRM, contacts & direct orders",
  ANALYST: "Analyst — reports only",
  STAFF_DISABLED: "No staff access — revoke access",
};
export type Actor = {
  id: string;
  scopes: readonly string[];
  source: "admin" | "api" | "ai" | "customer" | "system";
  human: boolean;
  role?: string;
  // Credential provenance, distinct from the integration client's identity.
  keyId?: string;
};
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const secret = () => randomBytes(32).toString("base64url");
export function requireScope(actor: Actor, scope: Permission) {
  invariant(
    actor.scopes.includes(scope),
    403,
    `Permission required: ${scope}`,
    "FORBIDDEN",
  );
}
export async function actorForUser(id: string, tx: Tx = db): Promise<Actor> {
  const u = await tx.user.findUnique({ where: { id } });
  invariant(u, 401, "Please sign in.");
  return {
    id,
    scopes: [...new Set([...(roles[u.role] ?? []), ...u.grants])],
    source: "admin",
    human: true,
    role: u.role,
  };
}
export async function authenticateKey(token: string): Promise<Actor> {
  const key = await db.apiKey.findUnique({
    where: { hash: hash(token) },
    include: { client: true },
  });
  invariant(
    key && !key.revokedAt && key.expiresAt > new Date() && key.client.active,
    401,
    "Invalid or expired credentials.",
  );
  await rateLimit(`key:${key.id}`, 120, 60_000);
  await db.apiKey.update({
    where: { id: key.id },
    data: { lastUsedAt: new Date() },
  });
  return {
    id: key.clientId,
    keyId: key.id,
    scopes: key.scopes.filter((s) => key.client.scopes.includes(s)),
    source: "api",
    human: false,
  };
}
export async function requireCurrentKeyAuthority(
  tx: Tx,
  clientId: string,
  keyId: string | null | undefined,
  required: readonly Permission[],
) {
  invariant(
    keyId,
    403,
    "Original API key is unknown. Submit a new proposal with an active key.",
  );
  // Keep both authority records stable through proposal creation/application.
  // Revocation and scope/activity updates serialize with these shared locks.
  await tx.$queryRaw`SELECT id FROM "ApiClient" WHERE id=${clientId} FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM "ApiKey" WHERE id=${keyId} AND "clientId"=${clientId} FOR SHARE`;
  const key = await tx.apiKey.findFirst({
    where: { id: keyId, clientId },
    select: {
      revokedAt: true,
      expiresAt: true,
      scopes: true,
      client: { select: { active: true, scopes: true } },
    },
  });
  invariant(
    key &&
      !key.revokedAt &&
      key.expiresAt > new Date() &&
      key.client.active &&
      required.every(
        (scope) =>
          key.scopes.includes(scope) && key.client.scopes.includes(scope),
      ),
    403,
    "Original API key or client no longer has permission. Submit a new proposal with an active key.",
  );
  return key.expiresAt;
}
export async function audit(
  tx: Tx,
  actor: Actor,
  operation: string,
  targetId: string,
  before?: unknown,
  after?: unknown,
  proposalId?: string,
) {
  await tx.auditEvent.create({
    data: {
      actorId: actor.id,
      source: actor.source,
      operation,
      targetId,
      before:
        before === undefined ? undefined : json<Prisma.InputJsonValue>(before),
      after:
        after === undefined ? undefined : json<Prisma.InputJsonValue>(after),
      proposalId,
    },
  });
}
export async function rateLimit(key: string, max = 30, window = 60_000) {
  const now = Date.now();
  const rows = await db.$queryRaw<
    { count: number }[]
  >`INSERT INTO "RateLimit" (id, key, count, "lastRequest") VALUES (${secret()}, ${key}, 1, ${BigInt(now)}) ON CONFLICT (key) DO UPDATE SET count = CASE WHEN "RateLimit"."lastRequest" < ${BigInt(now - window)} THEN 1 ELSE "RateLimit".count + 1 END, "lastRequest" = CASE WHEN "RateLimit"."lastRequest" < ${BigInt(now - window)} THEN ${BigInt(now)} ELSE "RateLimit"."lastRequest" END RETURNING count`;
  if (rows[0].count > max)
    throw new AppError(
      429,
      "Too many requests. Try again shortly.",
      "RATE_LIMITED",
    );
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export async function idempotent<T>(
  tx: Tx,
  actorId: string,
  operation: string,
  key: string,
  payload: unknown,
  fn: () => Promise<T>,
): Promise<T> {
  invariant(
    key.length >= 8 && key.length <= 128,
    400,
    "A valid Idempotency-Key is required.",
  );
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actorId + operation + key}, 0))`;
  const found = await tx.idempotency.findUnique({
    where: { actorId_operation_key: { actorId, operation, key } },
  });
  const payloadHash = hash(canonical(payload));
  if (found) {
    invariant(
      found.payloadHash === payloadHash,
      409,
      "Idempotency key was used for a different request.",
    );
    return found.result as T;
  }
  const result = await fn();
  await tx.idempotency.create({
    data: {
      actorId,
      operation,
      key,
      payloadHash,
      result: json<Prisma.InputJsonValue>(result),
    },
  });
  return result;
}
