import { appointmentConfirmed } from "./events";
import { randomBytes } from "node:crypto";
import { env } from "../config/env";
import type { Prisma } from "../generated/prisma/client";
import { HttpError, num } from "./http";
import { prisma } from "./prisma";

// Shared pieces of the consultation flow: numbering, paying for an appointment, the call link.

const dayStamp = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()).replace(/-/g, "").slice(2);

export const newAppointmentNumber = async () => {
  for (;;) {
    const appointmentNumber = `APT${dayStamp()}-${Math.floor(1000 + Math.random() * 9000)}`;
    if (!(await prisma.appointment.findUnique({ where: { appointmentNumber }, select: { id: true } }))) return appointmentNumber;
  }
};

export const newPrescriptionNumber = async () => {
  for (;;) {
    const prescriptionNumber = `RX${dayStamp()}-${Math.floor(1000 + Math.random() * 9000)}`;
    if (!(await prisma.prescription.findUnique({ where: { prescriptionNumber }, select: { id: true } }))) return prescriptionNumber;
  }
};

export const newOrderNumber = async () => {
  for (;;) {
    const orderNumber = `DH${dayStamp()}-${Math.floor(10000 + Math.random() * 90000)}`;
    if (!(await prisma.order.findUnique({ where: { orderNumber }, select: { id: true } }))) return orderNumber;
  }
};

/** A private video room for one appointment. Jitsi Meet rooms need no account; the name is unguessable. */
const meetingLink = (appointmentNumber: string) => `https://meet.jit.si/dochomoeo-${appointmentNumber.toLowerCase()}-${randomBytes(6).toString("hex")}`;

/** Confirms an appointment whose fee has been paid: works out the doctor's share and makes the call link. */
export const confirmPaidAppointment = async (tx: Prisma.TransactionClient, appointmentId: number) => {
  const appointment = await tx.appointment.findUnique({ where: { id: appointmentId }, include: { doctor: { select: { commissionPercent: true } } } });
  if (!appointment) return;
  // The hold on an unpaid slot is dropped after 15 minutes. If the money arrives after that, the slot
  // is given back when nobody else has taken it; otherwise the appointment stays cancelled with a refund due.
  const releasedUnpaid = appointment.status === "CANCELLED" && appointment.cancelledBy === "SYSTEM";
  if (releasedUnpaid) {
    const end = new Date(appointment.scheduledAt.getTime() + appointment.durationMinutes * 60_000);
    const taken = await tx.appointment.count({
      where: { doctorId: appointment.doctorId, id: { not: appointment.id }, status: { notIn: ["CANCELLED", "NO_SHOW"] }, scheduledAt: { lt: end, gt: new Date(appointment.scheduledAt.getTime() - appointment.durationMinutes * 60_000) } }, // another booking overlapping this slot
    });
    if (taken > 0 || appointment.scheduledAt < new Date()) {
      await tx.appointment.update({ where: { id: appointmentId }, data: { cancelReason: "Paid after the slot was released. A refund is due." } });
      return;
    }
  } else if (appointment.status !== "PENDING_PAYMENT") return; // already confirmed, or cancelled by someone
  const fee = num(appointment.fee);
  const doctorEarning = Math.round(fee * (1 - num(appointment.doctor.commissionPercent) / 100) * 100) / 100;
  await tx.appointment.update({
    where: { id: appointmentId },
    data: { status: "CONFIRMED", cancelledBy: null, cancelReason: null, doctorEarning, meetingUrl: appointment.mode === "IN_CLINIC" ? null : meetingLink(appointment.appointmentNumber) },
  });
};

/**
 * Test mode only (no payment gateway keys, PAYMENTS_TEST_MODE=true):
 * records a test payment without taking money and confirms the appointment.
 */
export const payForAppointment = async (appointmentId: number, userId: number) => {
  if (!env.PAYMENTS_TEST_MODE) throw new HttpError(501, "Online payment is not connected yet");

  const appointment = await prisma.appointment.findFirst({ where: { id: appointmentId, patientId: userId } });
  if (!appointment) throw new HttpError(404, "Appointment not found");
  if (appointment.status !== "PENDING_PAYMENT") throw new HttpError(400, "This appointment is already paid for or cancelled");
  if (appointment.scheduledAt < new Date()) throw new HttpError(400, "This slot has passed. Book another one.");

  await prisma.$transaction(async (tx) => {
    await tx.payment.create({
      data: { appointmentId, userId, provider: "TEST", method: "TEST", providerRef: `test_${randomBytes(8).toString("hex")}`, amount: appointment.fee, status: "SUCCESS", paidAt: new Date() },
    });
    await confirmPaidAppointment(tx, appointmentId);
  });
  appointmentConfirmed(appointmentId);
};
