import { sendDueReports } from "./report-email";
import { ensureStaffRoles } from "./permissions";
import { refreshReturnPickups } from "./return-pickup";
import { issueInvoice, sellerDetails } from "./invoice";
import { courierReady, shipOrder, shippingSettings } from "./shipping";
import type { Prisma } from "../generated/prisma/client";
import { closeStaleAppointments, runPromotions, runScheduledPayouts } from "./doctor-jobs";
import { appointmentReminder, orderCancelled } from "./events";
import { ensureTemplates, notifyStaff, retryFailed, siteLink } from "./notifications";
import { settlePayment } from "./payments";
import { checkPendingRefunds } from "./refunds";
import { refreshActiveShipments } from "./shipping";
import { gatewayReady } from "./phonepe";
import { prisma } from "./prisma";
import { sweepLooseFiles } from "../modules/consultation-files.routes";

// Jobs the server does on its own every few minutes, so nobody has to:
//   - asks the payment gateway about payments that never came back (the customer closed the tab after paying)
//   - cancels orders that were to be paid online but never were, and puts their stock back on the shelf
//   - asks the gateway about refunds that are still on their way
//   - reminds patients and doctors about 15 minutes before a consultation
//   - closes consultations nobody closed, and cancels (and refunds) ones the doctor never started
//   - on the payout day gathers what doctors are owed into payouts; every day moves up doctors who earned a level
//   - tries again messages that could not be sent
//   - makes any invoice that was missed, and sends any confirmed order that never reached the courier
//   - checks where every parcel is (each one every half hour) and moves its order on; the same for returned parcels on their way back
//   - once a day (after 9 am India time), tells staff what is out of stock or running low
//   - sends the daily, weekly and monthly report emails when they are due

const EVERY_MINUTES = 5;
const UNPAID_ORDER_MINUTES = 45;

/** Cancels an order and returns its stock. Used by the customer's own "Cancel order" and by the clean-up below. */
export const cancelOrderAndRestock = async (
  tx: Prisma.TransactionClient, orderId: number, reason: string, byUserId?: number,
  from: ("PENDING" | "CONFIRMED" | "PROCESSING" | "PACKED")[] = ["PENDING", "CONFIRMED"], // customers can cancel only before packing starts
) => {
  const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) return false;
  const changed = await tx.order.updateMany({ where: { id: orderId, status: { in: from } }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason } });
  if (changed.count === 0) return false;
  for (const item of order.items) {
    if (!item.variantId) continue;
    const after = await tx.productVariant.update({ where: { id: item.variantId }, data: { stockQuantity: { increment: item.quantity } }, select: { stockQuantity: true } });
    await tx.inventoryMovement.create({ data: { variantId: item.variantId, type: "RETURN", quantity: item.quantity, balanceAfter: after.stockQuantity, orderId, note: `Order ${order.orderNumber} cancelled` } });
  }
  await tx.orderStatusHistory.create({ data: { orderId, status: "CANCELLED", note: order.paymentStatus === "PAID" ? `${reason}. A refund is due.` : reason, changedById: byUserId ?? null } });
  return true;
};

const paymentsSweep = async () => {
  if (!gatewayReady) return;
  const now = Date.now();

  // payments still open after a few minutes: find out what really happened
  const open = await prisma.payment.findMany({
    where: { provider: "PHONEPE", status: "PENDING", providerRef: { not: null }, createdAt: { lt: new Date(now - 3 * 60_000), gt: new Date(now - 2 * 86_400_000) } },
    select: { providerRef: true },
    take: 50,
  });
  for (const payment of open) await settlePayment(payment.providerRef!).catch((error) => console.error("[housekeeping] payment check failed", error));

  // online orders nobody paid for: release the stock they are holding
  const unpaid = await prisma.order.findMany({
    where: {
      paymentMethod: "ONLINE", paymentStatus: { in: ["PENDING", "FAILED"] }, status: "PENDING",
      placedAt: { lt: new Date(now - UNPAID_ORDER_MINUTES * 60_000) },
      payments: { some: { provider: "PHONEPE" }, none: { status: { in: ["PENDING", "SUCCESS"] } } },
    },
    select: { id: true },
    take: 50,
  });
  for (const order of unpaid) {
    const cancelled = await prisma.$transaction((tx) => cancelOrderAndRestock(tx, order.id, `Not paid within ${UNPAID_ORDER_MINUTES} minutes`)).catch((error) => {
      console.error("[housekeeping] could not cancel order", order.id, error);
      return false;
    });
    if (cancelled) orderCancelled(order.id);
  }
  if (open.length || unpaid.length) console.log(`[housekeeping] checked ${open.length} open payments, cancelled ${unpaid.length} unpaid orders`);
};

const remindAppointments = async () => {
  const now = Date.now();
  const soon = await prisma.appointment.findMany({
    where: { status: "CONFIRMED", scheduledAt: { gt: new Date(now), lte: new Date(now + 20 * 60_000) } },
    select: { id: true },
  });
  for (const appointment of soon) {
    const already = await prisma.notification.count({ where: { event: "appointment.reminder", relatedType: "Appointment", relatedId: appointment.id } });
    if (already === 0) await appointmentReminder(appointment.id);
  }
};

const dailyStockAlert = async () => {
  const [today, hour] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date())
    .reduce<[string, number]>((acc, part) => (part.type === "hour" ? [acc[0], Number(part.value)] : ["year", "month", "day"].includes(part.type) ? [acc[0] ? `${acc[0]}-${part.value}` : part.value, acc[1]] : acc), ["", 0]);
  if (hour < 9) return;
  const sent = await prisma.setting.findUnique({ where: { key: "notifications.lowStockSentOn" } });
  if (sent?.value === today) return;
  await prisma.setting.upsert({ where: { key: "notifications.lowStockSentOn" }, update: { value: today }, create: { key: "notifications.lowStockSentOn", value: today } });

  const variants = await prisma.productVariant.findMany({
    where: { isActive: true, product: { status: "ACTIVE" } },
    select: { title: true, stockQuantity: true, lowStockThreshold: true, product: { select: { name: true } } },
  });
  const out = variants.filter((v) => v.stockQuantity <= 0);
  const low = variants.filter((v) => v.stockQuantity > 0 && v.stockQuantity <= v.lowStockThreshold);
  if (out.length + low.length === 0) return;
  const line = (v: (typeof variants)[number]) => `• ${v.product.name} (${v.title}): ${v.stockQuantity <= 0 ? "none left" : `${v.stockQuantity} left`}`;
  const list = [...out.slice(0, 15).map(line), ...low.slice(0, 15).map(line), out.length + low.length > 30 ? `…and ${out.length + low.length - 30} more` : ""].filter(Boolean).join("\n");
  await notifyStaff("staff.low_stock", { outCount: out.length, lowCount: low.length, list, link: siteLink("/admin/inventory") });
};

/** The India date and hour right now. */
const indiaNow = () => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return { day: `${part("year")}-${part("month")}-${part("day")}`, hour: Number(part("hour")) };
};

/** Once a day, in the morning: payouts on the payout day, and promotions. */
const dailyDoctorJobs = async () => {
  const { day, hour } = indiaNow();
  if (hour < 9) return;
  await runScheduledPayouts(); // keeps its own note of the day it last ran
  const last = await prisma.setting.findUnique({ where: { key: "levels.lastRun" } });
  if (last?.value === day) return;
  await prisma.setting.upsert({ where: { key: "levels.lastRun" }, update: { value: day }, create: { key: "levels.lastRun", value: day } });
  const promoted = await runPromotions();
  if (promoted.length) console.log(`[housekeeping] ${promoted.length} doctor(s) moved up a level`);
};

/** Orders that should have an invoice and do not (the business details were missing, or the server was down). */
const catchUpInvoices = async () => {
  const seller = await sellerDetails();
  const waiting = await prisma.order.findMany({
    where: {
      invoiceNumber: null, legacyId: null, placedAt: { gt: new Date(Date.now() - 60 * 86_400_000) },
      status: { in: seller.issueOn === "placed" ? ["CONFIRMED", "PROCESSING", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"] : ["PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"] },
    },
    select: { id: true }, take: 50,
  });
  let made = 0;
  for (const order of waiting) if (await issueInvoice(order.id).catch(() => null)) made++;
  if (made) console.log(`[housekeeping] made ${made} missed invoice(s)`);
};

const lastShipTry = new Map<number, number>(); // order → when we last tried to send it, so a refused order is retried hourly, not every round

/** Confirmed orders that never reached the courier (it was unreachable, or shipping was switched to automatic later). */
const catchUpShipping = async () => {
  if (!courierReady || (await shippingSettings()).mode !== "auto") return;
  const waiting = await prisma.order.findMany({
    where: {
      status: "CONFIRMED", legacyId: null, placedAt: { gt: new Date(Date.now() - 7 * 86_400_000) },
      shipments: { none: { status: { not: "CANCELLED" } } },
      NOT: { paymentMethod: "ONLINE", paymentStatus: { not: "PAID" } },
    },
    select: { id: true, orderNumber: true }, take: 25,
  });
  for (const order of waiting) {
    const tried = lastShipTry.get(order.id);
    if (tried && Date.now() - tried < 60 * 60_000) continue;
    lastShipTry.set(order.id, Date.now());
    await shipOrder(order.id).catch(async (error) => {
      const reason = error instanceof Error ? error.message : "Could not send the order to the courier";
      console.error("[housekeeping] shipping", order.orderNumber, reason);
      if (!tried) await notifyStaff("staff.shipping_problem", { orderNumber: order.orderNumber, reason, link: siteLink(`/admin/orders?q=${order.orderNumber}`) }, { type: "Order", id: order.id });
    });
  }
};

const sweep = async () => {
  await paymentsSweep().catch((error) => console.error("[housekeeping] payments", error));
  await checkPendingRefunds().catch((error) => console.error("[housekeeping] refunds", error));
  await remindAppointments().catch((error) => console.error("[housekeeping] reminders", error));
  await closeStaleAppointments().catch((error) => console.error("[housekeeping] stale consultations", error));
  await dailyDoctorJobs().catch((error) => console.error("[housekeeping] doctor jobs", error));
  await retryFailed().catch((error) => console.error("[housekeeping] retries", error));
  await dailyStockAlert().catch((error) => console.error("[housekeeping] stock alert", error));
  await sendDueReports().then((sent) => { if (sent.length) console.log(`[housekeeping] sent the ${sent.join(" and ")} report`); }).catch((error) => console.error("[housekeeping] report emails", error));
  await catchUpInvoices().catch((error) => console.error("[housekeeping] invoices", error));
  await sweepLooseFiles().catch((error) => console.error("[housekeeping] consultation files", error));
  await catchUpShipping().catch((error) => console.error("[housekeeping] shipping", error));
  await refreshActiveShipments().catch((error) => console.error("[housekeeping] tracking", error));
  await refreshReturnPickups().catch((error) => console.error("[housekeeping] return pickups", error));
};

export const startHousekeeping = () => {
  // any message kind added in a new version gets its starting wording
  ensureTemplates().catch((error) => console.error("[housekeeping] templates", error));
  ensureStaffRoles().catch((error) => console.error("[housekeeping] staff roles", error));
  const run = () => sweep().catch((error) => console.error("[housekeeping]", error));
  setTimeout(run, 30_000); // shortly after the server starts
  setInterval(run, EVERY_MINUTES * 60_000).unref();
};
