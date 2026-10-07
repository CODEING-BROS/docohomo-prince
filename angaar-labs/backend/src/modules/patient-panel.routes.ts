import { Router } from "express";
import { z } from "zod";
import { HttpError, idParam, notFound, num } from "../lib/http";
import { prisma } from "../lib/prisma";

// What the patient's own dashboard needs beyond booking and ordering (those are in care.routes.ts
// and shop.routes.ts). Mounted at /api/me for signed-in customers.
//   GET   /overview        the first screen: what is coming up, what needs doing, the latest of everything
//   POST  /addresses       add a delivery address
//   PATCH /addresses/:id   change one, or make it the usual one
export const patientPanelRoutes = Router();

const HOLD_MINUTES = 15; // an unpaid slot is kept this long
const DONE_ORDER = ["DELIVERED", "CANCELLED", "UNDELIVERED", "RETURNED", "REFUNDED"] as const;

patientPanelRoutes.get("/overview", async (req, res) => {
  const userId = req.user!.id;
  const now = new Date();
  const [upcoming, pastCount, toRate, unpaidHolds, prescriptions, activeOrders, recentOrders, unpaidOrders, addressCount] = await Promise.all([
    prisma.appointment.findMany({
      where: { patientId: userId, status: { in: ["CONFIRMED", "IN_PROGRESS"] }, scheduledAt: { gt: new Date(now.getTime() - 60 * 60_000) } },
      orderBy: { scheduledAt: "asc" }, take: 3,
      select: {
        id: true, appointmentNumber: true, patientName: true, mode: true, scheduledAt: true, durationMinutes: true, status: true, meetingUrl: true,
        doctor: { select: { displayName: true, photoUrl: true, specialization: true } },
      },
    }),
    prisma.appointment.count({ where: { patientId: userId, status: "COMPLETED" } }),
    prisma.appointment.findMany({
      where: { patientId: userId, status: "COMPLETED", review: null, scheduledAt: { gt: new Date(now.getTime() - 30 * 86_400_000) } },
      orderBy: { scheduledAt: "desc" }, take: 2, select: { id: true, scheduledAt: true, doctor: { select: { displayName: true } } },
    }),
    prisma.appointment.findMany({
      where: { patientId: userId, status: "PENDING_PAYMENT", scheduledAt: { gt: now }, createdAt: { gt: new Date(now.getTime() - HOLD_MINUTES * 60_000) } },
      select: { id: true, scheduledAt: true, fee: true, doctor: { select: { displayName: true } } },
    }),
    prisma.prescription.findMany({
      where: { patientId: userId, status: "ISSUED" }, orderBy: { issuedAt: "desc" }, take: 3,
      select: {
        id: true, prescriptionNumber: true, patientName: true, issuedAt: true, followUpDate: true, diagnosis: true,
        doctor: { select: { displayName: true } }, _count: { select: { items: true, orders: { where: { status: { not: "CANCELLED" } } } } }, // a cancelled order does not count as "ordered"
        items: { select: { quantity: true, variant: { select: { isActive: true, stockQuantity: true, product: { select: { status: true } } } } } },
      },
    }),
    prisma.order.count({ where: { userId, channel: "D2C", status: { notIn: [...DONE_ORDER] } } }),
    prisma.order.findMany({
      where: { userId, channel: "D2C" }, orderBy: { placedAt: "desc" }, take: 3,
      select: { id: true, orderNumber: true, status: true, grandTotal: true, placedAt: true, estimatedDelivery: true, _count: { select: { items: true } }, items: { take: 1, select: { productName: true, imageUrl: true } } },
    }),
    prisma.order.findMany({
      where: { userId, channel: "D2C", paymentMethod: "ONLINE", paymentStatus: { in: ["PENDING", "FAILED"] }, status: "PENDING" },
      select: { id: true, orderNumber: true, grandTotal: true },
    }),
    prisma.address.count({ where: { userId } }),
  ]);
  const prescriptionCount = await prisma.prescription.count({ where: { patientId: userId, status: "ISSUED" } });

  const shapedPrescriptions = prescriptions.map(({ items, _count, ...p }) => ({
    ...p, medicines: _count.items, ordered: _count.orders > 0,
    // how many of its medicines we can deliver right now
    available: items.filter((item) => item.variant && item.variant.isActive && item.variant.product.status === "ACTIVE" && item.variant.stockQuantity >= item.quantity).length,
  }));
  const today = now.toISOString().slice(0, 10);
  const soon = new Date(now.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);

  res.json({
    upcoming: upcoming.map((a) => ({ ...a, startsInMinutes: Math.round((a.scheduledAt.getTime() - now.getTime()) / 60_000) })),
    counts: { upcoming: upcoming.length, consultationsDone: pastCount, prescriptions: prescriptionCount, ordersOnTheWay: activeOrders, addresses: addressCount },
    // things that need the patient, most pressing first
    toDo: [
      ...unpaidHolds.map((a) => ({ kind: "pay-consultation" as const, id: a.id, title: `Finish paying for your consultation with ${a.doctor.displayName}`, detail: `The slot is held for ${HOLD_MINUTES} minutes.`, amount: num(a.fee) })),
      ...unpaidOrders.map((o) => ({ kind: "pay-order" as const, id: o.id, title: `Pay for order ${o.orderNumber}`, detail: "It is kept for 45 minutes after it is placed.", amount: num(o.grandTotal) })),
      ...shapedPrescriptions.filter((p) => !p.ordered && p.available > 0).slice(0, 1).map((p) => ({ kind: "order-medicines" as const, id: p.id, title: `Order the medicines ${p.doctor.displayName} prescribed`, detail: `${p.available} of ${p.medicines} ${p.medicines === 1 ? "medicine" : "medicines"} can be delivered to you.`, amount: null })),
      ...shapedPrescriptions.filter((p) => p.followUpDate && p.followUpDate.toISOString().slice(0, 10) <= soon && p.followUpDate.toISOString().slice(0, 10) >= new Date(now.getTime() - 14 * 86_400_000).toISOString().slice(0, 10)).slice(0, 1)
        .map((p) => ({ kind: "follow-up" as const, id: p.id, title: `Follow up with ${p.doctor.displayName}`, detail: p.followUpDate!.toISOString().slice(0, 10) < today ? "Your follow-up date has passed. Book a slot when you can." : "Your follow-up is due this week.", amount: null })),
      ...toRate.map((a) => ({ kind: "rate" as const, id: a.id, title: `How was your consultation with ${a.doctor.displayName} on ${new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" }).format(a.scheduledAt)}?`, detail: "Your rating helps other patients choose.", amount: null })),
    ],
    prescriptions: shapedPrescriptions,
    orders: recentOrders.map(({ _count, items, ...o }) => ({ ...o, grandTotal: num(o.grandTotal), itemCount: _count.items, firstItem: items[0] ?? null })),
  });
});

// ───────────────────────────────────────────── saved addresses

const addressInput = z.object({
  label: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(30).nullable().optional()),
  fullName: z.string().trim().min(2, "Enter the name for delivery").max(120),
  phone: z.string().trim().regex(/^[6-9][0-9]{9}$/, "Enter a 10-digit mobile number"),
  line1: z.string().trim().min(5, "Enter the house number and street").max(300),
  landmark: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(120).nullable().optional()),
  city: z.string().trim().min(2, "Enter the city").max(80),
  state: z.string().trim().min(2, "Choose the state").max(80),
  pincode: z.string().trim().regex(/^[0-9]{6}$/, "A pincode has 6 digits"),
  isDefault: z.boolean().optional(),
});
const MAX_ADDRESSES = 10;

patientPanelRoutes.post("/addresses", async (req, res) => {
  const input = addressInput.parse(req.body);
  const userId = req.user!.id;
  const count = await prisma.address.count({ where: { userId } });
  if (count >= MAX_ADDRESSES) throw new HttpError(400, `You can keep up to ${MAX_ADDRESSES} addresses. Delete one you no longer use.`);
  const makeDefault = input.isDefault || count === 0; // the first one becomes the usual address
  const created = await prisma.$transaction(async (tx) => {
    if (makeDefault) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
    return tx.address.create({ data: { ...input, userId, isDefault: makeDefault } });
  });
  res.status(201).json({ id: created.id });
});

patientPanelRoutes.patch("/addresses/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const input = addressInput.partial().parse(req.body);
  const userId = req.user!.id;
  const mine = await prisma.address.findFirst({ where: { id, userId }, select: { id: true } });
  if (!mine) throw notFound("Address");
  await prisma.$transaction(async (tx) => {
    if (input.isDefault) await tx.address.updateMany({ where: { userId, id: { not: id } }, data: { isDefault: false } });
    await tx.address.update({ where: { id }, data: input });
  });
  res.json({ ok: true });
});
