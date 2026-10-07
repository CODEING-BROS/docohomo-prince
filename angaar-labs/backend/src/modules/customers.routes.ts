import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "../generated/prisma/client";
import { getPage, num, optionalString, paged } from "../lib/http";
import { prisma } from "../lib/prisma";

export const customerRoutes = Router();

const listSchema = z.object({
  q: optionalString,
  verified: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["yes", "no"]).optional()),
  sort: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["newest", "oldest"]).default("newest")),
});

export const customerFilters = listSchema;

export const customerWhere = (filters: z.infer<typeof listSchema>) => {
  const where: Prisma.UserWhereInput = { role: "CUSTOMER" };
  if (filters.q) {
    where.OR = [
      { firstName: { contains: filters.q, mode: "insensitive" } },
      { lastName: { contains: filters.q, mode: "insensitive" } },
      { phone: { contains: filters.q } },
      { email: { contains: filters.q, mode: "insensitive" } },
    ];
  }
  if (filters.verified === "yes") where.phoneVerifiedAt = { not: null };
  if (filters.verified === "no") where.phoneVerifiedAt = null;
  return where;
};

customerRoutes.get("/", async (req, res) => {
  const { page, pageSize, skip, take } = getPage(req);
  const filters = listSchema.parse(req.query);
  const where = customerWhere(filters);

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: filters.sort === "oldest" ? "asc" : "desc" },
      skip,
      take,
      select: {
        id: true, firstName: true, lastName: true, phone: true, email: true, isActive: true,
        phoneVerifiedAt: true, createdAt: true,
        addresses: { where: { isDefault: true }, take: 1, select: { city: true, state: true } },
        b2bAccount: { select: { id: true, type: true, status: true } },
      },
    }),
  ]);

  // order count and spend for just the customers on this page
  const spend = await prisma.order.groupBy({
    by: ["userId"],
    where: { userId: { in: users.map((u) => u.id) }, status: { notIn: ["CANCELLED", "UNDELIVERED", "RETURNED", "REFUNDED"] } },
    _count: true,
    _sum: { grandTotal: true },
    _max: { placedAt: true },
  });
  const spendByUser = new Map(spend.map((s) => [s.userId, s]));

  const items = users.map(({ addresses, ...u }) => {
    const s = spendByUser.get(u.id);
    return {
      ...u,
      name: [u.firstName, u.lastName].filter(Boolean).join(" ") || null,
      city: addresses[0]?.city ?? null,
      state: addresses[0]?.state ?? null,
      orderCount: s?._count ?? 0,
      totalSpent: num(s?._sum.grandTotal),
      lastOrderAt: s?._max.placedAt ?? null,
    };
  });

  res.json(paged(items, total, page, pageSize));
});
