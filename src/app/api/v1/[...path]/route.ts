import { previewHomeSection } from "@/domains/home-sections";
import { emailDeliveryEnabled } from "@/lib/email-policy";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { AppError, invariant } from "@/lib/errors";
import { checkOrigin, requestActor } from "@/lib/session";
import {
  catalogue,
  getProduct,
  createProduct,
  includeProduct,
  publicProduct,
} from "@/domains/catalogue";
import {
  ensureCart,
  getCart,
  setCartItem,
  quote,
  checkout,
  ownedOrder,
  requestReturn,
  addressInput,
  paymentMethods,
} from "@/domains/commerce";
import {
  requireScope,
  rateLimit,
  audit,
  permissions,
  roles,
} from "@/domains/identity";
import { propose, approve } from "@/domains/approvals";
import {
  adminList,
  saveResource,
  dashboard,
  issueKey,
  createStaff,
  updateStaffAccess,
  importPreview,
  commitImport,
  csvCell,
} from "@/domains/administration";
import { storeImage } from "@/domains/storage";
import { startAiRun, providerStatus } from "@/domains/ai";
import { reviewReturn } from "@/domains/returns";
import { profileInput } from "@/lib/account-input";
import { compareProducts, comparisonInsights } from "@/domains/comparison";

export const dynamic = "force-dynamic";
const ok = (data: unknown, status = 200) =>
  NextResponse.json(
    { data },
    { status, headers: { "Cache-Control": "no-store" } },
  );
async function dispatch(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const [area, resource, id, action] = (await params).path;
  const method = req.method;
  const query = Object.fromEntries(req.nextUrl.searchParams);
  const session = await auth.api.getSession({ headers: req.headers });
  const userId = session?.user.id;
  const body = async () => {
    const size = Number(req.headers.get("content-length") ?? 0);
    invariant(size <= 1_100_000, 413, "Request is too large.");
    const text = await req.text();
    invariant(text.length <= 1_100_000, 413, "Request is too large.");
    try {
      return JSON.parse(text);
    } catch {
      throw new AppError(400, "Invalid JSON body.");
    }
  };
  if (method !== "GET") checkOrigin(req);
  if (area === "storefront") {
    if (resource === "comparison") {
      if (method === "GET" && !id)
        return ok(
          await compareProducts({ skuIds: (query.skus ?? "").split(",") }),
        );
      invariant(
        method === "POST" && id === "insights",
        405,
        "Method not allowed.",
      );
      invariant(userId, 401, "Sign in to request an AI comparison.");
      return ok(await comparisonInsights(userId, await body()));
    }
    if (method === "GET") {
      if (resource === "products" || resource === "search") {
        if (!id) return ok(await catalogue(query));
        const product = await getProduct(id);
        invariant(product, 404, "Product not found.");
        return ok(product);
      }
      if (resource === "categories")
        return ok(
          await db.category.findMany({
            where: { visible: true },
            orderBy: { position: "asc" },
          }),
        );
      if (resource === "brands")
        return ok(await db.brand.findMany({ orderBy: { name: "asc" } }));
      if (resource === "collections") return ok(await db.collection.findMany());
      if (resource === "payment-methods") return ok(paymentMethods());
      if (resource === "carts") {
        const cart = await getCart(req.cookies.get("ift-cart")?.value, userId);
        return ok(
          cart
            ? {
                id: cart.id,
                items: cart.items.map((l) => ({
                  id: l.id,
                  skuId: l.skuId,
                  quantity: l.quantity,
                  name: l.sku.product.name,
                  slug: l.sku.product.slug,
                  code: l.sku.code,
                  price: l.sku.price,
                  available: Math.max(0, l.sku.onHand - l.sku.reserved),
                  image: l.sku.product.media[0]?.key.startsWith(
                    "illustrations/",
                  )
                    ? `/${l.sku.product.media[0].key}`
                    : `/media/${l.sku.product.media[0]?.id}`,
                })),
              }
            : { items: [] },
        );
      }
    }
    if (["carts", "checkout"].includes(resource)) {
      const { cart, token } = await ensureCart(
        req.cookies.get("ift-cart")?.value,
        userId,
      );
      let response: NextResponse;
      if (resource === "carts" && id === "quote") {
        invariant(method === "POST", 405, "Method not allowed.");
        const d = z
          .object({ emirate: z.string(), coupon: z.string().optional() })
          .strict()
          .parse(await body());
        response = ok(await quote(cart.id, d.emirate, d.coupon));
      } else if (resource === "carts") {
        invariant(
          method === "POST" || method === "PATCH",
          405,
          "Method not allowed.",
        );
        await setCartItem(cart.id, await body());
        response = ok({ saved: true });
      } else {
        invariant(method === "POST", 405, "Method not allowed.");
        await rateLimit(`checkout:${cart.id}`, 10);
        const order = await checkout(
          cart.id,
          userId,
          await body(),
          req.headers.get("idempotency-key") ?? "",
        );
        response = ok(order, 201);
        response.cookies.set(`ift-order-${order.id}`, order.guestToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 30 * 86400,
        });
      }
      response.cookies.set("ift-cart", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 30 * 86400,
      });
      return response;
    }
    if (resource === "track-order" && method === "POST") {
      const d = z
        .object({ reference: z.string().max(100), token: z.string().max(100) })
        .strict()
        .parse(await body());
      await rateLimit(
        `track:${req.headers.get("x-forwarded-for") ?? "shared"}`,
        20,
      );
      const order = await ownedOrder(d.reference, userId, d.token);
      const response = ok({ id: order.id, reference: order.reference });
      response.cookies.set(`ift-order-${order.id}`, d.token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 86400,
      });
      return response;
    }
    if (resource === "inquiries" && method === "POST") {
      await rateLimit(
        `inquiry:${req.headers.get("x-forwarded-for") ?? "shared"}`,
        10,
      );
      const d = z
        .object({
          name: z.string().min(2).max(100),
          email: z.email().max(200),
          subject: z.string().min(2).max(150),
          message: z.string().min(10).max(5000),
        })
        .strict()
        .parse(await body());
      const row = await db.inquiry.create({ data: d });
      return ok(
        {
          id: row.id,
          message:
            "Your inquiry has been saved. Email delivery is not configured.",
        },
        201,
      );
    }
  }
  if (area === "account") {
    invariant(userId, 401, "Please sign in.");
    if (resource === "profile") {
      if (method === "GET")
        return ok(
          await db.user.findUnique({
            where: { id: userId },
            select: { id: true, name: true, email: true, createdAt: true },
          }),
        );
      invariant(method === "PATCH", 405, "Method not allowed.");
      const d = profileInput.parse(await body());
      return ok(
        await db.user.update({
          where: { id: userId },
          data: d,
          select: { id: true, name: true, email: true },
        }),
      );
    }
    if (resource === "orders" && method === "GET")
      return ok(
        id
          ? await ownedOrder(id, userId)
          : await db.order.findMany({
              where: { userId },
              select: {
                id: true,
                reference: true,
                createdAt: true,
                status: true,
                total: true,
                paymentStatus: true,
                demo: true,
              },
              orderBy: { createdAt: "desc" },
              take: 50,
            }),
      );
    if (resource === "addresses") {
      if (method === "GET")
        return ok(await db.address.findMany({ where: { userId } }));
      if (method === "DELETE") {
        invariant(id, 400, "Choose an address to delete.");
        await db.address.deleteMany({ where: { id, userId } });
        return ok({ deleted: true });
      }
      invariant(method === "POST", 405, "Method not allowed.");
      const d = addressInput.parse(await body());
      return ok(await db.address.create({ data: { ...d, userId } }), 201);
    }
    if (resource === "returns") {
      if (method === "GET")
        return ok(
          await db.returnRequest.findMany({
            where: { order: { userId }, ...(id ? { id } : {}) },
            include: { order: { select: { reference: true } } },
            take: 50,
          }),
        );
      invariant(method === "POST", 405, "Method not allowed.");
      return ok(await requestReturn(userId, await body()), 201);
    }
    if (resource === "wishlist") {
      if (method === "GET") {
        const items = await db.wishlistItem.findMany({
          where: { userId, sku: { product: { status: "PUBLISHED" } } },
          include: {
            sku: { include: { product: { include: includeProduct } } },
          },
          take: 100,
        });
        return ok(
          items.map((i) => ({
            skuId: i.skuId,
            product: publicProduct(i.sku.product),
          })),
        );
      }
      const { skuId } = z
        .object({ skuId: z.string() })
        .strict()
        .parse(await body());
      if (method === "DELETE")
        await db.wishlistItem.deleteMany({ where: { userId, skuId } });
      else {
        invariant(
          await db.sku.findFirst({
            where: {
              id: skuId,
              active: true,
              product: { status: "PUBLISHED" },
            },
          }),
          404,
          "Product not found.",
        );
        await db.wishlistItem.upsert({
          where: { userId_skuId: { userId, skuId } },
          create: { userId, skuId },
          update: {},
        });
      }
      return ok({ saved: true });
    }
    if (resource === "reviews" && method === "POST") {
      const d = z
        .object({
          productId: z.string(),
          rating: z.number().int().min(1).max(5),
          body: z.string().min(10).max(2000),
        })
        .strict()
        .parse(await body());
      const skus = await db.sku.findMany({
        where: { productId: d.productId },
        select: { id: true },
      });
      const purchased = await db.orderItem.findFirst({
        where: {
          order: { userId, paymentStatus: "PAID" },
          fulfilled: { gt: 0 },
          skuId: { in: skus.map((s) => s.id) },
        },
      });
      invariant(purchased, 403, "Reviews require a fulfilled, paid purchase.");
      return ok(
        await db.review.create({ data: { ...d, userId, verified: true } }),
        201,
      );
    }
  }
  if (area === "admin") {
    const actor = await requestActor(req);
    invariant(
      actor.scopes.length > 0 &&
        (!actor.human ||
          !["CUSTOMER", "STAFF_DISABLED"].includes(actor.role ?? "")),
      403,
      "Staff access is required.",
    );
    if (resource === "returns" && id && method === "PATCH")
      return ok(await reviewReturn(actor, id, await body()));
    if (resource === "refund-requests" && action === "execute") {
      requireScope(actor, "refunds:execute");
      throw new AppError(
        503,
        "Refund provider not connected. No money has been moved.",
      );
    }
    if (resource === "me" && id === "permissions")
      return ok({
        scopes: actor.scopes,
        role: actor.role,
        registry: permissions,
        roles,
      });
    if (resource === "dashboard" && method === "GET")
      return ok(await dashboard(actor));
    if (resource === "integration-status" && method === "GET") {
      requireScope(actor, "integrations:manage");
      return ok({
        ai: providerStatus(),
        storage: process.env.STORAGE_DRIVER ?? "local",
        email: emailDeliveryEnabled() ? "configured" : "not connected",
        payments: paymentMethods(),
      });
    }
    if (resource === "products") {
      if (method === "GET" && id) {
        requireScope(actor, "catalog:read");
        const p = await db.product.findUnique({
          where: { id },
          include: includeProduct,
        });
        invariant(p, 404, "Product not found.");
        return ok({
          ...p,
          skus: p.skus.map((s) => ({
            ...s,
            cost: actor.scopes.includes("costs:read") ? s.cost : undefined,
            onHand: actor.scopes.includes("inventory:read")
              ? s.onHand
              : undefined,
            reserved: actor.scopes.includes("inventory:read")
              ? s.reserved
              : undefined,
            price: actor.scopes.includes("pricing:read") ? s.price : undefined,
          })),
        });
      }
      if (method === "POST" && !id)
        return ok(await createProduct(actor, await body()), 201);
      if (
        method === "POST" &&
        ["publish", "unpublish", "archive"].includes(action)
      )
        return ok(await propose(actor, `product.${action}`, id, {}), 201);
      if (method === "PATCH" && id)
        return ok(await propose(actor, "product.edit", id, await body()), 201);
      if (method === "POST" && action === "duplicate") {
        requireScope(actor, "catalog:write");
        const p = await db.product.findUniqueOrThrow({
          where: { id },
          include: { skus: true },
        });
        return ok(
          await createProduct(actor, {
            name: p.name + " copy",
            slug: p.slug + "-" + Date.now(),
            description: p.description,
            brandId: p.brandId,
            categoryId: p.categoryId,
            specs: p.specs,
            highlights: p.highlights,
            skus: p.skus.map((s) => ({
              code: s.code + "-" + Date.now(),
              specs: s.specs,
              options: s.options,
              price: null,
            })),
          }),
          201,
        );
      }
    }
    if (resource === "proposals" && method === "POST") {
      if (id && action === "approve") return ok(await approve(actor, id));
      if (id && action === "reject") {
        invariant(actor.human, 403, "Human review required.");
        const p = await db.proposal.findUnique({ where: { id } });
        invariant(
          p && (p.actorId === actor.id || actor.role === "OWNER"),
          404,
          "Proposal not found.",
        );
        await db.proposal.updateMany({
          where: { id, status: "PENDING" },
          data: { status: "REJECTED", approverId: actor.id },
        });
        return ok({ rejected: true });
      }
      const d = z
        .object({
          operation: z.string(),
          targetId: z.string(),
          payload: z.unknown(),
        })
        .strict()
        .parse(await body());
      return ok(await propose(actor, d.operation, d.targetId, d.payload), 201);
    }
    if (resource === "home-sections" && id === "preview" && method === "POST") {
      return ok(await previewHomeSection(actor, await body()));
    }
    if (["media", "banner-media"].includes(resource) && method === "POST") {
      requireScope(
        actor,
        resource === "banner-media" ? "content:write" : "catalog:write",
      );
      const form = await req.formData();
      const file = form.get("file");
      invariant(file instanceof File, 422, "An image file is required.");
      return ok(
        await storeImage(
          actor,
          file,
          String(form.get("productId") ?? ""),
          String(form.get("alt") ?? ""),
          resource === "banner-media",
        ),
        201,
      );
    }
    if (resource === "api-keys" && method === "POST") {
      if (id && action === "revoke") {
        requireScope(actor, "api_keys:manage");
        invariant(
          actor.human && actor.role === "OWNER",
          403,
          "Owner session required.",
        );
        await db.$transaction(async (tx) => {
          await tx.apiKey.update({
            where: { id },
            data: { revokedAt: new Date() },
          });
          await audit(tx, actor, "api-key.revoke", id);
        });
        return ok({ revoked: true });
      }
      return ok(await issueKey(actor, await body()), 201);
    }
    if (resource === "staff" && method === "PATCH" && id)
      return ok(await updateStaffAccess(actor, id, await body()));
    if (resource === "staff" && method === "POST") {
      if (id && action === "revoke-sessions") {
        requireScope(actor, "staff:manage");
        invariant(
          actor.human && actor.role === "OWNER",
          403,
          "Owner session required.",
        );
        await db.$transaction(async (tx) => {
          await tx.session.deleteMany({ where: { userId: id } });
          await audit(tx, actor, "staff.sessions-revoke", id);
        });
        return ok({ revoked: true });
      }
      return ok(await createStaff(actor, await body()), 201);
    }
    if (resource === "imports" && method === "POST")
      return ok(
        id && action === "commit"
          ? await commitImport(actor, id)
          : await importPreview(actor, await body()),
        201,
      );
    if (resource === "exports" && method === "GET") {
      requireScope(actor, "reports:read");
      requireScope(actor, "inventory:read");
      const rows = await db.sku.findMany({
        select: { code: true, onHand: true, reserved: true },
        take: 10000,
      });
      return new Response(
        "sku,on_hand,reserved,available\n" +
          rows
            .map((r) =>
              [r.code, r.onHand, r.reserved, r.onHand - r.reserved]
                .map(csvCell)
                .join(","),
            )
            .join("\n"),
        {
          headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": "attachment; filename=inventory.csv",
            "Cache-Control": "private, no-store",
          },
        },
      );
    }
    if (resource === "orders" && id && method === "GET") {
      requireScope(actor, "orders:read");
      const order = await db.order.findUnique({
        where: { id },
        include: {
          items: true,
          payments: true,
          shipments: true,
          returns: true,
          refunds: true,
        },
      });
      invariant(order, 404, "Order not found.");
      return ok(order);
    }
    if (resource === "reviews" && id && method === "PATCH") {
      requireScope(actor, "content:write");
      const d = z
        .object({ status: z.enum(["APPROVED", "REJECTED"]) })
        .strict()
        .parse(await body());
      return ok(
        await db.$transaction(async (tx) => {
          const row = await tx.review.update({ where: { id }, data: d });
          await audit(tx, actor, "review.moderate", id, undefined, d);
          return row;
        }),
      );
    }
    if (resource === "inquiries" && id && method === "PATCH") {
      requireScope(actor, "customers:read");
      const d = z
        .object({ status: z.enum(["OPEN", "RESOLVED"]) })
        .strict()
        .parse(await body());
      return ok(await db.inquiry.update({ where: { id }, data: d }));
    }
    if (resource === "ai" && id === "runs") {
      requireScope(actor, "ai:use");
      if (method === "POST") {
        if (action) {
          await db.aiRun.updateMany({
            where: {
              id: action,
              actorId: actor.id,
              status: { in: ["QUEUED", "RUNNING"] },
            },
            data: { status: "CANCELLED" },
          });
          return ok({ cancelled: true });
        }
        return ok(await startAiRun(actor, await body()), 201);
      }
      requireScope(actor, "ai:use");
      return ok(
        await db.aiRun.findMany({
          where: { actorId: actor.id },
          orderBy: { createdAt: "desc" },
          take: 30,
        }),
      );
    }
    if (resource === "settings" && method === "PATCH") {
      requireScope(actor, "integrations:manage");
      invariant(
        actor.human && actor.role === "OWNER",
        403,
        "Owner session required.",
      );
      const d = z
        .object({ key: z.enum(["store", "tax"]), value: z.unknown() })
        .strict()
        .parse(await body());
      const value =
        d.key === "tax"
          ? z
              .object({
                registered: z.boolean(),
                bps: z.number().int().min(0).max(10000),
                inclusive: z.boolean(),
                trn: z.string().max(50).optional(),
              })
              .strict()
              .parse(d.value)
          : z
              .object({
                name: z.string().min(2).max(100),
                tagline: z.string().max(200),
                country: z.literal("United Arab Emirates"),
                currency: z.literal("AED"),
                demo: z.boolean(),
              })
              .strict()
              .parse(d.value);
      return ok(
        await db.$transaction(async (tx) => {
          const row = await tx.setting.upsert({
            where: { key: d.key },
            create: { key: d.key, value },
            update: { value, version: { increment: 1 } },
          });
          await audit(tx, actor, "settings.update", d.key, undefined, value);
          return row;
        }),
      );
    }
    if (["POST", "PATCH"].includes(method))
      return ok(
        await saveResource(actor, resource, await body(), id),
        method === "POST" ? 201 : 200,
      );
    if (method === "GET")
      return ok(
        await adminList(
          actor,
          resource,
          Number(query.page ?? 1),
          query.q ?? "",
        ),
      );
  }
  throw new AppError(404, "Endpoint not found.", "NOT_FOUND");
}
async function handler(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    return await dispatch(req, context);
  } catch (error) {
    if (error instanceof AppError)
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    if (error instanceof z.ZodError)
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Please check the submitted fields.",
            issues: error.issues.map((i) => ({
              path: i.path,
              message: i.message,
            })),
          },
        },
        { status: 422 },
      );
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const status =
        error.code === "P2002" ? 409 : error.code === "P2025" ? 404 : 422;
      return NextResponse.json(
        {
          error: {
            code: "DATA_CONFLICT",
            message:
              status === 409
                ? "A record with this identifier already exists."
                : status === 404
                  ? "Record not found."
                  : "The change violates a data constraint.",
          },
        },
        { status },
      );
    }
    console.error(
      "Request failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return NextResponse.json(
      {
        error: {
          code: "SERVICE_ERROR",
          message: "This operation could not be completed. Please try again.",
        },
      },
      { status: 500 },
    );
  }
}
export { handler as GET, handler as POST, handler as PATCH, handler as DELETE };
