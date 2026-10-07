import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "../generated/prisma/client";
import { type Column, EXPORT_LIMIT, idsBody, idsQuery, sendCsv, stamp } from "../lib/bulk";
import { HttpError, getPage, idParam, notFound, num, numOrNull, optionalString, paged } from "../lib/http";
import { prisma } from "../lib/prisma";
import { addDays, dayStart, isoDay, zoneParam } from "../lib/time";

// Coupons, delivery charges and the payments received.
// Each router also has its own "/export" and "/bulk-delete", declared before "/:id".
export const couponRoutes = Router();
export const shippingRoutes = Router();
export const paymentRoutes = Router();

const blank = (v: unknown) => (v === "" ? undefined : v);
const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

/** Reads a form; the first problem is sent back in plain words so the page can show it. */
const readBody = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid input", parsed.error.issues);
  return parsed.data;
};

const rupees = (message: string) => z.number(message).min(0, message).max(99_999_999, "That amount is too large");
const channelInput = z.enum(["D2C", "B2B"], "Choose retail, trade or both").nullable().optional(); // null = both
const channelFilter = z.preprocess(blank, z.enum(["D2C", "B2B", "BOTH"]).optional());
const channelLabel = (channel: "D2C" | "B2B" | null) => (channel === "D2C" ? "Retail (D2C)" : channel === "B2B" ? "Trade (B2B)" : "Both");
const yesNo = (value: boolean) => (value ? "Yes" : "No");

/** Records who deleted what. */
const logDelete = (actorId: number, entity: string, ids: number[]) =>
  prisma.auditLog.create({ data: { actorId, action: `${entity.toLowerCase()}.bulk-delete`, entity, changes: { ids } } });

const result = (deleted: number, skipped: number, reason?: string) => ({ deleted, skipped, reason: skipped ? reason : undefined });

// ─────────────────────────────────────────────── coupons

type CouponFields = {
  code: string;
  description: string | null;
  type: "PERCENT" | "FLAT" | "FREE_SHIPPING";
  value: number;
  maxDiscount: number | null;
  minOrderValue: number | null;
  channel: "D2C" | "B2B" | null;
  usageLimit: number | null;
  perUserLimit: number | null;
  startsAt: Date | null;
  expiresAt: Date | null;
  isActive: boolean;
};

const count = (message: string) => z.number(message).int(message).min(1, message).max(10_000_000, "That number is too large").nullable().optional();
const dayInput = z.preprocess(emptyToNull, isoDay.nullable().optional());

// Dates arrive as calendar days ("2026-10-05") in the timezone the admin is showing (`tz`).
// A coupon starts at the beginning of its first day and works until the end of its last day.
const couponInput = z.object({
  code: z
    .string("Enter a coupon code").trim().toUpperCase()
    .min(3, "A coupon code needs at least 3 characters").max(40, "A coupon code can be up to 40 characters")
    .regex(/^[A-Z0-9_-]+$/, "Use only letters, numbers, - and _ in the code, with no spaces"),
  description: z.preprocess(emptyToNull, z.string().trim().max(500, "Keep the description under 500 characters").nullable().optional()),
  type: z.enum(["PERCENT", "FLAT", "FREE_SHIPPING"], "Choose what the coupon gives"),
  value: rupees("Enter the discount").optional(),
  maxDiscount: rupees("Enter the highest discount in rupees").nullable().optional(),
  minOrderValue: rupees("Enter the smallest order value in rupees").nullable().optional(),
  channel: channelInput,
  usageLimit: count("The total number of uses must be a whole number, 1 or more"),
  perUserLimit: count("The uses per customer must be a whole number, 1 or more"),
  startsAt: dayInput,
  expiresAt: dayInput,
  isActive: z.boolean().optional(),
});

/** Makes the fields agree with the coupon type, and refuses combinations that cannot work. */
const checkCoupon = (coupon: CouponFields): CouponFields => {
  const c = { ...coupon };
  if (c.type === "PERCENT" && (c.value < 1 || c.value > 100)) throw new HttpError(400, "A percentage discount must be between 1 and 100");
  if (c.type === "FLAT" && c.value <= 0) throw new HttpError(400, "Enter the discount amount in rupees");
  if (c.type === "FREE_SHIPPING") c.value = 0;
  if (c.type !== "PERCENT") c.maxDiscount = null; // only a percentage needs an upper limit
  if (c.maxDiscount !== null && c.maxDiscount <= 0) c.maxDiscount = null;
  if (c.type === "FLAT" && c.minOrderValue !== null && c.minOrderValue > 0 && c.minOrderValue < c.value) {
    throw new HttpError(400, "The smallest order value cannot be less than the discount itself");
  }
  if (c.startsAt && c.expiresAt && c.expiresAt <= c.startsAt) throw new HttpError(400, "The last day must be on or after the first day");
  if (c.usageLimit !== null && c.perUserLimit !== null && c.perUserLimit > c.usageLimit) {
    throw new HttpError(400, "The uses per customer cannot be more than the total number of uses");
  }
  return c;
};

const firstMoment = (day: string, zone: string) => dayStart(day, zone);
const lastMoment = (day: string, zone: string) => new Date(dayStart(addDays(day, 1), zone).getTime() - 1);

type CouponRecord = Prisma.CouponGetPayload<object>;

/** Where a coupon stands right now, in the order a shop owner would think about it. */
const couponStatus = (c: CouponRecord, now: Date) =>
  c.expiresAt && c.expiresAt < now ? "EXPIRED"
  : !c.isActive ? "OFF"
  : c.startsAt && c.startsAt > now ? "SCHEDULED"
  : c.usageLimit !== null && c.usedCount >= c.usageLimit ? "USED_UP"
  : "ACTIVE";

const toCoupon = ({ legacyId: _legacy, ...c }: CouponRecord, now: Date) => ({
  ...c,
  value: num(c.value),
  maxDiscount: numOrNull(c.maxDiscount),
  minOrderValue: numOrNull(c.minOrderValue),
  status: couponStatus({ ...c, legacyId: _legacy }, now),
});

const couponFilters = z.object({
  q: optionalString,
  status: z.preprocess(blank, z.enum(["ACTIVE", "EXPIRED", "OFF"]).optional()),
  channel: channelFilter,
});

/** `base` is everything except the status filter, so the status tabs can show their own counts. */
const couponWhere = (filters: z.infer<typeof couponFilters>, now: Date) => {
  const base: Prisma.CouponWhereInput = {};
  if (filters.q) base.code = { contains: filters.q, mode: "insensitive" };
  if (filters.channel) base.channel = filters.channel === "BOTH" ? null : filters.channel;

  const notExpired: Prisma.CouponWhereInput = { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] };
  const byStatus: Record<"ACTIVE" | "EXPIRED" | "OFF", Prisma.CouponWhereInput> = {
    ACTIVE: { isActive: true, ...notExpired },
    EXPIRED: { expiresAt: { lt: now } },
    OFF: { isActive: false, ...notExpired },
  };
  const where: Prisma.CouponWhereInput = filters.status ? { AND: [base, byStatus[filters.status]] } : base;
  return { base, where, byStatus };
};

couponRoutes.get("/", async (req, res) => {
  const { page, pageSize, skip, take } = getPage(req);
  const now = new Date();
  const { base, where, byStatus } = couponWhere(couponFilters.parse(req.query), now);

  const [total, coupons, active, expired, off] = await Promise.all([
    prisma.coupon.count({ where }),
    prisma.coupon.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take }),
    prisma.coupon.count({ where: { AND: [base, byStatus.ACTIVE] } }),
    prisma.coupon.count({ where: { AND: [base, byStatus.EXPIRED] } }),
    prisma.coupon.count({ where: { AND: [base, byStatus.OFF] } }),
  ]);

  res.json({
    ...paged(coupons.map((c) => toCoupon(c, now)), total, page, pageSize),
    statusCounts: { ACTIVE: active, EXPIRED: expired, OFF: off },
  });
});

couponRoutes.get("/export", async (req, res) => {
  const filters = couponFilters.extend({ ids: idsQuery, tz: zoneParam }).parse(req.query);
  const now = new Date();
  const coupons = await prisma.coupon.findMany({
    where: filters.ids ? { id: { in: filters.ids } } : couponWhere(filters, now).where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: EXPORT_LIMIT,
  });
  const statusLabel: Record<ReturnType<typeof couponStatus>, string> = {
    ACTIVE: "Active", SCHEDULED: "Not started yet", USED_UP: "Fully used", EXPIRED: "Expired", OFF: "Turned off",
  };
  const columns: Column<(typeof coupons)[number]>[] = [
    { header: "Code", value: (c) => c.code },
    { header: "Description", value: (c) => c.description },
    { header: "Gives", value: (c) => (c.type === "PERCENT" ? "Percentage off" : c.type === "FLAT" ? "Amount off" : "Free delivery") },
    { header: "Discount", value: (c) => (c.type === "FREE_SHIPPING" ? null : num(c.value)) },
    { header: "Highest discount", value: (c) => numOrNull(c.maxDiscount) },
    { header: "Smallest order value", value: (c) => numOrNull(c.minOrderValue) },
    { header: "Works for", value: (c) => channelLabel(c.channel) },
    { header: "Total uses allowed", value: (c) => c.usageLimit },
    { header: "Uses per customer", value: (c) => c.perUserLimit },
    { header: "Times used", value: (c) => c.usedCount },
    { header: `Starts (${filters.tz})`, value: (c) => stamp(c.startsAt, filters.tz) },
    { header: `Ends (${filters.tz})`, value: (c) => stamp(c.expiresAt, filters.tz) },
    { header: "Status", value: (c) => statusLabel[couponStatus(c, now)] },
  ];
  sendCsv(res, "coupons", columns, coupons);
});

couponRoutes.post("/bulk-delete", async (req, res) => {
  const { ids } = idsBody.parse(req.body);
  // a coupon that customers have used stays, so its history is not lost; turn it off instead
  const deletable = await prisma.coupon.findMany({ where: { id: { in: ids }, usedCount: 0, redemptions: { none: {} } }, select: { id: true } });
  const deleted = await prisma.coupon.deleteMany({ where: { id: { in: deletable.map((c) => c.id) } } });
  await logDelete(req.user!.id, "Coupon", deletable.map((c) => c.id));
  res.json(result(deleted.count, ids.length - deleted.count, "Coupons that have already been used were kept. Turn them off instead."));
});

couponRoutes.post("/", async (req, res) => {
  const { startsAt, expiresAt, ...input } = readBody(couponInput, req.body);
  const { tz } = z.object({ tz: zoneParam }).parse(req.body);
  const data = checkCoupon({
    code: input.code,
    description: input.description ?? null,
    type: input.type,
    value: input.value ?? 0,
    maxDiscount: input.maxDiscount ?? null,
    minOrderValue: input.minOrderValue ?? null,
    channel: input.channel ?? null,
    usageLimit: input.usageLimit ?? null,
    perUserLimit: input.perUserLimit ?? null,
    startsAt: startsAt ? firstMoment(startsAt, tz) : null,
    expiresAt: expiresAt ? lastMoment(expiresAt, tz) : null,
    isActive: input.isActive ?? true,
  });
  if (await prisma.coupon.findUnique({ where: { code: data.code } })) throw new HttpError(400, "A coupon with this code already exists");
  res.status(201).json(toCoupon(await prisma.coupon.create({ data }), new Date()));
});

couponRoutes.patch("/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { startsAt, expiresAt, ...input } = readBody(couponInput.partial(), req.body);
  const { tz } = z.object({ tz: zoneParam }).parse(req.body);
  const coupon = await prisma.coupon.findUnique({ where: { id } });
  if (!coupon) throw notFound("Coupon");

  // only what was sent changes; a date that was left alone keeps its exact time
  const sent = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Partial<CouponFields>;
  const data = checkCoupon({
    code: coupon.code,
    description: coupon.description,
    type: coupon.type,
    value: num(coupon.value),
    maxDiscount: numOrNull(coupon.maxDiscount),
    minOrderValue: numOrNull(coupon.minOrderValue),
    channel: coupon.channel,
    usageLimit: coupon.usageLimit,
    perUserLimit: coupon.perUserLimit,
    isActive: coupon.isActive,
    ...sent,
    startsAt: startsAt === undefined ? coupon.startsAt : startsAt ? firstMoment(startsAt, tz) : null,
    expiresAt: expiresAt === undefined ? coupon.expiresAt : expiresAt ? lastMoment(expiresAt, tz) : null,
  });
  if (data.code !== coupon.code && (await prisma.coupon.findUnique({ where: { code: data.code } }))) {
    throw new HttpError(400, "Another coupon already has this code");
  }
  res.json(toCoupon(await prisma.coupon.update({ where: { id }, data }), new Date()));
});

couponRoutes.delete("/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const coupon = await prisma.coupon.findUnique({ where: { id }, include: { _count: { select: { redemptions: true } } } });
  if (!coupon) throw notFound("Coupon");
  const used = Math.max(coupon.usedCount, coupon._count.redemptions);
  if (used > 0) {
    throw new HttpError(400, `This coupon has been used ${used} ${used === 1 ? "time" : "times"}. Turn it off instead, so its history is kept.`);
  }
  await prisma.coupon.delete({ where: { id } });
  res.json({ ok: true });
});

// ─────────────────────────────────────────────── delivery charges

type ShippingFields = {
  name: string;
  channel: "D2C" | "B2B" | null;
  minOrderValue: number;
  maxOrderValue: number | null;
  charge: number;
  codAvailable: boolean;
  codCharge: number;
  isActive: boolean;
};

const shippingInput = z.object({
  name: z.string("Give the rule a name").trim().min(1, "Give the rule a name").max(120, "Keep the name under 120 characters"),
  channel: channelInput,
  minOrderValue: rupees("Enter the order value this rule starts from").optional(),
  maxOrderValue: rupees("Enter the order value this rule stops at").nullable().optional(),
  charge: rupees("Enter the delivery charge in rupees"),
  codAvailable: z.boolean().optional(),
  codCharge: rupees("Enter the extra charge for cash on delivery").optional(),
  isActive: z.boolean().optional(),
});

const checkShipping = (rule: ShippingFields): ShippingFields => {
  if (rule.maxOrderValue !== null && rule.maxOrderValue <= rule.minOrderValue) {
    throw new HttpError(400, "The order value this rule stops at must be more than the value it starts from");
  }
  return { ...rule, codCharge: rule.codAvailable ? rule.codCharge : 0 };
};

type ShippingRecord = Prisma.ShippingRuleGetPayload<object>;

const toShipping = (rule: ShippingRecord) => ({
  ...rule,
  minOrderValue: num(rule.minOrderValue),
  maxOrderValue: numOrNull(rule.maxOrderValue),
  charge: num(rule.charge),
  codCharge: num(rule.codCharge),
});

const shippingFilters = z.object({ q: optionalString, channel: channelFilter });

const shippingWhere = (filters: z.infer<typeof shippingFilters>): Prisma.ShippingRuleWhereInput => ({
  ...(filters.q ? { name: { contains: filters.q, mode: "insensitive" as const } } : {}),
  ...(filters.channel ? { channel: filters.channel === "BOTH" ? null : filters.channel } : {}),
});

// Listed in the order an order is checked against them: highest starting value first (see shippingFor in lib/pricing.ts).
const shippingOrder: Prisma.ShippingRuleOrderByWithRelationInput[] = [{ minOrderValue: "desc" }, { id: "asc" }];

shippingRoutes.get("/", async (req, res) => {
  const rules = await prisma.shippingRule.findMany({ where: shippingWhere(shippingFilters.parse(req.query)), orderBy: shippingOrder });
  res.json({ items: rules.map(toShipping) });
});

shippingRoutes.get("/export", async (req, res) => {
  const filters = shippingFilters.extend({ ids: idsQuery }).parse(req.query);
  const rules = await prisma.shippingRule.findMany({
    where: filters.ids ? { id: { in: filters.ids } } : shippingWhere(filters),
    orderBy: shippingOrder,
    take: EXPORT_LIMIT,
  });
  const columns: Column<(typeof rules)[number]>[] = [
    { header: "Rule", value: (r) => r.name },
    { header: "Applies to", value: (r) => channelLabel(r.channel) },
    { header: "Order value from", value: (r) => num(r.minOrderValue) },
    { header: "Order value below", value: (r) => numOrNull(r.maxOrderValue) },
    { header: "Delivery charge", value: (r) => num(r.charge) },
    { header: "Cash on delivery", value: (r) => yesNo(r.codAvailable) },
    { header: "Cash on delivery charge", value: (r) => (r.codAvailable ? num(r.codCharge) : null) },
    { header: "In use", value: (r) => yesNo(r.isActive) },
  ];
  sendCsv(res, "delivery-charges", columns, rules);
});

shippingRoutes.post("/bulk-delete", async (req, res) => {
  const { ids } = idsBody.parse(req.body);
  // past orders keep the delivery charge they were given, so they are not affected
  const deleted = await prisma.shippingRule.deleteMany({ where: { id: { in: ids } } });
  await logDelete(req.user!.id, "ShippingRule", ids);
  res.json(result(deleted.count, ids.length - deleted.count));
});

shippingRoutes.post("/", async (req, res) => {
  const input = readBody(shippingInput, req.body);
  const data = checkShipping({
    name: input.name,
    channel: input.channel ?? null,
    minOrderValue: input.minOrderValue ?? 0,
    maxOrderValue: input.maxOrderValue ?? null,
    charge: input.charge,
    codAvailable: input.codAvailable ?? true,
    codCharge: input.codCharge ?? 0,
    isActive: input.isActive ?? true,
  });
  res.status(201).json(toShipping(await prisma.shippingRule.create({ data })));
});

shippingRoutes.patch("/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const input = readBody(shippingInput.partial(), req.body);
  const rule = await prisma.shippingRule.findUnique({ where: { id } });
  if (!rule) throw notFound("Delivery rule");

  const sent = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Partial<ShippingFields>;
  const data = checkShipping({
    name: rule.name,
    channel: rule.channel,
    minOrderValue: num(rule.minOrderValue),
    maxOrderValue: numOrNull(rule.maxOrderValue),
    charge: num(rule.charge),
    codAvailable: rule.codAvailable,
    codCharge: num(rule.codCharge),
    isActive: rule.isActive,
    ...sent,
  });
  res.json(toShipping(await prisma.shippingRule.update({ where: { id }, data })));
});

shippingRoutes.delete("/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  if (!(await prisma.shippingRule.findUnique({ where: { id } }))) throw notFound("Delivery rule");
  await prisma.shippingRule.delete({ where: { id } });
  res.json({ ok: true });
});

// ─────────────────────────────────────────────── payments (read only)

const paymentFilters = z.object({
  q: optionalString,
  status: z.preprocess(blank, z.enum(["CREATED", "PENDING", "SUCCESS", "FAILED", "REFUNDED"]).optional()),
  provider: optionalString,
  from: z.preprocess(blank, isoDay.optional()),
  to: z.preprocess(blank, isoDay.optional()),
  tz: zoneParam,
});

const paymentWhere = (filters: z.infer<typeof paymentFilters>) => {
  const where: Prisma.PaymentWhereInput = {};
  if (filters.q) {
    where.OR = [
      { providerRef: { contains: filters.q, mode: "insensitive" } },
      { order: { orderNumber: { contains: filters.q, mode: "insensitive" } } },
    ];
  }
  if (filters.status) where.status = filters.status;
  if (filters.provider) where.provider = filters.provider;
  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: dayStart(filters.from, filters.tz) } : {}),
      ...(filters.to ? { lt: dayStart(addDays(filters.to, 1), filters.tz) } : {}),
    };
  }
  return where;
};

const paymentInclude = {
  order: { select: { orderNumber: true, customerName: true } },
  appointment: { select: { appointmentNumber: true, patientName: true } },
  user: { select: { firstName: true, lastName: true } },
} satisfies Prisma.PaymentInclude;

type PaymentRecord = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;

const payerName = (p: PaymentRecord) =>
  p.order?.customerName ?? p.appointment?.patientName ?? ([p.user?.firstName, p.user?.lastName].filter(Boolean).join(" ") || null);

paymentRoutes.get("/", async (req, res) => {
  const { page, pageSize, skip, take } = getPage(req);
  const where = paymentWhere(paymentFilters.parse(req.query));

  const [total, payments, successful, providers] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take, include: paymentInclude }),
    prisma.payment.aggregate({ where: { AND: [where, { status: "SUCCESS" }] }, _count: true, _sum: { amount: true, refundedAmount: true } }),
    prisma.payment.findMany({ distinct: ["provider"], select: { provider: true }, orderBy: { provider: "asc" } }),
  ]);

  const items = payments.map((p) => ({
    id: p.id,
    createdAt: p.createdAt,
    paidAt: p.paidAt,
    orderNumber: p.order?.orderNumber ?? null,
    appointmentNumber: p.appointment?.appointmentNumber ?? null,
    customerName: payerName(p),
    provider: p.provider,
    method: p.method,
    providerRef: p.providerRef,
    amount: num(p.amount),
    refundedAmount: num(p.refundedAmount),
    currency: p.currency,
    status: p.status,
  }));

  res.json({
    ...paged(items, total, page, pageSize),
    totals: {
      count: total,
      successCount: successful._count,
      successAmount: num(successful._sum.amount),
      refundedAmount: num(successful._sum.refundedAmount),
    },
    providers: providers.map((p) => p.provider),
  });
});

// Only attempts that never brought money in can be removed. A payment that succeeded, or was refunded,
// is the accounts record; one from the last day may still be completed by the customer's bank.
paymentRoutes.post("/bulk-delete", async (req, res) => {
  const { ids } = idsBody.parse(req.body);
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const deletable = await prisma.payment.findMany({
    where: { id: { in: ids }, refunds: { none: {} }, OR: [{ status: "FAILED" }, { status: { in: ["CREATED", "PENDING"] }, createdAt: { lt: dayAgo } }] },
    select: { id: true },
  });
  const gone = deletable.map((p) => p.id);
  const deleted = await prisma.payment.deleteMany({ where: { id: { in: gone }, status: { in: ["FAILED", "CREATED", "PENDING"] } } });
  if (gone.length) await logDelete(req.user!.id, "Payment", gone);
  res.json(result(deleted.count, ids.length - deleted.count, "Payments that brought money in, or were refunded, are your accounts record and were kept. So were attempts from the last 24 hours, which may still go through."));
});

paymentRoutes.get("/export", async (req, res) => {
  const filters = paymentFilters.extend({ ids: idsQuery }).parse(req.query);
  const payments = await prisma.payment.findMany({
    where: filters.ids ? { id: { in: filters.ids } } : paymentWhere(filters),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: EXPORT_LIMIT,
    include: paymentInclude,
  });
  const columns: Column<PaymentRecord>[] = [
    { header: `Date (${filters.tz})`, value: (p) => stamp(p.createdAt, filters.tz) },
    { header: "Order number", value: (p) => p.order?.orderNumber },
    { header: "Consultation number", value: (p) => p.appointment?.appointmentNumber },
    { header: "Customer", value: (p) => payerName(p) },
    { header: "Paid through", value: (p) => p.provider },
    { header: "Method", value: (p) => p.method },
    { header: "Reference", value: (p) => p.providerRef },
    { header: "Amount", value: (p) => num(p.amount) },
    { header: "Refunded", value: (p) => num(p.refundedAmount) },
    { header: "Status", value: (p) => p.status },
    { header: `Paid at (${filters.tz})`, value: (p) => stamp(p.paidAt, filters.tz) },
  ];
  sendCsv(res, "payments", columns, payments);
});
