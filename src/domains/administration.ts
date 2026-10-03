import { homeSectionInput, prepareHomeSection } from "./home-sections";
import { z } from "zod";
import { productMediaOrder } from "@/lib/product-media";
import { db, type Tx } from "@/lib/db";
import {
  audit,
  requireScope,
  hash,
  secret,
  permissions,
  roles,
  type Actor,
  type Permission,
} from "./identity";
import { invariant } from "@/lib/errors";
import { auth } from "@/lib/auth";
import { slugify, json } from "@/lib/utils";
import { createProduct, productInput } from "./catalogue";
import type { Prisma } from "@/generated/prisma/client";

export const modules = [
  {
    slug: "products",
    label: "Products",
    scope: "catalog:read",
    description: "Draft, refine and publish your catalogue.",
  },
  {
    slug: "categories",
    label: "Categories",
    scope: "catalog:read",
    description: "Organize your departments and product discovery.",
  },
  {
    slug: "brands",
    label: "Brands",
    scope: "catalog:read",
    description: "Manage the brands in your catalogue.",
  },
  {
    slug: "attributes",
    label: "Specifications",
    scope: "catalog:read",
    description: "Define consistent category-specific specifications.",
  },
  {
    slug: "collections",
    label: "Collections",
    scope: "catalog:read",
    description: "Curated product groups for your storefront.",
  },
  {
    slug: "inventory",
    label: "Inventory",
    scope: "inventory:read",
    description: "Available stock, reservations and reasoned adjustments.",
  },
  {
    slug: "orders",
    label: "Orders",
    scope: "orders:read",
    description: "Track every order from placement to fulfillment.",
  },
  {
    slug: "returns",
    label: "Returns",
    scope: "returns:write",
    description: "Review requests and record received items.",
  },
  {
    slug: "customers",
    label: "Customers",
    scope: "customers:read",
    description: "Customer profiles and purchase history.",
  },
  {
    slug: "promotions",
    label: "Promotions",
    scope: "promotions:write",
    description: "Manage dated, limited-use coupon codes.",
  },
  {
    slug: "content",
    label: "Content & pages",
    scope: "content:read",
    description: "Control storefront copy and information pages.",
  },
  {
    slug: "home-sections",
    label: "Homepage",
    scope: "content:read",
    description: "Manage storefront section copy, ordering and visibility.",
  },
  {
    slug: "media",
    label: "Media library",
    scope: "catalog:read",
    description: "Product imagery, alternative text and publication status.",
  },
  {
    slug: "reviews",
    label: "Reviews",
    scope: "content:write",
    description: "Moderate reviews from verified purchasers.",
  },
  {
    slug: "inquiries",
    label: "Inquiries",
    scope: "customers:read",
    description: "Customer questions saved directly from the storefront.",
  },
  {
    slug: "imports",
    label: "Imports & exports",
    scope: "catalog:write",
    description: "Validate CSV rows before explicitly committing a batch.",
  },
  {
    slug: "reports",
    label: "Reports",
    scope: "reports:read",
    description: "Operational metrics from persisted, non-demo orders.",
  },
  {
    slug: "staff",
    label: "Staff & access",
    scope: "staff:manage",
    description: "Named accounts, explicit roles and session revocation.",
  },
  {
    slug: "api-access",
    label: "API access",
    scope: "api_keys:manage",
    description: "Create scoped integration keys and revoke access.",
  },
  {
    slug: "assistant",
    label: "AI assistant",
    scope: "ai:use",
    description: "Your operations assistant. Your permissions. Your approval.",
  },
  {
    slug: "proposals",
    label: "Approvals",
    scope: "ai:use",
    description: "Review exact changes before they become live.",
  },
  {
    slug: "jobs",
    label: "Background jobs",
    scope: "audit:read",
    description: "Durable queued work, attempts and recorded outcomes.",
  },
  {
    slug: "settings",
    label: "Settings",
    scope: "integrations:manage",
    description: "Store configuration and integration readiness.",
  },
  {
    slug: "audit-events",
    label: "Audit trail",
    scope: "audit:read",
    description: "Append-only activity history for business operations.",
  },
] as const;
export async function adminList(
  actor: Actor,
  resource: string,
  page = 1,
  q = "",
) {
  const m = modules.find((m) => m.slug === resource);
  invariant(m, 404, "Module not found.");
  requireScope(actor, m.scope as Permission);
  const range = {
    take: 30,
    skip: (Math.max(1, Math.min(page, 1000)) - 1) * 30,
  };
  switch (resource) {
    case "products": {
      const rows = await db.product.findMany({
        ...range,
        where: q ? { name: { contains: q, mode: "insensitive" } } : {},
        include: {
          brand: true,
          category: true,
          skus: true,
          media: { orderBy: productMediaOrder },
        },
        orderBy: { updatedAt: "desc" },
      });
      return rows.map((p) => ({
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
      }));
    }
    case "categories":
      return db.category.findMany({ ...range, orderBy: { position: "asc" } });
    case "brands":
      return db.brand.findMany({ ...range, orderBy: { name: "asc" } });
    case "attributes":
      return db.attribute.findMany({
        ...range,
        include: { category: { select: { name: true } } },
      });
    case "collections":
      return db.collection.findMany({
        ...range,
        include: { _count: { select: { products: true } } },
      });
    case "inventory":
      return db.sku.findMany({
        ...range,
        select: {
          id: true,
          code: true,
          onHand: true,
          reserved: true,
          version: true,
          product: { select: { name: true } },
        },
        orderBy: { onHand: "asc" },
      });
    case "orders":
      return db.order.findMany({
        ...range,
        select: {
          id: true,
          reference: true,
          email: true,
          status: true,
          paymentStatus: true,
          total: true,
          demo: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      });
    case "returns":
      return db.returnRequest.findMany({
        ...range,
        include: { order: { select: { reference: true } } },
        orderBy: { createdAt: "desc" },
      });
    case "customers":
      return db.user.findMany({
        ...range,
        where: { role: "CUSTOMER" },
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
          _count: { select: { orders: true } },
        },
      });
    case "promotions":
      return db.coupon.findMany({ ...range, orderBy: { code: "asc" } });
    case "content":
      return db.contentPage.findMany({ ...range, orderBy: { slug: "asc" } });
    case "home-sections":
      return db.homeSection.findMany({
        ...range,
        orderBy: { position: "asc" },
      });
    case "media":
      return db.media.findMany({ ...range, orderBy: { createdAt: "desc" } });
    case "reviews":
      return db.review.findMany({
        ...range,
        include: { product: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      });
    case "inquiries":
      return db.inquiry.findMany({ ...range, orderBy: { createdAt: "desc" } });
    case "imports":
      return db.importBatch.findMany({
        ...range,
        where: { actorId: actor.id },
        select: { id: true, status: true, createdAt: true, errors: true },
      });
    case "reports":
      return dashboard(actor);
    case "staff":
      return db.user.findMany({
        ...range,
        where: { role: { not: "CUSTOMER" } },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          grants: true,
          createdAt: true,
        },
      });
    case "api-access":
      return db.apiClient.findMany({
        ...range,
        include: {
          keys: {
            select: {
              id: true,
              prefix: true,
              scopes: true,
              expiresAt: true,
              lastUsedAt: true,
              revokedAt: true,
            },
          },
        },
      });
    case "assistant":
      return db.aiRun.findMany({
        ...range,
        where: { actorId: actor.id },
        orderBy: { createdAt: "desc" },
      });
    case "proposals":
      return db.proposal.findMany({
        ...range,
        where: {
          OR: [{ actorId: actor.id }, ...(actor.role === "OWNER" ? [{}] : [])],
        },
        orderBy: { createdAt: "desc" },
      });
    case "jobs":
      return db.job.findMany({
        ...range,
        select: {
          id: true,
          type: true,
          status: true,
          attempts: true,
          lastError: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      });
    case "settings":
      return db.setting.findMany();
    case "audit-events":
      return db.auditEvent.findMany({
        ...range,
        orderBy: { createdAt: "desc" },
      });
  }
}
export async function dashboard(actor: Actor) {
  requireScope(actor, "reports:read");
  const [orders, products, lowStock, pending, failed, sales] =
    await Promise.all([
      db.order.count({ where: { demo: false } }),
      db.product.count(),
      db.$queryRaw<
        { count: bigint }[]
      >`SELECT count(*) FROM "Sku" WHERE "onHand"-reserved<=3`,
      db.proposal.count({
        where: { status: "PENDING", expiresAt: { gt: new Date() } },
      }),
      db.job.count({ where: { status: "FAILED" } }),
      actor.scopes.includes("reports:financial")
        ? db.order.aggregate({
            where: {
              demo: false,
              paymentStatus: "PAID",
              status: { not: "CANCELLED" },
            },
            _sum: { total: true },
          })
        : null,
    ]);
  return {
    orders,
    products,
    lowStock: Number(lowStock[0].count),
    pending,
    failed,
    sales: sales === null ? null : (sales._sum.total ?? 0),
  };
}
const inputSchemas = {
  categories: z
    .object({
      name: z.string().min(2).max(100),
      slug: z.string().regex(/^[a-z0-9-]+$/),
      parentId: z.string().nullable().optional(),
      icon: z.string().default("laptop"),
      visible: z.boolean().default(true),
      position: z.number().int().default(0),
    })
    .strict(),
  brands: z
    .object({
      name: z.string().min(2).max(100),
      slug: z.string().regex(/^[a-z0-9-]+$/),
    })
    .strict(),
  attributes: z
    .object({
      categoryId: z.string(),
      key: z.string().regex(/^[a-z][a-z0-9_]*$/),
      label: z.string().min(2).max(100),
      type: z.enum(["text", "number"]),
      unit: z.string().optional(),
      scope: z.enum(["product", "sku"]),
      required: z.boolean(),
      filterable: z.boolean(),
      comparable: z.boolean(),
      allowed: z.array(z.string()).default([]),
    })
    .strict(),
  collections: z
    .object({
      name: z.string().min(2).max(100),
      slug: z.string().regex(/^[a-z0-9-]+$/),
      productIds: z.array(z.string()).max(100),
    })
    .strict(),
  promotions: z
    .object({
      code: z.string().regex(/^[A-Z0-9-]{3,30}$/),
      percent: z.number().int().min(1).max(100),
      minimum: z.number().int().min(0),
      maxUses: z.number().int().positive(),
      startsAt: z.coerce.date(),
      endsAt: z.coerce.date(),
      active: z.boolean().default(true),
    })
    .strict(),
  content: z
    .object({
      slug: z.string().regex(/^[a-z0-9-]+$/),
      title: z.string().min(2).max(200),
      body: z.string().max(30000),
      published: z.boolean(),
    })
    .strict(),
  "home-sections": homeSectionInput,
};
export async function saveResource(
  actor: Actor,
  resource: string,
  raw: unknown,
  id?: string,
) {
  const scope: Permission = [
    "categories",
    "brands",
    "attributes",
    "collections",
  ].includes(resource)
    ? "catalog:write"
    : resource === "promotions"
      ? "promotions:write"
      : "content:write";
  requireScope(actor, scope);
  invariant(
    resource in inputSchemas,
    404,
    "This resource cannot be changed using this operation.",
  );
  return db.$transaction(async (tx) => {
    let result: unknown;
    switch (resource) {
      case "categories": {
        const d = inputSchemas.categories.parse(raw);
        invariant(
          !id || d.parentId !== id,
          422,
          "A category cannot be its own parent.",
        );
        if (d.parentId) {
          const parent = await tx.category.findUnique({
            where: { id: d.parentId },
          });
          invariant(
            parent && !parent.parentId,
            422,
            "Use a top-level department as the parent.",
          );
        }
        result = id
          ? await tx.category.update({ where: { id }, data: d })
          : await tx.category.create({ data: d });
        break;
      }
      case "brands": {
        const d = inputSchemas.brands.parse(raw);
        result = id
          ? await tx.brand.update({ where: { id }, data: d })
          : await tx.brand.create({ data: d });
        break;
      }
      case "attributes": {
        const d = inputSchemas.attributes.parse(raw);
        result = id
          ? await tx.attribute.update({ where: { id }, data: d })
          : await tx.attribute.create({ data: d });
        break;
      }
      case "collections": {
        const { productIds, ...d } = inputSchemas.collections.parse(raw);
        const c = id
          ? await tx.collection.update({ where: { id }, data: d })
          : await tx.collection.create({ data: d });
        await tx.collectionProduct.deleteMany({
          where: { collectionId: c.id },
        });
        await tx.collectionProduct.createMany({
          data: [...new Set(productIds)].map((productId) => ({
            productId,
            collectionId: c.id,
          })),
        });
        result = c;
        break;
      }
      case "promotions": {
        const d = inputSchemas.promotions.parse(raw);
        invariant(
          d.endsAt > d.startsAt,
          422,
          "End date must be after start date.",
        );
        result = id
          ? await tx.coupon.update({ where: { id }, data: d })
          : await tx.coupon.create({ data: d });
        break;
      }
      case "content": {
        const d = inputSchemas.content.parse(raw);
        result = await tx.contentPage.upsert({
          where: { slug: d.slug },
          create: d,
          update: d,
        });
        break;
      }
      case "home-sections": {
        const { mediaIds, version, ...d } = await prepareHomeSection(raw, tx);
        if (id) {
          const current = await tx.homeSection.findUnique({ where: { id } });
          invariant(current, 404, "Homepage section not found.");
          const changed = await tx.homeSection.updateMany({
            where: { id, version: version ?? current.version },
            data: { ...d, version: { increment: 1 } },
          });
          invariant(
            changed.count === 1,
            409,
            "This section changed in another tab. Reload before saving.",
          );
          result = await tx.homeSection.update({
            where: { id },
            data: { assets: { set: mediaIds.map((id) => ({ id })) } },
          });
        } else {
          result = await tx.homeSection.create({
            data: { ...d, assets: { connect: mediaIds.map((id) => ({ id })) } },
          });
        }
        break;
      }
    }
    await audit(tx, actor, `${resource}.save`, id ?? "new", undefined, result);
    return result;
  });
}
export async function issueKey(actor: Actor, raw: unknown) {
  requireScope(actor, "api_keys:manage");
  invariant(
    actor.human && actor.role === "OWNER",
    403,
    "Only an Owner in a browser session can issue keys.",
  );
  const d = z
    .object({
      name: z.string().min(2).max(100),
      scopes: z.array(z.enum(permissions)).min(1),
      days: z.number().int().min(1).max(365),
    })
    .strict()
    .parse(raw);
  invariant(
    d.scopes.every((s) => actor.scopes.includes(s)),
    403,
    "Scopes exceed your authority.",
  );
  const token = `ift_${secret()}`;
  const client = await db.$transaction(async (tx) => {
    const c = await tx.apiClient.create({
      data: {
        name: d.name,
        scopes: d.scopes,
        keys: {
          create: {
            hash: hash(token),
            prefix: token.slice(0, 12),
            scopes: d.scopes,
            expiresAt: new Date(Date.now() + d.days * 86400000),
          },
        },
      },
    });
    await audit(tx, actor, "api-key.issue", c.id, undefined, {
      name: d.name,
      scopes: d.scopes,
    });
    return c;
  });
  return {
    clientId: client.id,
    key: token,
    message: "Copy this key now. It will not be shown again.",
  };
}
export async function createStaff(actor: Actor, raw: unknown) {
  requireScope(actor, "staff:manage");
  invariant(
    actor.human && actor.role === "OWNER",
    403,
    "Only the Owner can manage staff.",
  );
  const d = z
    .object({
      name: z.string().trim().min(2).max(100),
      email: z.string().trim().toLowerCase().pipe(z.email()),
      password: z.string().min(12).max(128),
      role: z.enum([
        "MANAGER",
        "CATALOG",
        "CONTENT",
        "EDITOR",
        "INVENTORY",
        "SUPPORT",
        "ANALYST",
      ]),
    })
    .strict()
    .parse(raw);
  const u = await auth.api.signUpEmail({
    body: { name: d.name, email: d.email, password: d.password },
  });
  return db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: u.user.id }, data: { role: d.role } });
    await tx.session.deleteMany({ where: { userId: u.user.id } });
    await audit(tx, actor, "staff.create", u.user.id, undefined, {
      email: d.email,
      role: d.role,
    });
    return {
      id: u.user.id,
      name: d.name,
      email: d.email,
      role: d.role,
      scopes: roles[d.role],
    };
  });
}
export async function updateStaffAccess(
  actor: Actor,
  targetId: string,
  raw: unknown,
) {
  requireScope(actor, "staff:manage");
  invariant(
    actor.human && actor.role === "OWNER",
    403,
    "Only the Owner can manage staff.",
  );
  const { role } = z
    .object({
      role: z.enum([
        "MANAGER",
        "CATALOG",
        "CONTENT",
        "EDITOR",
        "INVENTORY",
        "SUPPORT",
        "ANALYST",
        "STAFF_DISABLED",
      ]),
    })
    .strict()
    .parse(raw);
  return db.$transaction(async (tx) => {
    const owner = await tx.user.findUnique({
      where: { id: actor.id },
      select: { role: true },
    });
    invariant(owner?.role === "OWNER", 403, "Owner access is required.");
    const target = await tx.user.findUnique({
      where: { id: targetId },
      select: { role: true, grants: true },
    });
    invariant(target, 404, "Staff account not found.");
    invariant(
      targetId !== actor.id && target.role !== "OWNER",
      403,
      "The Owner account cannot be changed here.",
    );
    invariant(
      target.role !== "CUSTOMER",
      403,
      "Create a named staff account instead of promoting a public registration.",
    );
    const updated = await tx.user.update({
      where: { id: targetId },
      data: { role, grants: [] },
      select: { id: true, name: true, email: true, role: true },
    });
    await tx.session.deleteMany({ where: { userId: targetId } });
    await audit(tx, actor, "staff.access-update", targetId, target, {
      role,
      grants: [],
    });
    return updated;
  });
}
export async function importPreview(actor: Actor, raw: unknown) {
  requireScope(actor, "catalog:write");
  const { csv } = z
    .object({ csv: z.string().max(1_000_000) })
    .strict()
    .parse(raw);
  const lines = csv
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n/);
  invariant(lines.length > 1 && lines.length <= 501, 422, "Import 1–500 rows.");
  // Strict simple CSV template intentionally rejects quoted multiline data.
  const headers = lines[0].split(",").map((s) => s.trim());
  invariant(
    headers.join(",") === "name,sku,brand,category,price_aed,description",
    422,
    "Use the supplied template columns. Quoted or multiline CSV is not supported.",
  );
  const rows: ProductInputForImport[] = [];
  const errors: { row: number; message: string }[] = [];
  const seen = new Set<string>();
  const [brands, cats] = await Promise.all([
    db.brand.findMany(),
    db.category.findMany(),
  ]);
  for (const [i, line] of lines.slice(1).entries()) {
    try {
      const values = line.split(",").map((s) => s.trim());
      invariant(
        values.length === 6 && !line.includes('"'),
        422,
        "Use six unquoted columns; commas and newlines inside values are unsupported.",
      );
      const [name, sku, brand, category, price, description] = values;
      invariant(!seen.has(sku), 422, "Duplicate SKU in file.");
      seen.add(sku);
      invariant(
        !(await db.sku.findUnique({ where: { code: sku } })),
        422,
        "Existing SKU. Use the product editor for changes to live data.",
      );
      const b = brands.find((b) => b.slug === brand);
      const c = cats.find((c) => c.slug === category);
      invariant(b && c, 422, "Unknown brand or category slug.");
      invariant(
        /^\d+(\.\d{1,2})?$/.test(price),
        422,
        "Price must have at most two decimals.",
      );
      const data = productInput.parse({
        name,
        slug: slugify(name),
        description,
        brandId: b.id,
        categoryId: c.id,
        skus: [{ code: sku, price: Math.round(Number(price) * 100) }],
      });
      rows.push(data);
    } catch (e) {
      errors.push({
        row: i + 2,
        message: e instanceof Error ? e.message : "Invalid row",
      });
    }
  }
  return db.importBatch.create({
    data: {
      actorId: actor.id,
      rows: json<Prisma.InputJsonValue>(rows),
      errors,
    },
  });
}
type ProductInputForImport = z.infer<typeof productInput>;
export async function commitImport(actor: Actor, id: string) {
  requireScope(actor, "catalog:write");
  requireScope(actor, "pricing:write");
  invariant(
    actor.human && actor.source !== "ai",
    403,
    "A human must review and commit the validated batch.",
  );
  return db.$transaction(async (tx) => {
    const batch = await tx.importBatch.findFirst({
      where: { id, actorId: actor.id, status: "PREVIEW" },
    });
    invariant(batch, 409, "Import is unavailable or already committed.");
    invariant(
      Array.isArray(batch.errors) && batch.errors.length === 0,
      422,
      "Resolve all row errors before committing.",
    );
    await tx.importBatch.update({ where: { id }, data: { status: "QUEUED" } });
    return tx.job.create({
      data: {
        type: "IMPORT",
        actorId: actor.id,
        payload: { batchId: id },
        dedupeKey: `import:${id}`,
      },
    });
  });
}
export async function executeImport(tx: Tx, actor: Actor, id: string) {
  const batch = await tx.importBatch.findUniqueOrThrow({ where: { id } });
  const results = [];
  for (const row of batch.rows as unknown as ProductInputForImport[])
    results.push(await createProduct(actor, row, tx));
  await tx.importBatch.update({ where: { id }, data: { status: "COMPLETED" } });
  return { created: results.length };
}
export const csvCell = (value: unknown) =>
  `"${String(value ?? "")
    .replace(/^[=+@\-\t\r]/, "'$&")
    .replaceAll('"', '""')}"`;
