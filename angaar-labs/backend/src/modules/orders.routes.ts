import { autoInvoice } from "../lib/invoice";
import { cancelOrderAndRestock } from "../lib/housekeeping";
import * as events from "../lib/events";
import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "../generated/prisma/client";
import { OrderStatus } from "../generated/prisma/client";
import { HttpError, getPage, idParam, notFound, num, numOrNull, optionalString, paged } from "../lib/http";
import { prisma } from "../lib/prisma";
import { addDays, dayStart, isoDay, zoneParam } from "../lib/time";

export const orderRoutes = Router();

const blank = (v: unknown) => (v === "" ? undefined : v);

const listSchema = z.object({
  q: optionalString,
  status: z.preprocess(blank, z.enum(OrderStatus).optional()),
  channel: z.preprocess(blank, z.enum(["D2C", "B2B"]).optional()),
  paymentMethod: z.preprocess(blank, z.enum(["COD", "ONLINE", "CREDIT", "BANK_TRANSFER"]).optional()),
  from: z.preprocess(blank, isoDay.optional()),
  to: z.preprocess(blank, isoDay.optional()),
  tz: zoneParam,
  open: z.preprocess(blank, z.enum(["1"]).optional()), // every order not handed to the courier yet
});

const OPEN_STATUSES: OrderStatus[] = ["PENDING", "CONFIRMED", "PROCESSING", "PACKED"];

export const orderFilters = listSchema;

/** `base` is everything except the status filter, so the status tabs can show their own counts. */
export const orderWhere = (filters: z.infer<typeof listSchema>) => {
  const base: Prisma.OrderWhereInput = {};
  if (filters.q) {
    base.OR = [
      { orderNumber: { contains: filters.q, mode: "insensitive" } },
      { customerName: { contains: filters.q, mode: "insensitive" } },
      { customerPhone: { contains: filters.q } },
      { customerEmail: { contains: filters.q, mode: "insensitive" } },
    ];
  }
  if (filters.channel) base.channel = filters.channel;
  if (filters.paymentMethod) base.paymentMethod = filters.paymentMethod;
  if (filters.from || filters.to) {
    base.placedAt = {
      ...(filters.from ? { gte: dayStart(filters.from, filters.tz) } : {}),
      ...(filters.to ? { lt: dayStart(addDays(filters.to, 1), filters.tz) } : {}),
    };
  }
  const where: Prisma.OrderWhereInput = { ...base, ...(filters.status ? { status: filters.status } : filters.open ? { status: { in: OPEN_STATUSES } } : {}) };
  return { base, where };
};

orderRoutes.get("/", async (req, res) => {
  const { page, pageSize, skip, take } = getPage(req);
  const { base, where } = orderWhere(listSchema.parse(req.query));

  const [total, rows, statusCounts] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { placedAt: "desc" },
      skip,
      take,
      select: {
        id: true, orderNumber: true, channel: true, status: true, paymentStatus: true, paymentMethod: true,
        grandTotal: true, customerName: true, customerPhone: true, shippingCity: true, shippingState: true,
        placedAt: true, _count: { select: { items: true } },
      },
    }),
    prisma.order.groupBy({ by: ["status"], where: base, _count: true }),
  ]);

  const items = rows.map(({ _count, grandTotal, ...o }) => ({ ...o, grandTotal: num(grandTotal), itemCount: _count.items }));
  res.json({
    ...paged(items, total, page, pageSize),
    statusCounts: Object.fromEntries(statusCounts.map((s) => [s.status, s._count])),
  });
});

orderRoutes.get("/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: true,
      history: { orderBy: { createdAt: "desc" } },
      payments: { orderBy: { createdAt: "desc" } },
      shipments: { orderBy: { createdAt: "desc" } },
      user: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
      b2bAccount: { select: { id: true, businessName: true, type: true } },
    },
  });
  if (!order) throw notFound("Order");

  res.json({
    ...order,
    subtotal: num(order.subtotal),
    discountTotal: num(order.discountTotal),
    couponDiscount: num(order.couponDiscount),
    shippingCharge: num(order.shippingCharge),
    codCharge: num(order.codCharge),
    taxTotal: num(order.taxTotal),
    grandTotal: num(order.grandTotal),
    items: order.items.map((i) => ({
      ...i,
      mrp: numOrNull(i.mrp),
      unitPrice: num(i.unitPrice),
      discount: num(i.discount),
      gstPercent: num(i.gstPercent),
      lineTotal: num(i.lineTotal),
    })),
    payments: order.payments.map(({ rawResponse: _raw, ...p }) => ({
      ...p,
      amount: num(p.amount),
      refundedAmount: num(p.refundedAmount),
    })),
    shipments: order.shipments.map((s) => ({ ...s, shippingCost: numOrNull(s.shippingCost) })),
  });
});

const statusSchema = z.object({
  status: z.enum(OrderStatus),
  note: z.string().trim().max(500).optional(),
});

// Which statuses stamp a date on the order.
const STAMPS: Partial<Record<OrderStatus, "confirmedAt" | "shippedAt" | "deliveredAt" | "cancelledAt">> = {
  CONFIRMED: "confirmedAt",
  SHIPPED: "shippedAt",
  DELIVERED: "deliveredAt",
  CANCELLED: "cancelledAt",
};

orderRoutes.patch("/:id/status", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { status, note } = statusSchema.parse(req.body);

  const order = await prisma.order.findUnique({ where: { id }, select: { status: true } });
  if (!order) throw notFound("Order");
  if (order.status === status) throw new HttpError(400, "The order already has this status");

  // cancelling puts the stock back on the shelf, the same way as when the customer cancels
  if (status === "CANCELLED") {
    const done = await prisma.$transaction(async (tx) => {
      const ok = await cancelOrderAndRestock(tx, id, note ?? "Cancelled by staff", req.user!.id, ["PENDING", "CONFIRMED", "PROCESSING", "PACKED"]);
      if (ok) await tx.auditLog.create({ data: { actorId: req.user!.id, action: "order.status", entity: "Order", entityId: String(id), changes: { from: order.status, to: status, note: note ?? null } } });
      return ok;
    });
    if (!done) throw new HttpError(400, "An order that has left the warehouse cannot be cancelled. Mark it as returned when it comes back.");
    events.orderCancelled(id);
    return res.json({ ok: true, status });
  }

  const stamp = STAMPS[status];
  const now = new Date();
  await prisma.$transaction([
    prisma.order.update({
      where: { id },
      data: {
        status,
        ...(stamp ? { [stamp]: now } : {}),
      },
    }),
    prisma.orderStatusHistory.create({ data: { orderId: id, status, note, changedById: req.user!.id } }),
    prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: "order.status",
        entity: "Order",
        entityId: String(id),
        changes: { from: order.status, to: status, note: note ?? null },
      },
    }),
  ]);

  if (status === "PACKED") void autoInvoice(id, "dispatch");
  if (status === "SHIPPED") events.orderShipped(id);
  if (status === "DELIVERED") events.orderDelivered(id);
  res.json({ ok: true, status });
});

const paymentInput = z.object({
  method: z.enum(["UPI", "BANK", "CASH", "CHEQUE"]),
  amount: z.preprocess(blank, z.coerce.number().positive("Enter an amount above zero").optional()),
  reference: z.preprocess(blank, z.string().trim().max(120).optional()),
});

/** Money that reached the shop outside the payment gateway: a bank transfer, UPI, a cheque, or cash. */
orderRoutes.post("/:id/record-payment", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const input = paymentInput.parse(req.body);
  const order = await prisma.order.findUnique({ where: { id }, select: { status: true, paymentStatus: true, grandTotal: true, userId: true, payments: { where: { status: "SUCCESS" }, select: { amount: true } } } });
  if (!order) throw notFound("Order");
  if (order.status === "CANCELLED") throw new HttpError(400, "A cancelled order cannot take a payment");
  if (["PAID", "REFUNDED"].includes(order.paymentStatus)) throw new HttpError(400, "This order is already paid");
  if (input.method !== "CASH" && !input.reference) throw new HttpError(400, "Enter the reference for this payment");

  const received = order.payments.reduce((sum, p) => sum + num(p.amount), 0);
  const due = Math.round((num(order.grandTotal) - received) * 100) / 100;
  const amount = Math.round((input.amount ?? due) * 100) / 100;
  if (amount > due + 0.005) throw new HttpError(400, `Only ₹${due.toFixed(2)} is still to be paid on this order`);
  const settled = amount >= due - 0.005;
  const how = { UPI: "UPI", BANK: "bank transfer", CASH: "cash", CHEQUE: "cheque" }[input.method];

  await prisma.$transaction([
    prisma.payment.create({ data: { orderId: id, userId: order.userId, provider: "MANUAL", method: input.method, providerRef: input.reference ?? null, amount, status: "SUCCESS", paidAt: new Date() } }),
    prisma.order.update({ where: { id }, data: { paymentStatus: settled ? "PAID" : "PARTIALLY_PAID" } }),
    prisma.orderStatusHistory.create({ data: { orderId: id, status: order.status, note: `₹${amount.toFixed(2)} received by ${how}${input.reference ? ` (reference ${input.reference})` : ""}${settled ? "" : `. ₹${(due - amount).toFixed(2)} still to come.`}`, changedById: req.user!.id } }),
    prisma.auditLog.create({ data: { actorId: req.user!.id, action: "order.payment", entity: "Order", entityId: String(id), changes: { method: input.method, amount, reference: input.reference ?? null } } }),
  ]);
  res.status(201).json({ ok: true, paymentStatus: settled ? "PAID" : "PARTIALLY_PAID", stillDue: settled ? 0 : Math.round((due - amount) * 100) / 100 });
});
