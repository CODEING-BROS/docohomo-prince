import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "../generated/prisma/client";
import { type Column, EXPORT_LIMIT, idsBody, idsQuery, sendCsv, stamp } from "../lib/bulk";
import { HttpError, getPage, idParam, notFound, num, optionalInt, optionalString, paged } from "../lib/http";
import { prisma } from "../lib/prisma";
import { DEFAULT_ZONE, addDays, dayInZone, dayStart, isoDay, zoneParam } from "../lib/time";

// Day-to-day running of the shop: stock on hand, messages from the website forms, and home page banners.
export const inventoryRoutes = Router();
export const enquiryRoutes = Router();
export const bannerRoutes = Router();

const blank = (v: unknown) => (v === "" ? undefined : v);
const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const optionalText = (max: number) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable().optional());

// ─────────────────────────────────────────────── inventory (one row per variant)

const STOCK_STATES = ["in", "low", "out"] as const;
type StockState = (typeof STOCK_STATES)[number];

const STATE_LABEL: Record<StockState, string> = { in: "In stock", low: "Running low", out: "Out of stock" };

/** Out at zero, low at or under the variant's own limit, otherwise in stock. */
const stateOf = (stock: number, limit: number): StockState => (stock <= 0 ? "out" : stock <= limit ? "low" : "in");

/** The same three states as a database filter; the limit is each variant's own column. */
const stateWhere = (state: StockState): Prisma.ProductVariantWhereInput => {
  const limit = prisma.productVariant.fields.lowStockThreshold;
  if (state === "out") return { stockQuantity: { lte: 0 } };
  if (state === "low") return { stockQuantity: { gt: 0, lte: limit } };
  return { AND: [{ stockQuantity: { gt: 0 } }, { stockQuantity: { gt: limit } }] };
};

const inventoryFilters = z.object({
  q: optionalString,
  brandId: optionalInt,
  stock: z.preprocess(blank, z.enum(STOCK_STATES).optional()),
});

const inventoryWhere = (filters: z.infer<typeof inventoryFilters>) => {
  const base: Prisma.ProductVariantWhereInput = {};
  if (filters.q) {
    base.OR = [
      { sku: { contains: filters.q, mode: "insensitive" } },
      { product: { name: { contains: filters.q, mode: "insensitive" } } },
    ];
  }
  if (filters.brandId) base.product = { brandId: filters.brandId };
  const where: Prisma.ProductVariantWhereInput = filters.stock ? { AND: [base, stateWhere(filters.stock)] } : base;
  return { base, where };
};

const inventoryOrder: Prisma.ProductVariantOrderByWithRelationInput[] = [{ product: { name: "asc" } }, { sortOrder: "asc" }, { id: "asc" }];

inventoryRoutes.get("/", async (req, res) => {
  const { page, pageSize, skip, take } = getPage(req);
  const { base, where } = inventoryWhere(inventoryFilters.parse(req.query));

  const [total, variants, units, low, out] = await Promise.all([
    prisma.productVariant.count({ where }),
    prisma.productVariant.findMany({
      where,
      orderBy: inventoryOrder,
      skip,
      take,
      select: {
        id: true, productId: true, sku: true, title: true, stockQuantity: true, lowStockThreshold: true,
        images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
        product: {
          select: {
            name: true, status: true,
            brand: { select: { id: true, name: true } },
            images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
          },
        },
      },
    }),
    // the cards follow the search and the brand, but not the stock filter, so they always add up
    prisma.productVariant.aggregate({ where: { AND: [base, { stockQuantity: { gt: 0 } }] }, _sum: { stockQuantity: true } }),
    prisma.productVariant.count({ where: { AND: [base, stateWhere("low")] } }),
    prisma.productVariant.count({ where: { AND: [base, stateWhere("out")] } }),
  ]);

  const items = variants.map(({ product, images, ...v }) => ({
    ...v,
    productName: product.name,
    productStatus: product.status,
    brand: product.brand,
    imageUrl: images[0]?.url ?? product.images[0]?.url ?? null,
    state: stateOf(v.stockQuantity, v.lowStockThreshold),
  }));

  res.json({
    ...paged(items, total, page, pageSize),
    summary: { units: units._sum.stockQuantity ?? 0, low, out },
  });
});

inventoryRoutes.get("/export", async (req, res) => {
  const filters = inventoryFilters.extend({ ids: idsQuery }).parse(req.query);
  const rows = await prisma.productVariant.findMany({
    where: filters.ids ? { id: { in: filters.ids } } : inventoryWhere(filters).where,
    orderBy: inventoryOrder,
    take: EXPORT_LIMIT,
    include: { product: { select: { name: true, brand: { select: { name: true } } } } },
  });
  const columns: Column<(typeof rows)[number]>[] = [
    { header: "Product", value: (v) => v.product.name },
    { header: "Variant", value: (v) => v.title },
    { header: "SKU", value: (v) => v.sku },
    { header: "Brand", value: (v) => v.product.brand?.name },
    { header: "Stock on hand", value: (v) => v.stockQuantity },
    { header: "Low-stock limit", value: (v) => v.lowStockThreshold },
    { header: "Status", value: (v) => STATE_LABEL[stateOf(v.stockQuantity, v.lowStockThreshold)] },
  ];
  sendCsv(res, "inventory", columns, rows);
});

// Every stock change for one variant, newest first.
inventoryRoutes.get("/:id/movements", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const variant = await prisma.productVariant.findUnique({
    where: { id },
    select: { id: true, sku: true, title: true, stockQuantity: true, lowStockThreshold: true, product: { select: { name: true } } },
  });
  if (!variant) throw notFound("Variant");
  const movements = await prisma.inventoryMovement.findMany({
    where: { variantId: id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 200,
    select: { id: true, type: true, quantity: true, balanceAfter: true, note: true, createdAt: true },
  });
  const { product, ...rest } = variant;
  res.json({ variant: { ...rest, productName: product.name }, items: movements });
});

const MAX_STOCK = 1_000_000;

const adjustInput = z
  .object({
    change: z
      .object({
        mode: z.enum(["add", "remove", "set"]),
        quantity: z.number().int().min(0).max(MAX_STOCK),
        reason: z.enum(["PURCHASE", "RETURN", "DAMAGE", "EXPIRED", "ADJUSTMENT"]),
        note: optionalText(500),
      })
      .optional(),
    lowStockThreshold: z.number().int().min(0).max(MAX_STOCK).optional(),
  })
  .refine((body) => body.change !== undefined || body.lowStockThreshold !== undefined, "Nothing to change");

// Add, remove or set the stock of one variant, and/or change its low-stock limit.
// The new quantity and the history row are saved together, so the history always explains the quantity.
inventoryRoutes.post("/:id/adjust", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { change, lowStockThreshold } = adjustInput.parse(req.body);
  if (change && change.mode !== "set" && change.quantity < 1) throw new HttpError(400, "Enter a quantity of 1 or more");

  const saved = await prisma.$transaction(async (tx) => {
    // the row is locked until the change is saved, so two people adjusting at once cannot lose a change
    const [current] = await tx.$queryRaw<{ stockQuantity: number; lowStockThreshold: number }[]>`
      SELECT "stockQuantity", "lowStockThreshold" FROM "ProductVariant" WHERE id = ${id} FOR UPDATE`;
    if (!current) throw notFound("Variant");

    const before = current.stockQuantity;
    const after = !change ? before : change.mode === "add" ? before + change.quantity : change.mode === "remove" ? before - change.quantity : change.quantity;
    if (after < 0) {
      throw new HttpError(400, `Only ${before} in stock, so ${change!.quantity} cannot be removed. Stock cannot go below zero.`);
    }
    if (after > MAX_STOCK) throw new HttpError(400, "That is more stock than one variant can hold");

    const moved = after - before;
    const limitChanged = lowStockThreshold !== undefined && lowStockThreshold !== current.lowStockThreshold;
    const variant = await tx.productVariant.update({
      where: { id },
      data: { stockQuantity: after, ...(limitChanged ? { lowStockThreshold } : {}) },
      select: { id: true, stockQuantity: true, lowStockThreshold: true },
    });
    if (moved !== 0) {
      await tx.inventoryMovement.create({
        data: { variantId: id, type: change!.reason, quantity: moved, balanceAfter: after, note: change!.note ?? null, createdById: req.user!.id },
      });
    }
    if (limitChanged) {
      await tx.auditLog.create({
        data: {
          actorId: req.user!.id, action: "inventory.low-stock-limit", entity: "ProductVariant", entityId: String(id),
          changes: { from: current.lowStockThreshold, to: lowStockThreshold },
        },
      });
    }
    return { ...variant, moved, limitChanged };
  });

  res.json({ ...saved, state: stateOf(saved.stockQuantity, saved.lowStockThreshold) });
});

// ─────────────────────────────────────────────── enquiries

const ENQUIRY_TYPES = ["CONTACT", "WHOLESALE", "DOCTOR_CONSULTATION", "ORDER"] as const;
const ENQUIRY_STATUSES = ["NEW", "IN_PROGRESS", "CLOSED"] as const;

const enquiryFilters = z.object({
  q: optionalString,
  type: z.preprocess(blank, z.enum(ENQUIRY_TYPES).optional()),
  status: z.preprocess(blank, z.enum(ENQUIRY_STATUSES).optional()),
});

const enquiryWhere = (filters: z.infer<typeof enquiryFilters>) => {
  const base: Prisma.EnquiryWhereInput = {};
  if (filters.q) {
    base.OR = [
      { name: { contains: filters.q, mode: "insensitive" } },
      { phone: { contains: filters.q } },
      { email: { contains: filters.q, mode: "insensitive" } },
      { message: { contains: filters.q, mode: "insensitive" } },
    ];
  }
  if (filters.type) base.type = filters.type;
  const where: Prisma.EnquiryWhereInput = { ...base, ...(filters.status ? { status: filters.status } : {}) };
  return { base, where };
};

const enquiryOrder: Prisma.EnquiryOrderByWithRelationInput[] = [{ createdAt: "desc" }, { id: "desc" }];
const enquirySelect = { id: true, type: true, name: true, phone: true, email: true, message: true, details: true, status: true, createdAt: true, updatedAt: true } as const;

/** "productName" -> "Product name" */
const labelOf = (key: string) => {
  const text = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim().toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** The form-specific fields as one line of text, for the export file. */
const detailText = (details: unknown) => {
  if (details === null || details === undefined) return "";
  if (typeof details !== "object" || Array.isArray(details)) return typeof details === "string" ? details : JSON.stringify(details);
  return Object.entries(details)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${labelOf(key)}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`)
    .join("; ");
};

enquiryRoutes.get("/", async (req, res) => {
  const { page, pageSize, skip, take } = getPage(req);
  const { base, where } = enquiryWhere(enquiryFilters.parse(req.query));

  const [total, items, statusCounts] = await Promise.all([
    prisma.enquiry.count({ where }),
    prisma.enquiry.findMany({ where, orderBy: enquiryOrder, skip, take, select: enquirySelect }),
    prisma.enquiry.groupBy({ by: ["status"], where: base, _count: true }),
  ]);

  res.json({
    ...paged(items, total, page, pageSize),
    statusCounts: Object.fromEntries(statusCounts.map((s) => [s.status, s._count])),
  });
});

enquiryRoutes.get("/export", async (req, res) => {
  const filters = enquiryFilters.extend({ ids: idsQuery, tz: zoneParam }).parse(req.query);
  const rows = await prisma.enquiry.findMany({
    where: filters.ids ? { id: { in: filters.ids } } : enquiryWhere(filters).where,
    orderBy: enquiryOrder,
    take: EXPORT_LIMIT,
  });
  const columns: Column<(typeof rows)[number]>[] = [
    { header: `Received (${filters.tz})`, value: (e) => stamp(e.createdAt, filters.tz) },
    { header: "Type", value: (e) => e.type },
    { header: "Name", value: (e) => e.name },
    { header: "Phone", value: (e) => e.phone },
    { header: "Email", value: (e) => e.email },
    { header: "Message", value: (e) => e.message },
    { header: "Details", value: (e) => detailText(e.details) },
    { header: "Status", value: (e) => e.status },
  ];
  sendCsv(res, "enquiries", columns, rows);
});

enquiryRoutes.post("/bulk-delete", async (req, res) => {
  const { ids } = idsBody.parse(req.body);
  const deleted = await prisma.enquiry.deleteMany({ where: { id: { in: ids } } });
  await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "enquiry.bulk-delete", entity: "Enquiry", changes: { ids } } });
  res.json({ deleted: deleted.count, skipped: ids.length - deleted.count });
});

enquiryRoutes.get("/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const enquiry = await prisma.enquiry.findUnique({ where: { id }, select: enquirySelect });
  if (!enquiry) throw notFound("Enquiry");
  res.json(enquiry);
});

enquiryRoutes.patch("/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { status } = z.object({ status: z.enum(ENQUIRY_STATUSES) }).parse(req.body);
  if (!(await prisma.enquiry.findUnique({ where: { id }, select: { id: true } }))) throw notFound("Enquiry");
  res.json(await prisma.enquiry.update({ where: { id }, data: { status }, select: enquirySelect }));
});

// ─────────────────────────────────────────────── banners

const PLATFORMS = ["DESKTOP", "MOBILE"] as const;

const imageAddress = z.union([z.url(), z.string().regex(/^\/uploads\/[\w./-]+$/)], "Upload an image, or enter a full link starting with https://");
// where a banner leads: a full link, or a page on the store such as /products
const linkAddress = z.union([z.url(), z.string().regex(/^\/\S*$/)], "Enter a full link starting with https://, or a store page such as /products");
const optionalDay = z.preprocess(emptyToNull, isoDay.nullable().optional());

const bannerInput = z.object({
  title: z.preprocess(emptyToNull, z.string().trim().max(200, "Keep the title under 200 characters").nullable().optional()),
  imageUrl: imageAddress,
  linkUrl: z.preprocess(emptyToNull, linkAddress.nullable().optional()),
  platform: z.enum(PLATFORMS, "Choose desktop or mobile"),
  isActive: z.boolean().optional(),
  // calendar days in the store's own timezone; the banner shows from the start of the first to the end of the last
  startsOn: optionalDay,
  endsOn: optionalDay,
});

/** Reads the banner form; what is wrong is said in words the page can show as they are. */
const readBanner = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpError(400, result.error.issues[0]?.message ?? "Check the banner details", result.error.issues);
  return result.data;
};

const startOf = (day: string) => dayStart(day, DEFAULT_ZONE);
const endOf = (day: string) => new Date(dayStart(addDays(day, 1), DEFAULT_ZONE).getTime() - 1);
const dayOf = (at: Date | null) => (at ? dayInZone(at, DEFAULT_ZONE) : null);

type BannerRecord = Awaited<ReturnType<typeof prisma.banner.findFirstOrThrow>>;

const bannerOut = (banner: BannerRecord, now = new Date()) => ({
  id: banner.id, title: banner.title, imageUrl: banner.imageUrl, linkUrl: banner.linkUrl, platform: banner.platform,
  placement: banner.placement, sortOrder: banner.sortOrder, isActive: banner.isActive,
  startsOn: dayOf(banner.startsAt), endsOn: dayOf(banner.endsAt),
  // what a shopper sees right now
  state: !banner.isActive ? "HIDDEN" : banner.startsAt && banner.startsAt > now ? "SCHEDULED" : banner.endsAt && banner.endsAt < now ? "ENDED" : "LIVE",
});

const bannerOrder: Prisma.BannerOrderByWithRelationInput[] = [{ sortOrder: "asc" }, { id: "asc" }];

// Every banner, in the order the store shows them. There are few, so the page splits them by platform itself.
bannerRoutes.get("/", async (_req, res) => {
  const banners = await prisma.banner.findMany({ orderBy: bannerOrder });
  res.json({ items: banners.map((banner) => bannerOut(banner)) });
});

bannerRoutes.post("/", async (req, res) => {
  const { startsOn, endsOn, ...input } = readBanner(bannerInput, req.body);
  if (startsOn && endsOn && endsOn < startsOn) throw new HttpError(400, "The end date is before the start date");
  // a new banner goes last on its platform
  const last = await prisma.banner.aggregate({ where: { platform: input.platform }, _max: { sortOrder: true } });
  const banner = await prisma.banner.create({
    data: {
      ...input,
      sortOrder: last._max.sortOrder === null ? 0 : last._max.sortOrder + 1,
      startsAt: startsOn ? startOf(startsOn) : null,
      endsAt: endsOn ? endOf(endsOn) : null,
    },
  });
  res.status(201).json(bannerOut(banner));
});

// Saves a new display order: the ids of one platform's banners, first to last.
bannerRoutes.post("/reorder", async (req, res) => {
  const { ids } = z.object({ ids: z.array(z.number().int().positive()).min(1).max(200) }).parse(req.body);
  if (new Set(ids).size !== ids.length) throw new HttpError(400, "A banner is listed twice");
  const found = await prisma.banner.findMany({ where: { id: { in: ids } }, select: { platform: true } });
  if (found.length !== ids.length) throw new HttpError(400, "One of these banners no longer exists. Reload the page and try again.");
  if (new Set(found.map((b) => b.platform)).size > 1) throw new HttpError(400, "Desktop and mobile banners are ordered separately");
  await prisma.$transaction(ids.map((id, sortOrder) => prisma.banner.update({ where: { id }, data: { sortOrder } })));
  res.json({ ok: true });
});

bannerRoutes.patch("/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { startsOn, endsOn, ...input } = readBanner(bannerInput.partial(), req.body);
  const existing = await prisma.banner.findUnique({ where: { id } });
  if (!existing) throw notFound("Banner");

  const startsAt = startsOn === undefined ? existing.startsAt : startsOn ? startOf(startsOn) : null;
  const endsAt = endsOn === undefined ? existing.endsAt : endsOn ? endOf(endsOn) : null;
  if (startsAt && endsAt && endsAt < startsAt) throw new HttpError(400, "The end date is before the start date");

  const data: Prisma.BannerUpdateInput = { ...input, startsAt, endsAt };
  // moved to the other platform: it goes last there
  if (input.platform && input.platform !== existing.platform) {
    const last = await prisma.banner.aggregate({ where: { platform: input.platform }, _max: { sortOrder: true } });
    data.sortOrder = last._max.sortOrder === null ? 0 : last._max.sortOrder + 1;
  }
  res.json(bannerOut(await prisma.banner.update({ where: { id }, data })));
});

bannerRoutes.post("/bulk-delete", async (req, res) => {
  const { ids } = idsBody.parse(req.body);
  const deleted = await prisma.banner.deleteMany({ where: { id: { in: ids } } });
  await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "banner.bulk-delete", entity: "Banner", changes: { ids } } });
  res.json({ deleted: deleted.count, skipped: ids.length - deleted.count });
});

bannerRoutes.delete("/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  if (!(await prisma.banner.findUnique({ where: { id }, select: { id: true } }))) throw notFound("Banner");
  await prisma.banner.delete({ where: { id } });
  await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "banner.delete", entity: "Banner", entityId: String(id) } });
  res.json({ ok: true });
});
