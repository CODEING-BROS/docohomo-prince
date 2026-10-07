import { type Request, type Response, Router } from "express";
import { z } from "zod";
import { Prisma } from "../generated/prisma/client";
import { type Column, sendCsv, stamp } from "../lib/bulk";
import { HttpError } from "../lib/http";
import { prisma } from "../lib/prisma";
import { addDays, dayInZone, dayStart, daysBetween, isoDay, zoneParam } from "../lib/time";

// Read-only sales reports. Dates, timezone and "what counts as a sale" follow the dashboard
// (dashboard.routes.ts), so the two pages always show the same numbers for the same dates.
//
// Two kinds of revenue appear here, on purpose:
//  - order reports (summary, over time, payment method, state, status, customers) add up the order
//    total the customer paid, delivery charges and coupons included;
//  - item reports (brand, category, product) add up the value of the items themselves, because a
//    delivery charge or an order-wide coupon does not belong to any one product.

export const reportRoutes = Router();

const blankToUndefined = (v: unknown) => (v === "" ? undefined : v);

const reportQuery = z.object({
  from: isoDay.optional(),
  to: isoDay.optional(),
  tz: zoneParam,
  channel: z.preprocess(blankToUndefined, z.enum(["D2C", "B2B"]).optional()),
  format: z.preprocess(blankToUndefined, z.enum(["json", "csv"]).default("json")),
});

type Channel = "D2C" | "B2B";

/** The dates asked for, as calendar days and as the instants they start and end at in the zone. */
const readQuery = (req: Request) => {
  const query = reportQuery.parse(req.query);
  const zone = query.tz;
  const toDay = query.to ?? dayInZone(new Date(), zone);
  const fromDay = query.from ?? addDays(toDay, -29);
  if (fromDay > toDay) throw new HttpError(400, "The start date is after the end date");
  const days = daysBetween(fromDay, toDay) + 1;
  return {
    zone, fromDay, toDay, days,
    from: dayStart(fromDay, zone),
    to: dayStart(addDays(toDay, 1), zone), // exclusive
    previousFromDay: addDays(fromDay, -days),
    previousFrom: dayStart(addDays(fromDay, -days), zone),
    unit: days <= 92 ? ("day" as const) : ("month" as const),
    channel: query.channel as Channel | undefined,
    csv: query.format === "csv",
  };
};

type Query = ReturnType<typeof readQuery>;

// Orders that never became a sale are left out of revenue (same list as the dashboard).
const IS_SALE = Prisma.sql`o.status NOT IN ('CANCELLED', 'UNDELIVERED', 'RETURNED', 'REFUNDED')`;
const NOT_A_SALE = ["CANCELLED", "UNDELIVERED", "RETURNED", "REFUNDED"];

const inRange = (from: Date, to: Date) => Prisma.sql`o."placedAt" >= ${from} AND o."placedAt" < ${to}`;
const inChannel = (channel?: Channel) => (channel ? Prisma.sql`AND o.channel = ${channel}::"SalesChannel"` : Prisma.empty);

/** Orders placed in the range, in the chosen channel, that counted as a sale. */
const sales = (q: Query) => Prisma.sql`${inRange(q.from, q.to)} AND ${IS_SALE} ${inChannel(q.channel)}`;

// units per order, for reports that are counted per order rather than per item
const ORDER_UNITS = Prisma.sql`
  LEFT JOIN (SELECT "orderId", sum(quantity)::int AS units FROM "OrderItem" GROUP BY "orderId") i ON i."orderId" = o.id`;

const percentChange = (current: number, previous: number) =>
  previous === 0 ? null : Math.round(((current - previous) / previous) * 1000) / 10;
const round1 = (value: number) => Math.round(value * 10) / 10;
const money = (value: number) => Math.round(value * 100) / 100;
/** Old product and brand names are stored in lower case; files show them in title case, like the screen does. */
const titleCase = (value: string) => value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
const humanize = (value: string) => {
  const text = value.replace(/_/g, " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
};
const paymentLabel = (method: string) => (method === "COD" ? "Cash on delivery" : humanize(method));

const rangeOf = (q: Query) => ({ from: q.fromDay, to: q.toDay, channel: q.channel ?? null });
const fileName = (name: string, q: Query) => `report-${name}${q.channel ? `-${q.channel.toLowerCase()}` : ""}-${q.fromDay}-to-${q.toDay}`;

/** Answers with a spreadsheet file when "?format=csv" is set, otherwise with JSON. */
const reply = <T>(res: Response, q: Query, name: string, columns: Column<T>[], rows: T[], extra: Record<string, unknown> = {}) => {
  if (q.csv) return sendCsv(res, fileName(name, q), columns, rows);
  res.json({ range: rangeOf(q), ...extra, rows });
};

type SalesRow = { name: string; orders: number; units: number; revenue: number };

const salesColumns = <T extends SalesRow>(first: string, label: (row: T) => string = (row) => row.name): Column<T>[] => [
  { header: first, value: label },
  { header: "Orders", value: (row) => row.orders },
  { header: "Units sold", value: (row) => row.units },
  { header: "Revenue (Rs)", value: (row) => money(row.revenue) },
];

// ─────────────────────────────────────────────────────────── Summary

const periodTotals = async (from: Date, to: Date, channel?: Channel) => {
  const [orderRows, unitRows, newCustomers] = await Promise.all([
    prisma.$queryRaw<{ placed: number; sales: number; revenue: number; cancelled: number }[]>`
      SELECT count(*)::int AS placed,
             (count(*) FILTER (WHERE ${IS_SALE}))::int AS sales,
             coalesce(sum(o."grandTotal") FILTER (WHERE ${IS_SALE}), 0)::float8 AS revenue,
             (count(*) FILTER (WHERE o.status = 'CANCELLED'))::int AS cancelled
      FROM "Order" o
      WHERE ${inRange(from, to)} ${inChannel(channel)}`,
    prisma.$queryRaw<{ units: number }[]>`
      SELECT coalesce(sum(oi.quantity), 0)::int AS units
      FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId"
      WHERE ${inRange(from, to)} AND ${IS_SALE} ${inChannel(channel)}`,
    // a customer belongs to B2B once they have a wholesale account
    prisma.user.count({
      where: {
        role: "CUSTOMER",
        createdAt: { gte: from, lt: to },
        ...(channel === "B2B" ? { b2bAccount: { isNot: null } } : channel === "D2C" ? { b2bAccount: { is: null } } : {}),
      },
    }),
  ]);
  const orders = orderRows[0] ?? { placed: 0, sales: 0, revenue: 0, cancelled: 0 };
  return {
    revenue: orders.revenue,
    ordersPlaced: orders.placed,
    salesOrders: orders.sales,
    averageOrderValue: orders.sales ? orders.revenue / orders.sales : 0,
    unitsSold: unitRows[0]?.units ?? 0,
    newCustomers,
    cancelledOrders: orders.cancelled,
    cancelledShare: orders.placed ? round1((orders.cancelled / orders.placed) * 100) : 0,
  };
};

reportRoutes.get("/summary", async (req, res) => {
  const q = readQuery(req);
  const [current, previous, firstOrder] = await Promise.all([
    periodTotals(q.from, q.to, q.channel),
    periodTotals(q.previousFrom, q.from, q.channel),
    prisma.order.aggregate({ _min: { placedAt: true } }),
  ]);
  const firstOrderDay = firstOrder._min.placedAt ? dayInZone(firstOrder._min.placedAt, q.zone) : q.toDay;
  // a range that reaches back to the first order has nothing earlier to compare with
  const comparable = q.fromDay > firstOrderDay;

  const metric = (key: keyof typeof current) => ({
    value: current[key],
    previous: comparable ? previous[key] : null,
    change: comparable ? percentChange(current[key], previous[key]) : null,
  });
  const totals = {
    revenue: metric("revenue"),
    ordersPlaced: metric("ordersPlaced"),
    salesOrders: metric("salesOrders"),
    averageOrderValue: metric("averageOrderValue"),
    unitsSold: metric("unitsSold"),
    newCustomers: metric("newCustomers"),
    cancelledOrders: metric("cancelledOrders"),
    // a share is compared in percentage points (8% -> 10% is +2), not as a percent of a percent
    cancelledShare: {
      value: current.cancelledShare,
      previous: comparable ? previous.cancelledShare : null,
      change: comparable && previous.ordersPlaced > 0 ? round1(current.cancelledShare - previous.cancelledShare) : null,
    },
  };

  if (q.csv) {
    type Line = { label: string; value: number; previous: number | null; change: number | null; unit: string };
    const line = (label: string, key: keyof typeof totals, unit: string, isMoney = false): Line => ({
      label, unit,
      value: isMoney ? money(totals[key].value) : totals[key].value,
      previous: totals[key].previous === null ? null : isMoney ? money(totals[key].previous) : totals[key].previous,
      change: totals[key].change,
    });
    return sendCsv<Line>(res, fileName("summary", q), [
      { header: "Measure", value: (row) => row.label },
      { header: `This period (${q.fromDay} to ${q.toDay})`, value: (row) => row.value },
      { header: `Previous period (${q.previousFromDay} to ${addDays(q.fromDay, -1)})`, value: (row) => row.previous },
      { header: "Change", value: (row) => row.change },
      { header: "Change is in", value: (row) => row.unit },
    ], [
      line("Revenue (Rs)", "revenue", "percent", true),
      line("Orders placed", "ordersPlaced", "percent"),
      line("Orders that counted as sales", "salesOrders", "percent"),
      line("Average order value (Rs)", "averageOrderValue", "percent", true),
      line("Units sold", "unitsSold", "percent"),
      line("New customers", "newCustomers", "percent"),
      line("Cancelled orders", "cancelledOrders", "percent"),
      line("Cancelled orders, % of orders placed", "cancelledShare", "percentage points"),
    ]);
  }

  res.json({
    range: { ...rangeOf(q), previousFrom: q.previousFromDay, previousTo: addDays(q.fromDay, -1), firstOrderDay, comparable },
    totals,
  });
});

// ─────────────────────────────────────────────────────────── Sales over time

type TimePoint = {
  date: string; orders: number; units: number; revenue: number;
  d2cOrders: number; d2cUnits: number; d2cRevenue: number;
  b2bOrders: number; b2bUnits: number; b2bRevenue: number;
};

reportRoutes.get("/sales-over-time", async (req, res) => {
  const q = readQuery(req);
  const seriesRows = await prisma.$queryRaw<{ bucket: Date; channel: string; orders: number; units: number; revenue: number }[]>`
    SELECT date_trunc(${q.unit}, (o."placedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${q.zone}) AS bucket,
           o.channel::text AS channel,
           count(*)::int AS orders,
           coalesce(sum(i.units), 0)::int AS units,
           coalesce(sum(o."grandTotal"), 0)::float8 AS revenue
    FROM "Order" o ${ORDER_UNITS}
    WHERE ${sales(q)}
    GROUP BY 1, 2
    ORDER BY 1`;

  // one row per day or month, including the ones with no sales
  const points = new Map<string, TimePoint>();
  const blank = (date: string): TimePoint => ({
    date, orders: 0, units: 0, revenue: 0, d2cOrders: 0, d2cUnits: 0, d2cRevenue: 0, b2bOrders: 0, b2bUnits: 0, b2bRevenue: 0,
  });
  if (q.unit === "day") {
    for (let date = q.fromDay; date <= q.toDay; date = addDays(date, 1)) points.set(date, blank(date));
  } else {
    const cursor = new Date(`${q.fromDay.slice(0, 7)}-01T00:00:00Z`);
    const last = q.toDay.slice(0, 7);
    while (cursor.toISOString().slice(0, 7) <= last) {
      const date = cursor.toISOString().slice(0, 10);
      points.set(date, blank(date));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }
  for (const row of seriesRows) {
    const point = points.get(row.bucket.toISOString().slice(0, 10));
    if (!point) continue;
    point.orders += row.orders;
    point.units += row.units;
    point.revenue += row.revenue;
    if (row.channel === "B2B") {
      point.b2bOrders += row.orders;
      point.b2bUnits += row.units;
      point.b2bRevenue += row.revenue;
    } else {
      point.d2cOrders += row.orders;
      point.d2cUnits += row.units;
      point.d2cRevenue += row.revenue;
    }
  }

  reply<TimePoint>(res, q, "sales-over-time", [
    { header: q.unit === "day" ? "Date" : "Month", value: (row) => (q.unit === "day" ? row.date : row.date.slice(0, 7)) },
    { header: "Orders", value: (row) => row.orders },
    { header: "Units sold", value: (row) => row.units },
    { header: "Revenue (Rs)", value: (row) => money(row.revenue) },
    { header: "D2C orders", value: (row) => row.d2cOrders },
    { header: "D2C units", value: (row) => row.d2cUnits },
    { header: "D2C revenue (Rs)", value: (row) => money(row.d2cRevenue) },
    { header: "B2B orders", value: (row) => row.b2bOrders },
    { header: "B2B units", value: (row) => row.b2bUnits },
    { header: "B2B revenue (Rs)", value: (row) => money(row.b2bRevenue) },
  ], [...points.values()], { unit: q.unit });
});

// ─────────────────────────────────────────────────────────── What was sold (counted per item)

reportRoutes.get("/by-brand", async (req, res) => {
  const q = readQuery(req);
  const rows = await prisma.$queryRaw<SalesRow[]>`
    SELECT coalesce(nullif(oi."brandName", ''), 'Unbranded') AS name,
           count(DISTINCT oi."orderId")::int AS orders,
           sum(oi.quantity)::int AS units,
           sum(oi."lineTotal")::float8 AS revenue
    FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId"
    WHERE ${sales(q)}
    GROUP BY 1
    ORDER BY revenue DESC, name`;
  reply(res, q, "brands", salesColumns<SalesRow>("Brand", (row) => titleCase(row.name)), rows);
});

type CategoryRow = SalesRow & { categoryId: number | null };

reportRoutes.get("/by-category", async (req, res) => {
  const q = readQuery(req);
  // every category is filed under the top-level category it sits below
  const rows = await prisma.$queryRaw<CategoryRow[]>`
    WITH RECURSIVE tree AS (
      SELECT id, id AS "rootId", name AS "rootName" FROM "Category" WHERE "parentId" IS NULL
      UNION ALL
      SELECT c.id, t."rootId", t."rootName" FROM "Category" c JOIN tree t ON c."parentId" = t.id
    )
    SELECT t."rootId" AS "categoryId",
           coalesce(t."rootName", 'No category') AS name,
           count(DISTINCT oi."orderId")::int AS orders,
           sum(oi.quantity)::int AS units,
           sum(oi."lineTotal")::float8 AS revenue
    FROM "OrderItem" oi
    JOIN "Order" o ON o.id = oi."orderId"
    LEFT JOIN "Product" p ON p.id = oi."productId"
    LEFT JOIN tree t ON t.id = p."categoryId"
    WHERE ${sales(q)}
    GROUP BY 1, 2
    ORDER BY revenue DESC, name`;
  reply(res, q, "categories", salesColumns<CategoryRow>("Category", (row) => titleCase(row.name)), rows);
});

type ProductRow = SalesRow & { productId: number | null; brand: string | null };

reportRoutes.get("/by-product", async (req, res) => {
  const q = readQuery(req);
  const rows = await prisma.$queryRaw<ProductRow[]>`
    SELECT oi."productId" AS "productId",
           min(oi."productName") AS name,
           min(nullif(oi."brandName", '')) AS brand,
           count(DISTINCT oi."orderId")::int AS orders,
           sum(oi.quantity)::int AS units,
           sum(oi."lineTotal")::float8 AS revenue
    FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId"
    WHERE ${sales(q)}
    GROUP BY coalesce(oi."productId"::text, oi."productName"), oi."productId"
    ORDER BY revenue DESC, name
    LIMIT 100`;
  reply<ProductRow>(res, q, "products", [
    { header: "Product", value: (row) => titleCase(row.name) },
    { header: "Brand", value: (row) => (row.brand ? titleCase(row.brand) : "") },
    { header: "Orders", value: (row) => row.orders },
    { header: "Units sold", value: (row) => row.units },
    { header: "Revenue (Rs)", value: (row) => money(row.revenue) },
  ], rows, { limit: 100 });
});

// ─────────────────────────────────────────────────────────── How and where (counted per order)

type PaymentRow = SalesRow & { method: string };

reportRoutes.get("/by-payment-method", async (req, res) => {
  const q = readQuery(req);
  const rows = await prisma.$queryRaw<PaymentRow[]>`
    SELECT o."paymentMethod"::text AS method,
           o."paymentMethod"::text AS name,
           count(*)::int AS orders,
           coalesce(sum(i.units), 0)::int AS units,
           coalesce(sum(o."grandTotal"), 0)::float8 AS revenue
    FROM "Order" o ${ORDER_UNITS}
    WHERE ${sales(q)}
    GROUP BY 1
    ORDER BY revenue DESC, name`;
  reply(res, q, "payment-methods", salesColumns<PaymentRow>("Payment method", (row) => paymentLabel(row.method)), rows);
});

reportRoutes.get("/by-state", async (req, res) => {
  const q = readQuery(req);
  // "  maharashtra " and "MAHARASHTRA" are the same state
  const rows = await prisma.$queryRaw<SalesRow[]>`
    SELECT coalesce(nullif(initcap(regexp_replace(btrim(o."shippingState"), '\\s+', ' ', 'g')), ''), 'Not given') AS name,
           count(*)::int AS orders,
           coalesce(sum(i.units), 0)::int AS units,
           coalesce(sum(o."grandTotal"), 0)::float8 AS revenue
    FROM "Order" o ${ORDER_UNITS}
    WHERE ${sales(q)}
    GROUP BY 1
    ORDER BY revenue DESC, name`;
  reply(res, q, "states", salesColumns<SalesRow>("State"), rows);
});

type StatusRow = SalesRow & { status: string; countsAsSale: boolean };

reportRoutes.get("/by-status", async (req, res) => {
  const q = readQuery(req);
  // every order placed in the range, whatever happened to it afterwards
  const found = await prisma.$queryRaw<Omit<StatusRow, "countsAsSale">[]>`
    SELECT o.status::text AS status,
           o.status::text AS name,
           count(*)::int AS orders,
           coalesce(sum(i.units), 0)::int AS units,
           coalesce(sum(o."grandTotal"), 0)::float8 AS revenue
    FROM "Order" o ${ORDER_UNITS}
    WHERE ${inRange(q.from, q.to)} ${inChannel(q.channel)}
    GROUP BY 1
    ORDER BY revenue DESC, name`;
  const rows: StatusRow[] = found.map((row) => ({ ...row, countsAsSale: !NOT_A_SALE.includes(row.status) }));
  reply<StatusRow>(res, q, "order-status", [
    { header: "Order status", value: (row) => humanize(row.status) },
    { header: "Orders", value: (row) => row.orders },
    { header: "Units", value: (row) => row.units },
    { header: "Order value (Rs)", value: (row) => money(row.revenue) },
    { header: "Counted as sales", value: (row) => (row.countsAsSale ? "Yes" : "No") },
  ], rows);
});

// ─────────────────────────────────────────────────────────── Customers

type CustomerRow = { userId: number | null; name: string | null; phone: string | null; orders: number; revenue: number; lastOrderAt: Date };

reportRoutes.get("/top-customers", async (req, res) => {
  const q = readQuery(req);
  // one row per account; orders without an account are matched by phone number, then by name
  const rows = await prisma.$queryRaw<CustomerRow[]>`
    SELECT max(o."userId") AS "userId",
           coalesce(
             nullif(btrim(max(concat_ws(' ', u."firstName", u."lastName"))), ''),
             (array_agg(btrim(o."customerName") ORDER BY o."placedAt" DESC) FILTER (WHERE nullif(btrim(o."customerName"), '') IS NOT NULL))[1]
           ) AS name,
           coalesce(
             max(u.phone),
             (array_agg(btrim(o."customerPhone") ORDER BY o."placedAt" DESC) FILTER (WHERE nullif(btrim(o."customerPhone"), '') IS NOT NULL))[1]
           ) AS phone,
           count(*)::int AS orders,
           coalesce(sum(o."grandTotal"), 0)::float8 AS revenue,
           max(o."placedAt") AS "lastOrderAt"
    FROM "Order" o LEFT JOIN "User" u ON u.id = o."userId"
    WHERE ${sales(q)}
    GROUP BY coalesce(
      'user:' || o."userId",
      'phone:' || nullif(btrim(o."customerPhone"), ''),
      'name:' || nullif(lower(btrim(o."customerName")), ''),
      'order:' || o.id
    )
    ORDER BY revenue DESC, "lastOrderAt" DESC
    LIMIT 50`;
  reply<CustomerRow>(res, q, "top-customers", [
    { header: "Customer", value: (row) => (row.name ? titleCase(row.name) : "") },
    { header: "Phone", value: (row) => row.phone },
    { header: "Orders", value: (row) => row.orders },
    { header: "Revenue (Rs)", value: (row) => money(row.revenue) },
    { header: "Last order", value: (row) => stamp(row.lastOrderAt, q.zone) },
  ], rows, { limit: 50 });
});

type B2BRow = {
  accountId: number; doctor: string; clinic: string; type: string; tier: string | null; city: string | null;
  orders: number; revenue: number; lastOrderAt: Date;
};

reportRoutes.get("/b2b-customers", async (req, res) => {
  const q = readQuery(req);
  // wholesale orders only, the same way the B2B customers page adds up what an account has spent
  const rows = await prisma.$queryRaw<B2BRow[]>`
    SELECT a.id AS "accountId",
           coalesce(nullif(btrim(a."contactName"), ''), nullif(btrim(concat_ws(' ', u."firstName", u."lastName")), ''), a."businessName") AS doctor,
           a."businessName" AS clinic,
           a.type::text AS type,
           t.name AS tier,
           a.city AS city,
           count(*)::int AS orders,
           coalesce(sum(o."grandTotal"), 0)::float8 AS revenue,
           max(o."placedAt") AS "lastOrderAt"
    FROM "Order" o
    JOIN "B2BAccount" a ON a.id = o."b2bAccountId"
    JOIN "User" u ON u.id = a."userId"
    LEFT JOIN "PriceTier" t ON t.id = a."priceTierId"
    WHERE ${sales(q)} AND o.channel = 'B2B'
    GROUP BY a.id, u.id, t.id
    ORDER BY revenue DESC, doctor`;
  reply<B2BRow>(res, q, "b2b-customers", [
    { header: "Doctor", value: (row) => titleCase(row.doctor) },
    { header: "Clinic", value: (row) => titleCase(row.clinic) },
    { header: "Account type", value: (row) => humanize(row.type) },
    { header: "Price tier", value: (row) => row.tier },
    { header: "City", value: (row) => row.city },
    { header: "Orders", value: (row) => row.orders },
    { header: "Revenue (Rs)", value: (row) => money(row.revenue) },
    { header: "Last order", value: (row) => stamp(row.lastOrderAt, q.zone) },
  ], rows);
});

// ─────────────────────────────────────────────────────────── Stock (as it is right now)

type StockRow = {
  variantId: number; productId: number; product: string; variant: string; sku: string; brand: string | null;
  stock: number; limit: number; state: "OUT" | "LOW";
};

reportRoutes.get("/stock", async (req, res) => {
  const q = readQuery(req); // dates and channel do not apply; only "format" is used
  const rows = await prisma.$queryRaw<StockRow[]>`
    SELECT v.id AS "variantId", p.id AS "productId", p.name AS product, v.title AS variant, v.sku AS sku, b.name AS brand,
           v."stockQuantity" AS stock, v."lowStockThreshold" AS "limit",
           CASE WHEN v."stockQuantity" <= 0 THEN 'OUT' ELSE 'LOW' END AS state
    FROM "ProductVariant" v
    JOIN "Product" p ON p.id = v."productId"
    LEFT JOIN "Brand" b ON b.id = p."brandId"
    WHERE v."isActive" AND (v."stockQuantity" <= 0 OR v."stockQuantity" <= v."lowStockThreshold")
    ORDER BY v."stockQuantity", p.name, v.title`;

  const columns: Column<StockRow>[] = [
    { header: "Product", value: (row) => titleCase(row.product) },
    { header: "Variant", value: (row) => row.variant },
    { header: "SKU", value: (row) => row.sku },
    { header: "Brand", value: (row) => (row.brand ? titleCase(row.brand) : "") },
    { header: "In stock", value: (row) => row.stock },
    { header: "Low stock limit", value: (row) => row.limit },
    { header: "Stock level", value: (row) => (row.state === "OUT" ? "Out of stock" : "Running low") },
  ];
  if (q.csv) return sendCsv(res, "report-stock", columns, rows);

  const outOfStock = rows.filter((row) => row.state === "OUT").length;
  res.json({ counts: { outOfStock, lowStock: rows.length - outOfStock }, rows });
});
