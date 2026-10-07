import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "../generated/prisma/client";
import { HttpError, getPage, idParam, notFound, num, optionalInt, optionalString, paged } from "../lib/http";
import { prisma } from "../lib/prisma";
import { b2bDetails } from "./people-form.routes";

// B2B customers: doctors who registered to buy at wholesale prices.
// This is separate from the doctors listed for consultations; a doctor applies for a
// wholesale account and an admin approves it here.
export const b2bRoutes = Router();

const blank = (v: unknown) => (v === "" ? undefined : v);

// Price tiers with how many accounts are on each.
b2bRoutes.get("/tiers", async (_req, res) => {
  const tiers = await prisma.priceTier.findMany({ orderBy: { defaultDiscountPercent: "asc" }, include: { _count: { select: { accounts: true } } } });
  res.json({
    tiers: tiers.map((t) => ({
      id: t.id, name: t.name, description: t.description, isActive: t.isActive,
      defaultDiscountPercent: num(t.defaultDiscountPercent), accountCount: t._count.accounts,
    })),
  });
});

const listSchema = z.object({
  q: optionalString,
  tierId: optionalInt,
  status: z.preprocess(blank, z.enum(["PENDING", "UNDER_REVIEW", "APPROVED", "SUSPENDED", "REJECTED"]).optional()),
});

export const b2bFilters = listSchema;

export const b2bWhere = (filters: z.infer<typeof listSchema>) => {
  const base: Prisma.B2BAccountWhereInput = {};
  if (filters.q) {
    base.OR = [
      { businessName: { contains: filters.q, mode: "insensitive" } },
      { contactName: { contains: filters.q, mode: "insensitive" } },
      { registrationNumber: { contains: filters.q, mode: "insensitive" } },
      { gstNumber: { contains: filters.q, mode: "insensitive" } },
      { contactPhone: { contains: filters.q } },
      { user: { phone: { contains: filters.q } } },
    ];
  }
  if (filters.tierId) base.priceTierId = filters.tierId;
  const where: Prisma.B2BAccountWhereInput = { ...base, ...(filters.status ? { status: filters.status } : {}) };
  return { base, where };
};

b2bRoutes.get("/", async (req, res) => {
  const { page, pageSize, skip, take } = getPage(req);
  const { base, where } = b2bWhere(listSchema.parse(req.query));

  const [total, accounts, statusCounts] = await Promise.all([
    prisma.b2BAccount.count({ where }),
    prisma.b2BAccount.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      select: {
        id: true, type: true, businessName: true, contactName: true, contactPhone: true, addressLine: true, city: true, state: true, pincode: true,
        registrationNumber: true, registrationCouncil: true, gstNumber: true,
        status: true, approvedAt: true, rejectionReason: true, creditLimit: true, creditDays: true, createdAt: true,
        priceTier: { select: { id: true, name: true, defaultDiscountPercent: true } },
        user: { select: { firstName: true, lastName: true, phone: true, email: true } },
        _count: { select: { discountRules: true, documents: true } },
      },
    }),
    prisma.b2BAccount.groupBy({ by: ["status"], where: base, _count: true }),
  ]);

  // B2B orders and spend for the accounts on this page
  const spend = await prisma.order.groupBy({
    by: ["b2bAccountId"],
    where: { b2bAccountId: { in: accounts.map((a) => a.id) }, channel: "B2B", status: { notIn: ["CANCELLED", "UNDELIVERED", "RETURNED", "REFUNDED"] } },
    _count: true,
    _sum: { grandTotal: true },
  });
  const spendByAccount = new Map(spend.map((s) => [s.b2bAccountId, s]));

  const items = accounts.map(({ user, priceTier, _count, contactPhone, ...a }) => ({
    ...a,
    creditLimit: num(a.creditLimit),
    name: a.contactName ?? ([user.firstName, user.lastName].filter(Boolean).join(" ") || a.businessName),
    phone: contactPhone ?? user.phone,
    email: user.email,
    tier: priceTier ? { id: priceTier.id, name: priceTier.name, discountPercent: num(priceTier.defaultDiscountPercent) } : null,
    documentCount: _count.documents,
    specialRuleCount: _count.discountRules,
    orderCount: spendByAccount.get(a.id)?._count ?? 0,
    totalSpent: num(spendByAccount.get(a.id)?._sum.grandTotal),
  }));

  res.json({
    ...paged(items, total, page, pageSize),
    statusCounts: Object.fromEntries(statusCounts.map((s) => [s.status, s._count])),
  });
});

// One account in full, for the edit page.
b2bRoutes.get("/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const account = await prisma.b2BAccount.findUnique({
    where: { id },
    include: {
      priceTier: { select: { id: true, name: true, defaultDiscountPercent: true } },
      user: { select: { firstName: true, lastName: true, phone: true, email: true } },
      documents: { orderBy: { createdAt: "asc" }, select: { id: true, type: true, fileUrl: true, fileName: true, status: true } },
    },
  });
  if (!account) throw notFound("B2B account");

  const { user, priceTier, contactName, contactPhone, contactEmail, ...rest } = account;
  res.json({
    ...rest,
    creditLimit: num(rest.creditLimit),
    doctorName: contactName ?? ([user.firstName, user.lastName].filter(Boolean).join(" ") || rest.businessName),
    phone: user.phone ?? contactPhone, // the number they sign in with
    email: contactEmail ?? user.email,
    tier: priceTier ? { id: priceTier.id, name: priceTier.name, discountPercent: num(priceTier.defaultDiscountPercent) } : null,
  });
});

const BUSINESS_TYPES = ["DOCTOR", "CLINIC", "RETAILER", "WHOLESALER", "DISTRIBUTOR"] as const;

// Every field is optional: the list page sends one change at a time, the edit page sends the whole form.
const updateSchema = b2bDetails
  .partial()
  .extend({
    type: z.enum(BUSINESS_TYPES, "Choose the type of business").optional(),
    priceTierId: z.number().int().positive().optional(),
    status: z.enum(["UNDER_REVIEW", "APPROVED", "REJECTED", "SUSPENDED"]).optional(),
    reason: z.string().trim().max(500).optional(),
    creditLimit: z.number("Enter the credit limit as a number").min(0, "The credit limit cannot be below zero").max(100_000_000, "That credit limit is too large").optional(),
    creditDays: z.number("Enter the days to pay as a number").int("Days to pay must be a whole number").min(0, "Days to pay cannot be below zero").max(365, "Days to pay can be 365 at most").optional(),
  })
  .refine((body) => Object.keys(body).length > 0, "Nothing to change");

// Approve or reject an application, pause or resume access, change the price tier or credit terms,
// or correct the doctor's and the practice's details.
b2bRoutes.patch("/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const parsed = updateSchema.safeParse(req.body);
  // what is wrong is said in words the page can show as they are
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Check the account details", parsed.error.issues);
  const { reason, doctorName, email, status, ...changes } = parsed.data;

  const account = await prisma.b2BAccount.findUnique({ where: { id }, select: { status: true, priceTierId: true, user: { select: { id: true, role: true } } } });
  if (!account) throw notFound("B2B account");
  if (changes.priceTierId && !(await prisma.priceTier.findUnique({ where: { id: changes.priceTierId } }))) {
    throw new HttpError(400, "That price tier does not exist");
  }
  // the edit page sends the status it already shows; only a different one counts as a decision
  const newStatus = status !== account.status ? status : undefined;
  if (newStatus === "REJECTED" && !reason) throw new HttpError(400, "Give a reason for rejecting");

  const data: Prisma.B2BAccountUncheckedUpdateInput = { ...changes };
  // the doctor's name is kept on the account itself; the mobile number they sign in with is not changed here
  if (doctorName !== undefined) data.contactName = doctorName;
  if (email !== undefined) data.contactEmail = email;
  // the person's own record carries the same email, so the two do not drift apart (a staff login is left alone)
  const personEmail = email !== undefined && (account.user.role === "DOCTOR" || account.user.role === "CUSTOMER") ? { email } : null;
  if (newStatus) data.status = newStatus;
  if (newStatus === "APPROVED") {
    data.approvedAt = new Date();
    data.approvedById = req.user!.id;
    data.rejectionReason = null;
    // a newly approved doctor starts on the Doctor tier unless one was already chosen
    if (!account.priceTierId && !changes.priceTierId) {
      data.priceTierId = (await prisma.priceTier.findUnique({ where: { name: "Doctor" }, select: { id: true } }))?.id ?? null;
    }
  }
  if (newStatus === "REJECTED" || newStatus === "SUSPENDED") data.rejectionReason = reason ?? null;

  await prisma.$transaction([
    prisma.b2BAccount.update({ where: { id }, data }),
    ...(personEmail ? [prisma.user.update({ where: { id: account.user.id }, data: personEmail })] : []),
    prisma.auditLog.create({
      data: {
        actorId: req.user!.id, action: "b2b.update", entity: "B2BAccount", entityId: String(id),
        changes: { ...parsed.data, reason: reason ?? null, from: account.status },
      },
    }),
  ]);
  res.json({ ok: true });
});
