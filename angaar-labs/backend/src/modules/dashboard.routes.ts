import { Router } from "express";
import { z } from "zod";
import { num } from "../lib/http";
import { prisma } from "../lib/prisma";
import { addDays, dayInZone, dayStart, daysBetween, isoDay, zoneParam } from "../lib/time";

export const dashboardRoutes = Router();

const rangeSchema = z.object({ from: isoDay.optional(), to: isoDay.optional(), tz: zoneParam });

// Orders that never became a sale are left out of revenue.
const NOT_A_SALE = ["CANCELLED", "UNDELIVERED", "RETURNED", "REFUNDED"] as const;

const percentChange = (current: number, previous: number) =>
  previous === 0 ? null : Math.round(((current - previous) / previous) * 1000) / 10;

const periodTotals = async (from: Date, to: Date) => {
  const [sales, allOrders, customers] = await Promise.all([
    prisma.order.aggregate({
      where: { placedAt: { gte: from, lt: to }, status: { notIn: [...NOT_A_SALE] } },
      _sum: { grandTotal: true },
      _count: true,
    }),
    prisma.order.count({ where: { placedAt: { gte: from, lt: to } } }),
    prisma.user.count({ where: { role: "CUSTOMER", createdAt: { gte: from, lt: to } } }),
  ]);
  const revenue = num(sales._sum.grandTotal);
  return {
    revenue,
    orders: allOrders,
    averageOrderValue: sales._count ? revenue / sales._count : 0,
    newCustomers: customers,
  };
};

dashboardRoutes.get("/", async (req, res) => {
  const query = rangeSchema.parse(req.query);
  const zone = query.tz;
  const toDay = query.to ?? dayInZone(new Date(), zone);
  const fromDay = query.from ?? addDays(toDay, -29);
  const from = dayStart(fromDay, zone);
  const to = dayStart(addDays(toDay, 1), zone); // exclusive
  const days = daysBetween(fromDay, toDay) + 1;
  const previousFrom = dayStart(addDays(fromDay, -days), zone);
  const unit = days <= 92 ? "day" : "month";

  const firstOrder = await prisma.order.aggregate({ _min: { placedAt: true } });
  const firstOrderDay = firstOrder._min.placedAt ? dayInZone(firstOrder._min.placedAt, zone) : toDay;
  // a range that reaches back to the first order has nothing earlier to compare with
  const comparable = fromDay > firstOrderDay;

  const [current, previous, seriesRows, byStatus, byChannel, byPayment, topProducts, topBrands, recentOrders, counters] =
    await Promise.all([
      periodTotals(from, to),
      periodTotals(previousFrom, from),
      prisma.$queryRaw<{ bucket: Date; channel: string; orders: number; revenue: number }[]>`
        SELECT date_trunc(${unit}, ("placedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${zone}) AS bucket,
               channel::text AS channel,
               count(*)::int AS orders,
               coalesce(sum("grandTotal"), 0)::float8 AS revenue
        FROM "Order"
        WHERE "placedAt" >= ${from} AND "placedAt" < ${to}
          AND status NOT IN ('CANCELLED', 'UNDELIVERED', 'RETURNED', 'REFUNDED')
        GROUP BY 1, 2
        ORDER BY 1`,
      prisma.order.groupBy({ by: ["status"], where: { placedAt: { gte: from, lt: to } }, _count: true }),
      prisma.order.groupBy({
        by: ["channel"],
        where: { placedAt: { gte: from, lt: to }, status: { notIn: [...NOT_A_SALE] } },
        _count: true,
        _sum: { grandTotal: true },
      }),
      prisma.order.groupBy({
        by: ["paymentMethod"],
        where: { placedAt: { gte: from, lt: to }, status: { notIn: [...NOT_A_SALE] } },
        _count: true,
        _sum: { grandTotal: true },
      }),
      prisma.$queryRaw<{ productId: number | null; name: string; units: number; revenue: number }[]>`
        SELECT oi."productId" AS "productId", min(oi."productName") AS name,
               sum(oi.quantity)::int AS units, sum(oi."lineTotal")::float8 AS revenue
        FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId"
        WHERE o."placedAt" >= ${from} AND o."placedAt" < ${to}
          AND o.status NOT IN ('CANCELLED', 'UNDELIVERED', 'RETURNED', 'REFUNDED')
        GROUP BY coalesce(oi."productId"::text, oi."productName"), oi."productId"
        ORDER BY revenue DESC
        LIMIT 6`,
      prisma.$queryRaw<{ name: string; units: number; revenue: number }[]>`
        SELECT coalesce(nullif(oi."brandName", ''), 'Unbranded') AS name,
               sum(oi.quantity)::int AS units, sum(oi."lineTotal")::float8 AS revenue
        FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId"
        WHERE o."placedAt" >= ${from} AND o."placedAt" < ${to}
          AND o.status NOT IN ('CANCELLED', 'UNDELIVERED', 'RETURNED', 'REFUNDED')
        GROUP BY 1
        ORDER BY revenue DESC
        LIMIT 6`,
      prisma.order.findMany({
        orderBy: { placedAt: "desc" },
        take: 8,
        select: {
          id: true, orderNumber: true, customerName: true, channel: true, status: true,
          paymentMethod: true, grandTotal: true, placedAt: true, _count: { select: { items: true } },
        },
      }),
      Promise.all([
        prisma.product.count({ where: { status: "ACTIVE" } }),
        prisma.productVariant.count({ where: { isActive: true } }),
        prisma.productVariant.count({ where: { isActive: true, stockQuantity: { lte: 0 } } }),
        prisma.$queryRaw<{ n: number }[]>`
          SELECT count(*)::int AS n FROM "ProductVariant"
          WHERE "isActive" AND "stockQuantity" > 0 AND "stockQuantity" <= "lowStockThreshold"`,
        prisma.order.count({ where: { status: { in: ["PENDING", "CONFIRMED", "PROCESSING", "PACKED"] } } }),
        prisma.doctorProfile.count({ where: { verificationStatus: { in: ["PENDING", "UNDER_REVIEW"] } } }),
        prisma.b2BAccount.count({ where: { status: { in: ["PENDING", "UNDER_REVIEW"] } } }),
      ]),
    ]);

  // one point per day or month, including the ones with no sales
  const points = new Map<string, { date: string; d2c: number; b2b: number; orders: number }>();
  if (unit === "day") {
    for (let date = fromDay; date <= toDay; date = addDays(date, 1)) {
      points.set(date, { date, d2c: 0, b2b: 0, orders: 0 });
    }
  } else {
    const cursor = new Date(`${fromDay.slice(0, 7)}-01T00:00:00Z`);
    const last = toDay.slice(0, 7);
    while (cursor.toISOString().slice(0, 7) <= last) {
      const date = cursor.toISOString().slice(0, 10);
      points.set(date, { date, d2c: 0, b2b: 0, orders: 0 });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }
  for (const row of seriesRows) {
    const point = points.get(row.bucket.toISOString().slice(0, 10));
    if (!point) continue;
    if (row.channel === "B2B") point.b2b += row.revenue;
    else point.d2c += row.revenue;
    point.orders += row.orders;
  }

  const change = (now: number, before: number) => (comparable ? percentChange(now, before) : null);
  const [activeProducts, activeVariants, outOfStock, lowStock, openOrders, doctorsToVerify, b2bToApprove] = counters;

  res.json({
    range: { from: fromDay, to: toDay, unit, firstOrderDay },
    totals: {
      revenue: { value: current.revenue, change: change(current.revenue, previous.revenue) },
      orders: { value: current.orders, change: change(current.orders, previous.orders) },
      averageOrderValue: {
        value: current.averageOrderValue,
        change: change(current.averageOrderValue, previous.averageOrderValue),
      },
      newCustomers: { value: current.newCustomers, change: change(current.newCustomers, previous.newCustomers) },
    },
    series: [...points.values()],
    ordersByStatus: byStatus.map((s) => ({ status: s.status, count: s._count })).sort((a, b) => b.count - a.count),
    salesByChannel: byChannel.map((c) => ({ channel: c.channel, orders: c._count, revenue: num(c._sum.grandTotal) })),
    salesByPaymentMethod: byPayment.map((p) => ({ method: p.paymentMethod, orders: p._count, revenue: num(p._sum.grandTotal) })),
    topProducts,
    topBrands,
    recentOrders: recentOrders.map((o) => ({
      id: o.id, orderNumber: o.orderNumber, customerName: o.customerName, channel: o.channel, status: o.status,
      paymentMethod: o.paymentMethod, grandTotal: num(o.grandTotal), placedAt: o.placedAt, itemCount: o._count.items,
    })),
    counters: {
      activeProducts, activeVariants, outOfStock, lowStock: lowStock[0]?.n ?? 0,
      openOrders, doctorsToVerify, b2bToApprove,
    },
  });
});
