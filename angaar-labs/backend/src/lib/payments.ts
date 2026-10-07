import { randomBytes } from "node:crypto";
import { env } from "../config/env";
import { confirmPaidAppointment } from "./consult";
import * as events from "./events";
import { HttpError, num } from "./http";
import { createPayPage, fetchStatus, gatewayReady } from "./phonepe";
import { prisma } from "./prisma";

// Online payments for orders and consultation fees.
//   gateway  PhonePe keys are filled in: the customer pays on PhonePe's page
//   test     no keys, PAYMENTS_TEST_MODE=true: a test payment is recorded and no money moves
//   off      neither: paying online is not offered
export const paymentsMode = (): "gateway" | "test" | "off" => (gatewayReady ? "gateway" : env.PAYMENTS_TEST_MODE ? "test" : "off");

type Target = { orderId: number } | { appointmentId: number };

/**
 * Opens a payment and returns the address of the pay page.
 * `returnTo` is the page of ours the customer comes back to; the result is added as ?payment=…
 */
export const startPayment = async (input: { userId: number; amount: number; phone?: string | null; returnTo: string } & Target) => {
  if (!gatewayReady) throw new HttpError(501, "Online payment is not connected yet");
  if (input.amount <= 0) throw new HttpError(400, "There is nothing to pay");

  const payment = await prisma.payment.create({
    data: {
      userId: input.userId, provider: "PHONEPE", amount: input.amount, status: "CREATED",
      orderId: "orderId" in input ? input.orderId : null, appointmentId: "appointmentId" in input ? input.appointmentId : null,
      rawResponse: { returnTo: input.returnTo },
    },
  });
  // our own reference for this payment; PhonePe echoes it back
  const transactionId = `DH${payment.id}T${randomBytes(5).toString("hex")}`;
  await prisma.payment.update({ where: { id: payment.id }, data: { providerRef: transactionId } });

  try {
    const url = await createPayPage({
      transactionId, userId: input.userId, amount: input.amount, phone: input.phone,
      // the browser comes back through the website, which passes /api on to this server
      redirectUrl: `${env.FRONTEND_URL}/api/pay/return/${transactionId}`,
      callbackUrl: env.PUBLIC_API_URL ? `${env.PUBLIC_API_URL}/api/pay/callback` : undefined,
    });
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "PENDING" } });
    return { payUrl: url, transactionId };
  } catch (error) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
    console.error("[payments]", error);
    throw new HttpError(502, "The payment page could not be opened just now. Please try again in a minute.");
  }
};

/**
 * Asks the gateway what happened to a payment and records it. Safe to call any number of times:
 * the browser coming back, PhonePe's own message and a later re-check may all arrive for the same payment.
 */
export const settlePayment = async (transactionId: string) => {
  const payment = await prisma.payment.findFirst({ where: { providerRef: transactionId, provider: "PHONEPE" } });
  if (!payment) return null;
  const returnTo = ((payment.rawResponse as { returnTo?: string } | null)?.returnTo ?? "/").replace(/^(?!\/)/, "/");
  if (payment.status === "SUCCESS") return { state: "SUCCESS" as const, returnTo };

  const status = await fetchStatus(transactionId);
  // paid, but not the amount we asked for: never treated as paid
  const paid = status.state === "SUCCESS" && status.amount !== null && Math.abs(status.amount - num(payment.amount)) < 0.01;
  const state = status.state === "SUCCESS" && !paid ? ("FAILED" as const) : status.state;
  if (state === "PENDING") return { state, returnTo };

  let told = false;
  await prisma.$transaction(async (tx) => {
    // only the first caller to get here does the work
    const claimed = await tx.payment.updateMany({
      where: { id: payment.id, status: { notIn: ["SUCCESS"] } },
      data: {
        status: state, method: status.method, paidAt: state === "SUCCESS" ? new Date() : null,
        rawResponse: { returnTo, gateway: status.raw as object, gatewayReference: status.reference },
      },
    });
    if (claimed.count === 0) return;

    if (payment.orderId) {
      const order = await tx.order.findUnique({ where: { id: payment.orderId }, select: { status: true, paymentStatus: true } });
      if (order && order.paymentStatus !== "PAID") {
        // the money has arrived: an order that was only waiting for it is confirmed without anyone having to look
        const confirm = state === "SUCCESS" && order.status === "PENDING";
        await tx.order.update({
          where: { id: payment.orderId },
          data: { paymentStatus: state === "SUCCESS" ? "PAID" : "FAILED", ...(confirm ? { status: "CONFIRMED", confirmedAt: new Date() } : {}) },
        });
        await tx.orderStatusHistory.create({
          data: { orderId: payment.orderId, status: confirm ? "CONFIRMED" : order.status, note: state === "SUCCESS" ? `Paid online (PhonePe ${status.reference ?? transactionId})` : "Online payment did not go through" },
        });
      }
    }
    if (payment.appointmentId && state === "SUCCESS") await confirmPaidAppointment(tx, payment.appointmentId);
    told = true;
  });
  // only the caller that recorded the result tells people about it
  if (told && state === "SUCCESS") {
    if (payment.orderId) events.orderPaid(payment.orderId);
    if (payment.appointmentId) events.appointmentConfirmed(payment.appointmentId);
  }
  return { state, returnTo };
};
