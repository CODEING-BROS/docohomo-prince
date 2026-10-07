import { num } from "./http";
import { money, notify, siteLink } from "./notifications";
import { prisma } from "./prisma";
import { refundsDue } from "./refunds";
import { addDays, dayInZone, dayStart, DEFAULT_ZONE } from "./time";

// The owner's summary by email: yesterday, last week, last month.
// It says how the shop and the consultations did, and what is waiting for someone to act on,
// so nobody has to open the panel just to find out whether anything needs them.

export type ReportKind = "daily" | "weekly" | "monthly";
export type ReportSettings = {
  daily: boolean; weekly: boolean; monthly: boolean;
  weekday: number; // the day the weekly report goes out: 0 Sunday … 6 Saturday
  hour: number; // India time, 0 to 23
  recipients: string[]; // empty: the people who get staff alerts
  attachOrders: boolean; // a spreadsheet of the period's orders
};
const KEY = "reports.email";
const SENT_KEY = "reports.email.sent";
const DEFAULTS: ReportSettings = { daily: false, weekly: true, monthly: true, weekday: 1, hour: 9, recipients: [], attachOrders: true };

export const reportSettings = async (): Promise<ReportSettings> => {
  const saved = await prisma.setting.findUnique({ where: { key: KEY } });
  return { ...DEFAULTS, ...((saved?.value ?? {}) as Partial<ReportSettings>) };
};
export const saveReportSettings = async (value: ReportSettings) => {
  await prisma.setting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } });
  return value;
};

/** Who the report goes to: the addresses chosen for it, else the same people who get staff alerts. */
export const reportRecipients = async (settings: ReportSettings) => {
  if (settings.recipients.length) return settings.recipients;
  const alerts = await prisma.setting.findUnique({ where: { key: "notifications.staff" } });
  const chosen = ((alerts?.value ?? {}) as { emails?: string[] }).emails?.filter(Boolean) ?? [];
  if (chosen.length) return chosen;
  // admins who have signed in to this panel; accounts only carried over from the old system are left out
  return (await prisma.user.findMany({ where: { role: { in: ["SUPER_ADMIN", "ADMIN"] }, isActive: true, email: { not: null }, lastLoginAt: { not: null } }, select: { email: true } })).map((u) => u.email!);
};

const NOT_A_SALE = ["CANCELLED", "UNDELIVERED", "RETURNED", "REFUNDED"] as const;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const titleCase = (value: string) => value.replace(/(^|\s)[a-z]/g, (letter) => letter.toUpperCase());
const plural = (count: number, one: string, many = `${one}s`) => `${new Intl.NumberFormat("en-IN").format(count)} ${count === 1 ? one : many}`;
const longDay = (day: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${day}T00:00:00Z`));
const shortDay = (day: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", day: "numeric", month: "short" }).format(new Date(`${day}T00:00:00Z`));
const monthName = (day: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(`${day}T00:00:00Z`));

/** The days a report covers, and the same-length stretch before it to compare with. `toDay` is not included. */
export const periodOf = (kind: ReportKind, now = new Date()) => {
  const today = dayInZone(now, DEFAULT_ZONE);
  if (kind === "daily") {
    const fromDay = addDays(today, -1);
    return { kind, fromDay, toDay: today, beforeDay: addDays(today, -2), label: longDay(fromDay), title: "Daily report", versus: "the day before" };
  }
  if (kind === "weekly") {
    const fromDay = addDays(today, -7);
    return { kind, fromDay, toDay: today, beforeDay: addDays(today, -14), label: `${shortDay(fromDay)} to ${shortDay(addDays(today, -1))}`, title: "Weekly report", versus: "the week before" };
  }
  const thisMonth = `${today.slice(0, 7)}-01`;
  const fromDay = `${addDays(thisMonth, -1).slice(0, 7)}-01`;
  const beforeDay = `${addDays(fromDay, -1).slice(0, 7)}-01`;
  return { kind, fromDay, toDay: thisMonth, beforeDay, label: monthName(fromDay), title: "Monthly report", versus: "the month before" };
};

const change = (now: number, before: number, versus: string) => {
  if (before === 0) return now === 0 ? "" : ` (nothing ${versus})`;
  const percent = Math.round(((now - before) / before) * 100);
  return percent === 0 ? ` (same as ${versus})` : ` (${percent > 0 ? "up" : "down"} ${Math.abs(percent)}% on ${versus})`;
};

const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** Works out one report: the numbers, the email text, and the orders spreadsheet. */
export const buildReport = async (kind: ReportKind, now = new Date()) => {
  const period = periodOf(kind, now);
  const from = dayStart(period.fromDay, DEFAULT_ZONE);
  const to = dayStart(period.toDay, DEFAULT_ZONE);
  const before = dayStart(period.beforeDay, DEFAULT_ZONE);
  const inPeriod = { gte: from, lt: to };

  const [byKind, earlier, best, newCustomers, returnsOpened, consults, earlierConsults, newDoctors] = await Promise.all([
    prisma.order.groupBy({ by: ["channel", "status"], where: { placedAt: inPeriod }, _count: true, _sum: { grandTotal: true } }),
    prisma.order.aggregate({ where: { placedAt: { gte: before, lt: from }, status: { notIn: [...NOT_A_SALE] } }, _count: true, _sum: { grandTotal: true } }),
    prisma.orderItem.groupBy({
      by: ["productName", "variantTitle"], where: { order: { placedAt: inPeriod, status: { notIn: [...NOT_A_SALE] } } },
      _sum: { quantity: true, lineTotal: true }, orderBy: { _sum: { lineTotal: "desc" } }, take: 5,
    }),
    prisma.user.count({ where: { role: "CUSTOMER", createdAt: inPeriod } }),
    prisma.returnRequest.count({ where: { createdAt: inPeriod } }),
    prisma.appointment.groupBy({ by: ["status", "cancelledBy"], where: { scheduledAt: inPeriod }, _count: true, _sum: { fee: true, doctorEarning: true } }),
    prisma.appointment.count({ where: { scheduledAt: { gte: before, lt: from }, status: "COMPLETED" } }),
    prisma.doctorProfile.count({ where: { createdAt: inPeriod } }),
  ]);

  const isSale = (status: string) => !(NOT_A_SALE as readonly string[]).includes(status);
  const sum = (rows: typeof byKind) => ({ orders: rows.reduce((n, r) => n + r._count, 0), revenue: rows.reduce((n, r) => n + num(r._sum.grandTotal), 0) });
  const sold = sum(byKind.filter((r) => isSale(r.status)));
  const retail = sum(byKind.filter((r) => isSale(r.status) && r.channel === "D2C"));
  const wholesale = sum(byKind.filter((r) => isSale(r.status) && r.channel === "B2B"));
  const placed = byKind.reduce((n, r) => n + r._count, 0);
  const cancelled = byKind.filter((r) => r.status === "CANCELLED").reduce((n, r) => n + r._count, 0);
  const soldBefore = { orders: earlier._count, revenue: num(earlier._sum.grandTotal) };

  const done = consults.filter((c) => c.status === "COMPLETED");
  const consultations = {
    completed: done.reduce((n, c) => n + c._count, 0),
    fees: done.reduce((n, c) => n + num(c._sum.fee), 0),
    platformShare: done.reduce((n, c) => n + num(c._sum.fee) - num(c._sum.doctorEarning), 0),
    missedByDoctor: consults.filter((c) => c.status === "CANCELLED" && c.cancelledBy === "DOCTOR").reduce((n, c) => n + c._count, 0),
    cancelledByPatient: consults.filter((c) => c.status === "CANCELLED" && c.cancelledBy === "PATIENT").reduce((n, c) => n + c._count, 0),
    patientAbsent: consults.filter((c) => c.status === "NO_SHOW").reduce((n, c) => n + c._count, 0),
  };

  // what is waiting right now, whatever the period
  const returnsArrived = await prisma.returnRequest.count({ where: { status: "PICKED_UP", pickupArrivedAt: { not: null } } });
  const [toProcess, returnsWaiting, returnsToRefund, cancelRefunds, payouts, doctorsWaiting, b2bWaiting, outOfStock, lowStock] = await Promise.all([
    prisma.order.count({ where: { status: { in: ["PENDING", "CONFIRMED", "PROCESSING", "PACKED"] } } }),
    prisma.returnRequest.count({ where: { status: "REQUESTED" } }),
    prisma.returnRequest.aggregate({ where: { status: "RECEIVED" }, _count: true, _sum: { refundAmount: true } }),
    refundsDue(),
    prisma.doctorPayout.aggregate({ where: { status: "PENDING" }, _count: true, _sum: { amount: true } }),
    prisma.doctorProfile.count({ where: { verificationStatus: { in: ["PENDING", "UNDER_REVIEW"] } } }),
    prisma.b2BAccount.count({ where: { status: { in: ["PENDING", "UNDER_REVIEW"] } } }),
    prisma.productVariant.count({ where: { isActive: true, stockQuantity: { lte: 0 }, product: { status: "ACTIVE" } } }),
    prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM "ProductVariant" v JOIN "Product" p ON p.id = v."productId"
      WHERE v."isActive" AND p.status = 'ACTIVE' AND v."stockQuantity" > 0 AND v."stockQuantity" <= v."lowStockThreshold"`,
  ]);
  const refundCount = cancelRefunds.length + returnsToRefund._count;
  const refundAmount = cancelRefunds.reduce((n, r) => n + r.left, 0) + num(returnsToRefund._sum.refundAmount);
  const attention = [
    toProcess ? `${plural(toProcess, "order")} to pack and send: ${siteLink("/admin/orders?open=1")}` : null,
    returnsWaiting ? `${plural(returnsWaiting, "return request")} waiting for a decision: ${siteLink("/admin/returns?status=REQUESTED")}` : null,
    returnsArrived ? `${plural(returnsArrived, "returned parcel")} delivered back to you, to open and check: ${siteLink("/admin/returns?status=PICKED_UP")}` : null,
    refundCount ? `${plural(refundCount, "refund")} to send, ${money(refundAmount)} in all: ${siteLink("/admin/refunds")}` : null,
    payouts._count ? `${plural(payouts._count, "doctor payout")} to pay, ${money(payouts._sum.amount)} in all: ${siteLink("/admin/payouts")}` : null,
    doctorsWaiting ? `${plural(doctorsWaiting, "doctor")} waiting to be verified: ${siteLink("/admin/doctors?status=PENDING")}` : null,
    b2bWaiting ? `${plural(b2bWaiting, "wholesale application")} to review: ${siteLink("/admin/b2b?status=PENDING")}` : null,
    outOfStock || lowStock[0]?.n ? `${plural(outOfStock, "product")} out of stock and ${lowStock[0]?.n ?? 0} running low: ${siteLink("/admin/inventory")}` : null,
  ].filter((line): line is string => line !== null);

  const lines = [
    `${period.title} for ${period.label}`,
    "",
    "SALES",
    `Orders: ${sold.orders}${change(sold.orders, soldBefore.orders, period.versus)}`,
    `Revenue: ${money(Math.round(sold.revenue))}${change(sold.revenue, soldBefore.revenue, period.versus)}`,
    sold.orders ? `Average order: ${money(Math.round(sold.revenue / sold.orders))}` : null,
    sold.orders ? `Retail: ${plural(retail.orders, "order")}, ${money(Math.round(retail.revenue))}` : null,
    sold.orders ? `Wholesale: ${plural(wholesale.orders, "order")}, ${money(Math.round(wholesale.revenue))}` : null,
    placed ? `Cancelled: ${cancelled} of ${plural(placed, "order")} placed` : "No orders were placed.",
    returnsOpened ? `Returns opened: ${returnsOpened}` : null,
    `New customers: ${newCustomers}`,
    "",
    ...(best.length
      ? ["BEST SELLERS", ...best.map((item, index) => `${index + 1}. ${titleCase(item.productName)}${item.variantTitle ? ` (${item.variantTitle})` : ""}: ${plural(item._sum.quantity ?? 0, "unit")}, ${money(Math.round(num(item._sum.lineTotal)))}`), ""]
      : []),
    "CONSULTATIONS",
    `Completed: ${consultations.completed}${change(consultations.completed, earlierConsults, period.versus)}`,
    consultations.completed ? `Fees collected: ${money(Math.round(consultations.fees))}, of which the platform keeps ${money(Math.round(consultations.platformShare))}` : null,
    consultations.missedByDoctor ? `Missed by the doctor: ${consultations.missedByDoctor}` : null,
    consultations.cancelledByPatient ? `Cancelled by the patient: ${consultations.cancelledByPatient}` : null,
    consultations.patientAbsent ? `Patient did not join: ${consultations.patientAbsent}` : null,
    newDoctors ? `New doctors registered: ${newDoctors}` : null,
    "",
    "WAITING FOR YOU NOW",
    ...(attention.length ? attention.map((line) => `• ${line}`) : ["Nothing is waiting. Everything is up to date."]),
  ].filter((line): line is string => line !== null);

  return {
    kind, period: { from: period.fromDay, to: addDays(period.toDay, -1), label: period.label },
    subject: `DocHomoeo ${period.title.toLowerCase()}: ${plural(sold.orders, "order")}, ${money(Math.round(sold.revenue))} (${period.label})`,
    body: lines.join("\n").replace(/\n{3,}/g, "\n\n"),
    numbers: { orders: sold.orders, revenue: Math.round(sold.revenue), consultations: consultations.completed, waiting: attention.length },
    range: { from, to },
  };
};

/** The period's orders as a spreadsheet file, to attach. */
const ordersSheet = async (from: Date, to: Date) => {
  const orders = await prisma.order.findMany({
    where: { placedAt: { gte: from, lt: to } }, orderBy: { placedAt: "asc" }, take: 20_000,
    select: { orderNumber: true, placedAt: true, customerName: true, customerPhone: true, shippingCity: true, shippingState: true, channel: true, status: true, paymentMethod: true, paymentStatus: true, grandTotal: true },
  });
  if (orders.length === 0) return null;
  const stamp = new Intl.DateTimeFormat("en-GB", { timeZone: DEFAULT_ZONE, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  const rows = [
    ["Order", "Placed (India time)", "Customer", "Mobile", "City", "State", "Type", "Status", "Payment", "Payment status", "Total (Rs)"],
    ...orders.map((o) => [o.orderNumber, stamp.format(o.placedAt), o.customerName, o.customerPhone, o.shippingCity, o.shippingState, o.channel === "B2B" ? "Wholesale" : "Retail", o.status, o.paymentMethod, o.paymentStatus, num(o.grandTotal).toFixed(2)]),
  ];
  // the mark at the start makes Excel read ₹ and Indian names correctly
  return Buffer.from(`﻿${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`, "utf8");
};

/** Builds and sends one report. With `to`, only to that address (the "send me one now" button). */
export const sendReport = async (kind: ReportKind, options: { to?: string[]; now?: Date } = {}) => {
  const settings = await reportSettings();
  const report = await buildReport(kind, options.now);
  const recipients = options.to ?? (await reportRecipients(settings));
  const sheet = settings.attachOrders ? await ordersSheet(report.range.from, report.range.to) : null;
  const attachments = sheet ? [{ filename: `orders-${report.period.from}-to-${report.period.to}.csv`, content: sheet }] : [];
  for (const email of recipients) {
    await notify("staff.report", { name: "team", email }, {
      title: report.subject, body: report.body, period: report.period.label, orders: report.numbers.orders, revenue: money(report.numbers.revenue), link: siteLink("/admin/reports"),
    }, undefined, { attachments });
  }
  return { sent: recipients.length, recipients, subject: report.subject };
};

/** Run every few minutes: sends whichever reports are due today and have not gone yet. */
export const sendDueReports = async (now = new Date()) => {
  const settings = await reportSettings();
  if (!settings.daily && !settings.weekly && !settings.monthly) return [];
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: DEFAULT_ZONE, hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  if (Number(parts.find((p) => p.type === "hour")!.value) < settings.hour) return [];
  const today = dayInZone(now, DEFAULT_ZONE);
  const date = new Date(`${today}T00:00:00Z`);
  const due: ReportKind[] = [
    ...(settings.daily ? (["daily"] as const) : []),
    ...(settings.weekly && date.getUTCDay() === settings.weekday ? (["weekly"] as const) : []),
    ...(settings.monthly && date.getUTCDate() === 1 ? (["monthly"] as const) : []),
  ];
  if (due.length === 0) return [];

  const saved = await prisma.setting.findUnique({ where: { key: SENT_KEY } });
  const sent = { ...((saved?.value ?? {}) as Partial<Record<ReportKind, string>>) };
  const gone: ReportKind[] = [];
  for (const kind of due) {
    if (sent[kind] === today) continue;
    // marked first, so a report that fails half way is not sent twice to the people who did get it
    sent[kind] = today;
    await prisma.setting.upsert({ where: { key: SENT_KEY }, update: { value: sent }, create: { key: SENT_KEY, value: sent } });
    await sendReport(kind, { now });
    gone.push(kind);
  }
  return gone;
};

export const lastSent = async () => ((await prisma.setting.findUnique({ where: { key: SENT_KEY } }))?.value ?? {}) as Partial<Record<ReportKind, string>>;
export const weekdayName = (day: number) => WEEKDAYS[day] ?? "";
