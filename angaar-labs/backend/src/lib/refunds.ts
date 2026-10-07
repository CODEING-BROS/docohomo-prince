import { randomBytes } from "node:crypto";
import { env } from "../config/env";
import { HttpError, num } from "./http";
import { money, notify, notifyStaff, siteLink } from "./notifications";
import { fetchStatus, gatewayReady, requestRefund } from "./phonepe";
import { prisma } from "./prisma";

// Sending money back to a customer who paid online.
//
// A refund is due when something that was paid for is cancelled: an order before it leaves, or a
// consultation that will not happen. With "automatic refunds" switched on (Admin → Refunds) the
// system sends the money back by itself, straight away. Switched off, staff are told a refund is
// due and send it with one button. Either way the refund goes back through PhonePe to wherever
// the customer paid from, never to a different account, and never more than they paid.

const KEY = "refunds";
export type RefundSettings = { automatic: boolean };
export const refundSettings = async (): Promise<RefundSettings> => {
  const saved = await prisma.setting.findUnique({ where: { key: KEY } });
  // off to begin with: money leaving the account by itself is something the owner switches on knowingly
  return { automatic: false, ...((saved?.value ?? {}) as Partial<RefundSettings>) };
};
export const saveRefundSettings = async (value: RefundSettings) => {
  await prisma.setting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } });
  return value;
};

type Target = { orderId: number } | { appointmentId: number };
const round = (value: number) => Math.round(value * 100) / 100;

/** The online payment behind an order or consultation, and how much of it can still be sent back. */
const paymentFor = async (target: Target) => {
  // only the order or consultation itself: callers pass in more than that
  const which = "orderId" in target ? { orderId: target.orderId } : { appointmentId: target.appointmentId };
  const payment = await prisma.payment.findFirst({
    where: { ...which, status: { in: ["SUCCESS", "REFUNDED"] }, provider: { in: ["PHONEPE", "TEST"] } },
    orderBy: { id: "desc" },
    include: { refunds: { where: { status: { in: ["PENDING", "SUCCESS"] } }, select: { amount: true } } },
  });
  if (!payment) return null;
  const held = payment.refunds.reduce((sum, r) => sum + num(r.amount), 0); // sent back already, or on its way
  return { payment, left: round(num(payment.amount) - held) };
};

/** Records that a refund reached the customer's side, and tells them. Runs once per refund. */
const complete = async (refundId: number, raw?: unknown) => {
  const done = await prisma.$transaction(async (tx) => {
    const claimed = await tx.refund.updateMany({ where: { id: refundId, status: "PENDING" }, data: { status: "SUCCESS", completedAt: new Date(), error: null, ...(raw ? { rawResponse: raw as object } : {}) } });
    if (claimed.count === 0) return null;
    const refund = await tx.refund.findUniqueOrThrow({ where: { id: refundId } });
    const payment = await tx.payment.update({ where: { id: refund.paymentId }, data: { refundedAmount: { increment: refund.amount } } });
    const fully = num(payment.refundedAmount) >= num(payment.amount) - 0.005;
    if (fully) await tx.payment.update({ where: { id: payment.id }, data: { status: "REFUNDED" } });
    await tx.returnRequest.updateMany({ where: { refundId: refund.id, status: "RECEIVED" }, data: { status: "REFUNDED", refundedAt: new Date() } });
    if (refund.orderId) {
      const order = await tx.order.findUnique({ where: { id: refund.orderId }, select: { status: true } });
      if (fully) await tx.order.update({ where: { id: refund.orderId }, data: { paymentStatus: "REFUNDED" } });
      if (order) await tx.orderStatusHistory.create({ data: { orderId: refund.orderId, status: order.status, note: `${money(refund.amount)} refunded${refund.automatic ? " automatically" : ""}`, changedById: refund.requestedById } });
    }
    return refund;
  });
  if (!done) return;

  // tell the customer where their money is
  const order = done.orderId ? await prisma.order.findUnique({ where: { id: done.orderId }, select: { orderNumber: true, userId: true, customerName: true, customerEmail: true, customerPhone: true, channel: true } }) : null;
  const appointment = done.appointmentId
    ? await prisma.appointment.findUnique({ where: { id: done.appointmentId }, select: { appointmentNumber: true, patientName: true, patientPhone: true, patient: { select: { id: true, email: true, phone: true } } } })
    : null;
  const to = order
    ? { userId: order.userId, name: order.customerName, email: order.customerEmail, phone: order.customerPhone }
    : appointment ? { userId: appointment.patient.id, name: appointment.patientName, email: appointment.patient.email, phone: appointment.patientPhone ?? appointment.patient.phone } : null;
  if (to) {
    await notify("refund.sent", to, {
      amount: money(done.amount), what: order ? "order" : "consultation", number: order?.orderNumber ?? appointment?.appointmentNumber ?? "",
      link: siteLink(order ? `${order.channel === "B2B" ? "/doctor" : "/patient"}/orders/${done.orderId}` : "/patient/consultations"),
    }, { type: order ? "Order" : "Appointment", id: (done.orderId ?? done.appointmentId)! });
  }
};

const fail = (refundId: number, reason: string, raw?: unknown) =>
  prisma.refund.updateMany({ where: { id: refundId, status: "PENDING" }, data: { status: "FAILED", error: reason.slice(0, 500), completedAt: new Date(), ...(raw ? { rawResponse: raw as object } : {}) } });

/**
 * Sends money back for an order or a consultation. Without an amount, everything that is left.
 * Throws a plain message when there is nothing to refund or the amount is too much.
 */
export const startRefund = async (input: Target & { amount?: number; reason: string; byUserId?: number; automatic?: boolean }) => {
  const found = await paymentFor(input);
  if (!found) throw new HttpError(400, "There is no online payment to refund here");
  const { payment, left } = found;
  if (payment.provider === "PHONEPE" && !/^DH[0-9]+T/.test(payment.providerRef ?? "")) {
    throw new HttpError(400, "This payment was taken by the old website. Refund it from the PhonePe dashboard.");
  }
  if (left <= 0) throw new HttpError(400, "This payment has already been refunded in full");
  const amount = round(input.amount ?? left);
  if (amount <= 0) throw new HttpError(400, "Enter an amount above zero");
  if (amount > left + 0.005) throw new HttpError(400, `Only ${money(left)} of this payment is left to refund`);

  const refund = await prisma.refund.create({
    data: {
      paymentId: payment.id, orderId: payment.orderId, appointmentId: payment.appointmentId, amount, reason: input.reason.slice(0, 300),
      automatic: input.automatic ?? false, requestedById: input.byUserId ?? null,
    },
  });
  const reference = `DHR${refund.id}T${randomBytes(5).toString("hex")}`;
  await prisma.refund.update({ where: { id: refund.id }, data: { providerRef: reference } });

  if (payment.provider === "TEST") {
    await complete(refund.id); // a pretend payment: nothing to send anywhere
  } else if (!gatewayReady || !payment.providerRef) {
    await fail(refund.id, "The payment gateway is not connected");
  } else {
    try {
      const result = await requestRefund({
        refundId: reference, paymentTransactionId: payment.providerRef, userId: payment.userId, amount,
        callbackUrl: env.PUBLIC_API_URL ? `${env.PUBLIC_API_URL}/api/pay/callback` : undefined,
      });
      if (result.state === "SUCCESS") await complete(refund.id, result.raw);
      else if (result.state === "FAILED") await fail(refund.id, `PhonePe did not accept the refund: ${(result.raw as { message?: string; code?: string } | null)?.message ?? (result.raw as { code?: string } | null)?.code ?? "no reason given"}`, result.raw);
      else await prisma.refund.update({ where: { id: refund.id }, data: { rawResponse: result.raw as object } }); // on its way; checked again shortly
    } catch (error) {
      // we do not know whether PhonePe got the request: leave it waiting and ask PhonePe again later
      console.error("[refunds]", refund.id, error instanceof Error ? error.message : error);
    }
  }
  return prisma.refund.findUniqueOrThrow({ where: { id: refund.id } });
};

/** Asks PhonePe what happened to one refund that is still on its way. */
const checkOne = async (refund: { id: number; providerRef: string | null; createdAt: Date }) => {
  if (!refund.providerRef) return;
  const status = await fetchStatus(refund.providerRef);
  const code = (status.raw as { code?: string } | null)?.code ?? "";
  if (status.state === "SUCCESS") await complete(refund.id, status.raw);
  // PhonePe may take a moment to know about a refund it has only just been asked for
  else if (code === "TRANSACTION_NOT_FOUND") { if (refund.createdAt < new Date(Date.now() - 30 * 60_000)) await fail(refund.id, "PhonePe has no record of this refund. Try it again.", status.raw); }
  else if (status.state === "FAILED") await fail(refund.id, `PhonePe could not make the refund (${code || "no reason given"})`, status.raw);
};

/** Every few minutes: refunds still on their way are checked. */
export const checkPendingRefunds = async () => {
  if (!gatewayReady) return 0;
  const waiting = await prisma.refund.findMany({ where: { status: "PENDING", providerRef: { not: null }, createdAt: { lt: new Date(Date.now() - 2 * 60_000) } }, take: 30 });
  for (const refund of waiting) await checkOne(refund).catch((error) => console.error("[refunds] check", refund.id, error instanceof Error ? error.message : error));
  return waiting.length;
};

/** PhonePe wrote to say something happened to this refund: look it up straight away. */
export const checkRefund = async (reference: string) => {
  const refund = await prisma.refund.findFirst({ where: { providerRef: reference, status: "PENDING" } });
  if (refund && gatewayReady) await checkOne(refund);
};

/**
 * Something paid for online was cancelled. Sends the money back when refunds are automatic;
 * otherwise (or when that fails) tells staff a refund is due. Never throws.
 */
export const refundAfterCancel = async (target: Target, reason: string) => {
  try {
    const found = await paymentFor(target);
    if (!found || found.left <= 0) return;
    const settings = await refundSettings();
    let problem: string | null = null;
    if (settings.automatic) {
      const refund = await startRefund({ ...target, reason, automatic: true }).catch((error) => { problem = error instanceof Error ? error.message : "The refund could not be started"; return null; });
      if (refund && refund.status !== "FAILED") return; // sent, or on its way
      problem ??= refund?.error ?? "The refund did not go through";
    }
    const order = "orderId" in target ? await prisma.order.findUnique({ where: { id: target.orderId }, select: { orderNumber: true, customerName: true } }) : null;
    const appointment = "appointmentId" in target ? await prisma.appointment.findUnique({ where: { id: target.appointmentId }, select: { appointmentNumber: true, patientName: true } }) : null;
    await notifyStaff("staff.refund_due", {
      what: order ? "order" : "consultation", number: order?.orderNumber ?? appointment?.appointmentNumber ?? "",
      customer: order?.customerName ?? appointment?.patientName ?? "", amount: money(found.left),
      link: siteLink("/admin/refunds"), note: problem ? `The automatic refund did not work: ${problem}` : "",
    }, { type: order ? "Order" : "Appointment", id: "orderId" in target ? target.orderId : target.appointmentId });
  } catch (error) {
    console.error("[refunds] after cancel", error);
  }
};

/** Everything cancelled that still has money to give back. */
export const refundsDue = async () => {
  const payments = await prisma.payment.findMany({
    where: {
      status: "SUCCESS",
      // only payments this system took: ones carried over from the old website were settled long ago
      OR: [{ provider: "TEST" }, { provider: "PHONEPE", providerRef: { startsWith: "DH" } }],
      AND: [{ OR: [{ order: { status: { in: ["CANCELLED", "RETURNED"] }, legacyId: null, returns: { none: {} } } }, { appointment: { status: "CANCELLED" } }] }],
    },
    orderBy: { id: "desc" }, take: 200,
    include: {
      refunds: { select: { amount: true, status: true, error: true, createdAt: true }, orderBy: { id: "desc" } },
      order: { select: { id: true, orderNumber: true, customerName: true, cancelledAt: true, cancelReason: true } },
      appointment: { select: { id: true, appointmentNumber: true, patientName: true, updatedAt: true, cancelReason: true } },
    },
  });
  return payments
    .map((p) => {
      const held = p.refunds.filter((r) => r.status !== "FAILED").reduce((sum, r) => sum + num(r.amount), 0);
      return {
        paymentId: p.id, kind: p.order ? ("order" as const) : ("consultation" as const), targetId: p.order?.id ?? p.appointment?.id ?? 0,
        number: p.order?.orderNumber ?? p.appointment?.appointmentNumber ?? "", customer: p.order?.customerName ?? p.appointment?.patientName ?? "",
        paid: num(p.amount), left: round(num(p.amount) - held), cancelledAt: p.order?.cancelledAt ?? p.appointment?.updatedAt ?? null,
        reason: p.order?.cancelReason ?? p.appointment?.cancelReason ?? null, testPayment: p.provider === "TEST",
        lastProblem: p.refunds[0]?.status === "FAILED" ? p.refunds[0].error : null,
      };
    })
    .filter((row) => row.left > 0 && row.targetId);
};
