import { refundAfterCancel } from "./refunds";
import { autoInvoice, invoicePdf } from "./invoice";
import { num } from "./http";
import { money, notify, notifyStaff, notifyUser, siteLink, when } from "./notifications";
import { prisma } from "./prisma";
import { autoShip, cancelShipments } from "./shipping";

// What happens after something important changes: the right people are told.
// Every function here is called after the change is saved, never throws, and is not waited for.

const PAYMENT = { COD: "pay on delivery", ONLINE: "paid online", CREDIT: "on credit", BANK_TRANSFER: "bank transfer" } as Record<string, string>;
const MODE = { VIDEO: "Video call", AUDIO: "Phone call", CHAT: "Chat", IN_CLINIC: "At the clinic" } as Record<string, string>;
const titleCase = (value: string) => value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
const safely = (task: () => Promise<unknown>) => { void task().catch((error) => console.error("[events]", error)); };

const loadOrder = (id: number) =>
  prisma.order.findUnique({
    where: { id },
    include: { items: { select: { productName: true, variantTitle: true, quantity: true } }, shipments: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
type LoadedOrder = NonNullable<Awaited<ReturnType<typeof loadOrder>>>;

const orderValues = (order: LoadedOrder) => ({
  orderNumber: order.orderNumber,
  total: money(order.grandTotal),
  paymentMethod: PAYMENT[order.paymentMethod] ?? order.paymentMethod,
  items: order.items.map((item) => `• ${titleCase(item.productName)}${item.variantTitle ? ` (${item.variantTitle})` : ""} × ${item.quantity}`).join("\n"),
  address: [order.shippingAddress, order.shippingCity, order.shippingState, order.shippingPincode].filter(Boolean).join(", "),
  // a doctor's wholesale order lives in their dashboard
  link: siteLink(`${order.channel === "B2B" ? "/doctor" : "/patient"}/orders/${order.id}`),
});
const buyer = (order: LoadedOrder) => ({ userId: order.userId, name: order.customerName, email: order.customerEmail, phone: order.customerPhone });

/** A new order that does not wait for an online payment (pay on delivery, credit, or placed by staff). */
export const orderPlaced = (orderId: number, { tellStaff = true } = {}) =>
  safely(async () => {
    const order = await loadOrder(orderId);
    if (!order) return;
    await notify("order.placed", buyer(order), orderValues(order), { type: "Order", id: order.id });
    if (tellStaff) await staffNewOrder(order);
    await autoInvoice(order.id, "placed");
    await autoShip(order.id);
  });

/** The online payment for an order arrived. For the shop this is when the order really starts. */
export const orderPaid = (orderId: number) =>
  safely(async () => {
    const order = await loadOrder(orderId);
    if (!order) return;
    await notify("order.paid", buyer(order), orderValues(order), { type: "Order", id: order.id });
    await staffNewOrder(order);
    await autoInvoice(order.id, "placed");
    await autoShip(order.id);
  });

const staffNewOrder = (order: LoadedOrder) =>
  notifyStaff("staff.order_placed", {
    ...orderValues(order), customer: order.billingName ?? order.customerName ?? "", kind: order.channel === "B2B" ? "wholesale" : "retail",
    link: siteLink(`/admin/orders?q=${order.orderNumber}`),
  }, { type: "Order", id: order.id });

export const orderShipped = (orderId: number) =>
  safely(async () => {
    await autoInvoice(orderId, "dispatch"); // everything that leaves the warehouse has an invoice
    const order = await loadOrder(orderId);
    if (!order) return;
    const shipment = order.shipments[0];
    const invoice = order.invoiceNumber ? await invoicePdf(order.id).catch(() => null) : null;
    await notify("order.shipped", buyer(order), {
      ...orderValues(order), courier: shipment?.carrier ?? "our courier partner", trackingNumber: shipment?.trackingNumber ?? "will be shared shortly",
      trackingLink: shipment?.trackingUrl ?? siteLink(`${order.channel === "B2B" ? "/doctor" : "/patient"}/orders/${order.id}`),
    }, { type: "Order", id: order.id }, invoice ? { attachments: [{ filename: `Invoice-${invoice.number.replace(/\//g, "-")}.pdf`, content: invoice.pdf }] } : {});
  });

export const orderDelivered = (orderId: number) =>
  safely(async () => {
    const order = await loadOrder(orderId);
    if (order) await notify("order.delivered", buyer(order), orderValues(order), { type: "Order", id: order.id });
  });

export const orderCancelled = (orderId: number) =>
  safely(async () => {
    await cancelShipments(orderId); // a parcel not yet picked up is taken back
    const order = await loadOrder(orderId);
    if (!order) return;
    const paid = order.paymentStatus === "PAID";
    await notify("order.cancelled", buyer(order), {
      ...orderValues(order), reason: order.cancelReason ?? "Cancelled",
      refundNote: paid ? `The ${money(order.grandTotal)} you paid will be refunded to your original payment method within 5 to 7 working days.` : "No money was taken for this order.",
    }, { type: "Order", id: order.id });
    if (paid) await refundAfterCancel({ orderId: order.id }, order.cancelReason ?? "Order cancelled");
  });

const loadAppointment = (id: number) =>
  prisma.appointment.findUnique({
    where: { id },
    include: { doctor: { select: { displayName: true, userId: true } }, patient: { select: { id: true, email: true, phone: true, firstName: true, lastName: true } } },
  });

/** A consultation is paid for: the patient gets the details, the doctor hears about the new booking. */
export const appointmentConfirmed = (appointmentId: number) =>
  safely(async () => {
    const a = await loadAppointment(appointmentId);
    if (!a || a.status !== "CONFIRMED") return;
    const related = { type: "Appointment", id: a.id };
    await notify("appointment.booked", { userId: a.patient.id, name: a.patientName, email: a.patient.email, phone: a.patientPhone ?? a.patient.phone }, {
      doctor: a.doctor.displayName, when: when(a.scheduledAt), mode: MODE[a.mode] ?? a.mode, appointmentNumber: a.appointmentNumber,
      callLink: a.meetingUrl ?? siteLink("/patient/consultations"), fee: money(a.fee),
    }, related);
    await notifyUser("appointment.new", a.doctor.userId, {
      patient: a.patientName, when: when(a.scheduledAt), mode: MODE[a.mode] ?? a.mode, appointmentNumber: a.appointmentNumber,
      problem: a.symptoms ?? "Not given", link: siteLink("/doctor/appointments"),
    }, related);
  });

export const appointmentCancelled = (appointmentId: number, { refundDue }: { refundDue: boolean }) =>
  safely(async () => {
    const a = await loadAppointment(appointmentId);
    if (!a) return;
    const related = { type: "Appointment", id: a.id };
    const base = { when: when(a.scheduledAt), appointmentNumber: a.appointmentNumber };
    await notify("appointment.cancelled", { userId: a.patient.id, name: a.patientName, email: a.patient.email, phone: a.patientPhone ?? a.patient.phone }, {
      ...base, with: a.doctor.displayName, refundNote: refundDue ? `The fee of ${money(a.fee)} will be refunded within 5 to 7 working days.` : "",
    }, related);
    await notifyUser("appointment.cancelled", a.doctor.userId, { ...base, with: a.patientName, refundNote: "The slot is free again for other patients." }, related);
    if (refundDue) await refundAfterCancel({ appointmentId: a.id }, a.cancelReason ?? "Consultation cancelled");
  });

/** The doctor never started the call. The patient is refunded; the doctor and staff are told. */
export const appointmentMissed = (appointmentId: number) =>
  safely(async () => {
    const a = await loadAppointment(appointmentId);
    if (!a) return;
    const related = { type: "Appointment", id: a.id };
    const paidFor = await prisma.payment.count({ where: { appointmentId: a.id, status: "SUCCESS" } });
    await notify("appointment.cancelled", { userId: a.patient.id, name: a.patientName, email: a.patient.email, phone: a.patientPhone ?? a.patient.phone }, {
      when: when(a.scheduledAt), appointmentNumber: a.appointmentNumber, with: a.doctor.displayName,
      refundNote: `We are sorry: the doctor could not join.${paidFor ? ` The fee of ${money(a.fee)} will be refunded within 5 to 7 working days.` : ""} You can book another slot any time.`,
    }, related);
    await notifyUser("appointment.missed", a.doctor.userId, { patient: a.patientName, when: when(a.scheduledAt), appointmentNumber: a.appointmentNumber, link: siteLink("/doctor/schedule") }, related);
    if (paidFor) await refundAfterCancel({ appointmentId: a.id }, "The doctor did not start the call");
  });

/** About 15 minutes before a consultation: both sides get the call link. Sent once. */
export const appointmentReminder = async (appointmentId: number) => {
  const a = await loadAppointment(appointmentId);
  if (!a) return;
  const related = { type: "Appointment", id: a.id };
  const base = { when: when(a.scheduledAt), mode: MODE[a.mode] ?? a.mode, callLink: a.meetingUrl ?? "" };
  await notify("appointment.reminder", { userId: a.patient.id, name: a.patientName, email: a.patient.email, phone: a.patientPhone ?? a.patient.phone }, { ...base, with: a.doctor.displayName }, related);
  await notifyUser("appointment.reminder", a.doctor.userId, { ...base, with: a.patientName }, related);
};

export const prescriptionIssued = (prescriptionId: number) =>
  safely(async () => {
    const p = await prisma.prescription.findUnique({ where: { id: prescriptionId }, include: { doctor: { select: { displayName: true } } } });
    if (!p || p.status !== "ISSUED") return;
    await notifyUser("prescription.issued", p.patientId, { doctor: p.doctor.displayName, prescriptionNumber: p.prescriptionNumber, link: siteLink("/patient/prescriptions") }, { type: "Prescription", id: p.id });
  });

export const doctorRegistered = (doctorId: number) =>
  safely(async () => {
    const d = await prisma.doctorProfile.findUnique({ where: { id: doctorId }, include: { user: { select: { phone: true } } } });
    if (!d) return;
    const related = { type: "DoctorProfile", id: d.id };
    await notifyUser("doctor.registered", d.userId, { stream: d.stream ?? "", link: siteLink("/doctor") }, related);
    await notifyStaff("staff.doctor_registered", { doctor: d.displayName, stream: d.stream ?? "", city: d.clinicCity ?? "", phone: d.user.phone ?? "", link: siteLink(`/admin/doctors/${d.id}`) }, related);
  });

/** Staff verified, rejected or suspended a doctor. */
export const doctorDecision = (doctorId: number) =>
  safely(async () => {
    const d = await prisma.doctorProfile.findUnique({ where: { id: doctorId } });
    if (!d) return;
    const related = { type: "DoctorProfile", id: d.id };
    if (d.verificationStatus === "APPROVED") {
      const nextStep = d.acceptsConsultations ? "Your consultation panel is open. Set your working hours so patients can book you."
        : d.testPassedAt ? "Set your consultation fee and working hours to start taking patients."
        : "One step is left: the short test for your stream. You can take it in your dashboard now.";
      await notifyUser("doctor.verified", d.userId, { nextStep, link: siteLink("/doctor") }, related);
    } else if (d.verificationStatus === "REJECTED" || d.verificationStatus === "SUSPENDED") {
      await notifyUser("doctor.rejected", d.userId, {
        decision: d.verificationStatus === "REJECTED" ? "We could not accept your registration as it stands." : "Your DocHomoeo account has been suspended.",
        reason: d.rejectionReason ?? "Not given",
      }, related);
    }
  });

export const doctorTestPassed = (doctorId: number, score: string) =>
  safely(async () => {
    const d = await prisma.doctorProfile.findUnique({ where: { id: doctorId }, include: { tier: { select: { name: true } } } });
    if (d) await notifyUser("doctor.test_passed", d.userId, { stream: d.stream ?? "", score, level: d.tier?.name ?? "first", link: siteLink("/doctor/schedule") }, { type: "DoctorProfile", id: d.id });
  });

export const payoutPaid = (payoutId: number) =>
  safely(async () => {
    const p = await prisma.doctorPayout.findUnique({ where: { id: payoutId }, include: { doctor: { select: { userId: true } } } });
    if (!p || p.status !== "PAID") return;
    const day = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    await notifyUser("payout.paid", p.doctor.userId, { amount: money(num(p.amount)), period: `${day(p.periodStart)} to ${day(p.periodEnd)}`, reference: p.reference ?? "", link: siteLink("/doctor/earnings") }, { type: "DoctorPayout", id: p.id });
  });
