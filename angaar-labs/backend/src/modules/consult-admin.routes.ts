import * as events from "../lib/events";
import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "../generated/prisma/client";
import { AppointmentStatus, ConsultationMode, PayoutStatus } from "../generated/prisma/client";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { type Column, EXPORT_LIMIT, bulkResult, idsBody, idsQuery, logBulkDelete, sendCsv, stamp } from "../lib/bulk";
import { HttpError, getPage, idParam, notFound, num, optionalInt, optionalString, paged } from "../lib/http";
import { prisma } from "../lib/prisma";
import { DEFAULT_ZONE, addDays, dayInZone, dayStart, isoDay, zoneParam } from "../lib/time";
import { PRIVATE_DIR } from "./consultation-files.routes";

// The admin side of consultations.
//   appointmentAdminRoutes   /api/admin/appointments    every booking, with cancel
//   prescriptionAdminRoutes  /api/admin/prescriptions   prescriptions doctors have issued
//   payoutRoutes             /api/admin/payouts         what doctors are owed, and paying them
export const appointmentAdminRoutes = Router();
export const prescriptionAdminRoutes = Router();
export const payoutRoutes = Router();

const blank = (v: unknown) => (v === "" ? undefined : v);
const fullName = (first: string | null, last: string | null) => [first, last].filter(Boolean).join(" ");
const money = (value: number) => Math.round(value * 100) / 100;
/** A date-only column ("2026-10-05"), which has no time or timezone. */
const dayOf = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);
const dateRange = (from: string | undefined, to: string | undefined, tz: string) => ({
  ...(from ? { gte: dayStart(from, tz) } : {}),
  ...(to ? { lt: dayStart(addDays(to, 1), tz) } : {}),
});

// ─────────────────────────────────────────────── appointments

// A slot that was held but never paid for is stored as cancelled by SYSTEM. It was never a real
// appointment, so it is left out everywhere.
const REAL_APPOINTMENT: Prisma.AppointmentWhereInput = {
  OR: [{ status: { not: "CANCELLED" } }, { cancelledBy: null }, { cancelledBy: { not: "SYSTEM" } }],
};

const appointmentFilters = z.object({
  q: optionalString,
  status: z.preprocess(blank, z.enum(AppointmentStatus).optional()),
  doctorId: optionalInt,
  mode: z.preprocess(blank, z.enum(ConsultationMode).optional()),
  from: z.preprocess(blank, isoDay.optional()),
  to: z.preprocess(blank, isoDay.optional()),
  tz: zoneParam,
});

/** `base` is everything except the status filter, so the status tabs can show their own counts. */
const appointmentWhere = (filters: z.infer<typeof appointmentFilters>) => {
  const base: Prisma.AppointmentWhereInput = { AND: [REAL_APPOINTMENT] };
  if (filters.q) {
    base.OR = [
      { appointmentNumber: { contains: filters.q, mode: "insensitive" } },
      { patientName: { contains: filters.q, mode: "insensitive" } },
      { patientPhone: { contains: filters.q } },
    ];
  }
  if (filters.doctorId) base.doctorId = filters.doctorId;
  if (filters.mode) base.mode = filters.mode;
  if (filters.from || filters.to) base.scheduledAt = dateRange(filters.from, filters.to, filters.tz);
  const where: Prisma.AppointmentWhereInput = { ...base, ...(filters.status ? { status: filters.status } : {}) };
  return { base, where };
};

appointmentAdminRoutes.get("/", async (req, res) => {
  const { page, pageSize, skip, take } = getPage(req);
  const { base, where } = appointmentWhere(appointmentFilters.parse(req.query));

  const [total, rows, statusCounts] = await Promise.all([
    prisma.appointment.count({ where }),
    prisma.appointment.findMany({
      where,
      orderBy: [{ scheduledAt: "desc" }, { id: "desc" }],
      skip,
      take,
      select: {
        id: true, appointmentNumber: true, scheduledAt: true, durationMinutes: true, mode: true, status: true, fee: true, doctorEarning: true,
        patientName: true, patientAge: true, patientGender: true, patientPhone: true,
        doctor: { select: { id: true, displayName: true } },
        prescription: { select: { status: true } },
      },
    }),
    prisma.appointment.groupBy({ by: ["status"], where: base, _count: true }),
  ]);

  const items = rows.map(({ prescription, doctor, ...a }) => ({
    ...a,
    fee: num(a.fee),
    doctorEarning: num(a.doctorEarning),
    doctorId: doctor.id,
    doctorName: doctor.displayName,
    hasPrescription: prescription?.status === "ISSUED",
  }));
  res.json({
    ...paged(items, total, page, pageSize),
    statusCounts: Object.fromEntries(statusCounts.map((s) => [s.status, s._count])),
  });
});

// Doctors for the filter dropdown: only the ones that have appointments.
appointmentAdminRoutes.get("/doctors", async (_req, res) => {
  const doctors = await prisma.doctorProfile.findMany({
    where: { appointments: { some: REAL_APPOINTMENT } },
    orderBy: { displayName: "asc" },
    select: { id: true, displayName: true },
  });
  res.json({ items: doctors.map((d) => ({ id: d.id, name: d.displayName })) });
});

// Declared before "/:id" so "export" is not read as an id.
appointmentAdminRoutes.get("/export", async (req, res) => {
  const filters = appointmentFilters.extend({ ids: idsQuery }).parse(req.query);
  const rows = await prisma.appointment.findMany({
    where: filters.ids ? { id: { in: filters.ids } } : appointmentWhere(filters).where,
    orderBy: [{ scheduledAt: "desc" }, { id: "desc" }],
    take: EXPORT_LIMIT,
    include: { doctor: { select: { displayName: true } }, prescription: { select: { status: true, prescriptionNumber: true } } },
  });
  const columns: Column<(typeof rows)[number]>[] = [
    { header: "Appointment number", value: (a) => a.appointmentNumber },
    { header: `Scheduled (${filters.tz})`, value: (a) => stamp(a.scheduledAt, filters.tz) },
    { header: "Patient", value: (a) => a.patientName },
    { header: "Age", value: (a) => a.patientAge },
    { header: "Gender", value: (a) => a.patientGender },
    { header: "Phone", value: (a) => a.patientPhone },
    { header: "Doctor", value: (a) => a.doctor.displayName },
    { header: "Type", value: (a) => a.mode },
    { header: "Status", value: (a) => a.status },
    { header: "Fee", value: (a) => num(a.fee) },
    { header: "Doctor earning", value: (a) => num(a.doctorEarning) },
    { header: "Prescription", value: (a) => (a.prescription?.status === "ISSUED" ? a.prescription.prescriptionNumber : "") },
    { header: "Cancelled by", value: (a) => a.cancelledBy },
    { header: "Cancel reason", value: (a) => a.cancelReason },
    { header: `Completed (${filters.tz})`, value: (a) => stamp(a.completedAt, filters.tz) },
    { header: `Booked (${filters.tz})`, value: (a) => stamp(a.createdAt, filters.tz) },
  ];
  sendCsv(res, "appointments", columns, rows);
});

// Only bookings that never became a consultation can go: cancelled, never paid for, and with nothing
// written by the doctor or owed to them. Everything else is a record of care or of money.
appointmentAdminRoutes.post("/bulk-delete", async (req, res) => {
  const { ids } = idsBody.parse(req.body);
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const deletable = await prisma.appointment.findMany({
    where: {
      id: { in: ids }, status: "CANCELLED", payoutId: null, prescription: { is: null },
      // money came in (even if it went back), or a payment from the last day may still complete
      payments: { none: { OR: [{ status: { in: ["SUCCESS", "REFUNDED"] } }, { status: { in: ["CREATED", "PENDING"] }, createdAt: { gte: dayAgo } }] } },
    },
    select: { id: true, files: { select: { storedName: true } } },
  });
  const gone = deletable.map((a) => a.id);
  const deleted = await prisma.appointment.deleteMany({ where: { id: { in: gone }, status: "CANCELLED", payoutId: null } });
  // the reports and photos the patient attached go with it
  for (const file of deletable.flatMap((a) => a.files)) await unlink(path.join(PRIVATE_DIR, file.storedName)).catch(() => undefined);
  await logBulkDelete(req.user!.id, "Appointment", gone);
  res.json(bulkResult(deleted.count, ids.length - deleted.count, "Only cancelled appointments that were never paid for can be deleted. The rest are kept as the record of the consultation and its payment."));
});

/** Money the patient paid for an appointment that has not been given back. */
const paidAmount = (payments: { status: string; amount: unknown; refundedAmount: unknown }[]) =>
  money(payments.filter((p) => p.status === "SUCCESS").reduce((sum, p) => sum + num(p.amount) - num(p.refundedAmount), 0));

appointmentAdminRoutes.get("/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const appointment = await prisma.appointment.findUnique({
    where: { id },
    include: {
      doctor: { select: { id: true, displayName: true, qualification: true, specialization: true, user: { select: { phone: true } } } },
      patient: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
      payments: { orderBy: { createdAt: "desc" } },
      payout: { select: { id: true, status: true, paidAt: true, reference: true } },
      files: { orderBy: { id: "asc" }, select: { id: true, fileName: true, kind: true, size: true } },
      prescription: { include: { items: { orderBy: { id: "asc" } }, orders: { select: { id: true, orderNumber: true, status: true } } } },
    },
  });
  if (!appointment) throw notFound("Appointment");

  const { doctor, patient, payments, prescription, ...rest } = appointment;
  // a draft is the doctor's own working copy; the admin sees a prescription once it is issued
  const issued = prescription?.status === "ISSUED" ? prescription : null;
  res.json({
    ...rest,
    fee: num(rest.fee),
    doctorEarning: num(rest.doctorEarning),
    doctor: { id: doctor.id, name: doctor.displayName, qualification: doctor.qualification, specialization: doctor.specialization, phone: doctor.user.phone },
    bookedBy: { id: patient.id, name: fullName(patient.firstName, patient.lastName) || null, phone: patient.phone, email: patient.email },
    payments: payments.map(({ rawResponse: _raw, ...p }) => ({ ...p, amount: num(p.amount), refundedAmount: num(p.refundedAmount) })),
    // a cancelled appointment the patient paid for: the money still has to go back
    refundDueAmount: rest.status === "CANCELLED" ? paidAmount(payments) : 0,
    prescriptionInDraft: prescription?.status === "DRAFT",
    prescription: issued
      ? {
          id: issued.id, prescriptionNumber: issued.prescriptionNumber, diagnosis: issued.diagnosis, advice: issued.advice,
          followUpDate: dayOf(issued.followUpDate), issuedAt: issued.issuedAt, items: issued.items, orders: issued.orders,
        }
      : null,
  });
});

const CANCELLABLE: AppointmentStatus[] = ["PENDING_PAYMENT", "CONFIRMED"];

// Cancels an appointment on the clinic's behalf. No money moves here: if the patient had paid,
// the response says a refund is due and it has to be sent by hand.
appointmentAdminRoutes.post("/:id/cancel", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { reason } = z.object({ reason: z.preprocess(blank, z.string().trim().max(500).optional()) }).parse(req.body ?? {});
  if (!reason) throw new HttpError(400, "Give a reason for cancelling");

  const appointment = await prisma.appointment.findUnique({
    where: { id },
    select: { status: true, fee: true, payments: { select: { status: true, amount: true, refundedAmount: true } } },
  });
  if (!appointment) throw notFound("Appointment");
  if (!CANCELLABLE.includes(appointment.status)) {
    throw new HttpError(400, "Only an appointment that is waiting for payment or confirmed can be cancelled");
  }

  const paid = paidAmount(appointment.payments);
  const refundAmount = paid > 0 ? paid : appointment.status === "CONFIRMED" ? num(appointment.fee) : 0;

  await prisma.$transaction(async (tx) => {
    // the status is checked again in the update, in case the doctor or patient changed it meanwhile
    const changed = await tx.appointment.updateMany({
      where: { id, status: { in: CANCELLABLE } },
      data: { status: "CANCELLED", cancelledBy: "ADMIN", cancelReason: reason, doctorEarning: 0 },
    });
    if (changed.count === 0) throw new HttpError(409, "This appointment was changed just now. Reload and try again.");
    await tx.auditLog.create({
      data: {
        actorId: req.user!.id, action: "appointment.cancel", entity: "Appointment", entityId: String(id),
        changes: { from: appointment.status, to: "CANCELLED", reason, refundDue: refundAmount > 0, refundAmount },
      },
    });
  });

  if (appointment.status === "CONFIRMED") events.appointmentCancelled(id, { refundDue: refundAmount > 0 });
  res.json({ ok: true, refundDue: refundAmount > 0, refundAmount });
});

// ─────────────────────────────────────────────── prescriptions

const prescriptionFilters = z.object({
  q: optionalString,
  from: z.preprocess(blank, isoDay.optional()),
  to: z.preprocess(blank, isoDay.optional()),
  tz: zoneParam,
});

// only prescriptions that were given to the patient; drafts belong to the doctor
const prescriptionWhere = (filters: z.infer<typeof prescriptionFilters>) => {
  const where: Prisma.PrescriptionWhereInput = { status: "ISSUED" };
  if (filters.q) {
    where.OR = [
      { prescriptionNumber: { contains: filters.q, mode: "insensitive" } },
      { patientName: { contains: filters.q, mode: "insensitive" } },
      { doctor: { displayName: { contains: filters.q, mode: "insensitive" } } },
    ];
  }
  if (filters.from || filters.to) where.issuedAt = dateRange(filters.from, filters.to, filters.tz);
  return where;
};

prescriptionAdminRoutes.get("/", async (req, res) => {
  const { page, pageSize, skip, take } = getPage(req);
  const where = prescriptionWhere(prescriptionFilters.parse(req.query));

  const [total, rows] = await Promise.all([
    prisma.prescription.count({ where }),
    prisma.prescription.findMany({
      where,
      orderBy: [{ issuedAt: "desc" }, { id: "desc" }],
      skip,
      take,
      select: {
        id: true, prescriptionNumber: true, issuedAt: true, patientName: true, diagnosis: true,
        doctor: { select: { id: true, displayName: true } },
        patient: { select: { phone: true } },
        _count: { select: { items: true, orders: true } },
      },
    }),
  ]);

  const items = rows.map(({ doctor, patient, _count, ...p }) => ({
    ...p,
    patientPhone: patient.phone,
    doctorId: doctor.id,
    doctorName: doctor.displayName,
    medicineCount: _count.items,
    orderCount: _count.orders,
  }));
  res.json(paged(items, total, page, pageSize));
});

// Declared before "/:id" so "export" is not read as an id.
prescriptionAdminRoutes.get("/export", async (req, res) => {
  const filters = prescriptionFilters.extend({ ids: idsQuery }).parse(req.query);
  const rows = await prisma.prescription.findMany({
    where: filters.ids ? { id: { in: filters.ids }, status: "ISSUED" } : prescriptionWhere(filters),
    orderBy: [{ issuedAt: "desc" }, { id: "desc" }],
    take: EXPORT_LIMIT,
    include: {
      doctor: { select: { displayName: true } },
      patient: { select: { phone: true } },
      appointment: { select: { appointmentNumber: true } },
      items: { orderBy: { id: "asc" } },
      orders: { select: { orderNumber: true } },
    },
  });
  const columns: Column<(typeof rows)[number]>[] = [
    { header: "Prescription number", value: (p) => p.prescriptionNumber },
    { header: `Issued (${filters.tz})`, value: (p) => stamp(p.issuedAt, filters.tz) },
    { header: "Patient", value: (p) => p.patientName },
    { header: "Patient phone", value: (p) => p.patient.phone },
    { header: "Doctor", value: (p) => p.doctor.displayName },
    { header: "Appointment number", value: (p) => p.appointment?.appointmentNumber },
    { header: "Diagnosis", value: (p) => p.diagnosis },
    { header: "Number of medicines", value: (p) => p.items.length },
    { header: "Medicines", value: (p) => p.items.map((i) => [i.medicineName, i.potency, `x${i.quantity}`].filter(Boolean).join(" ")).join("; ") },
    { header: "Advice", value: (p) => p.advice },
    { header: "Follow-up date", value: (p) => dayOf(p.followUpDate) },
    { header: "Order placed", value: (p) => (p.orders.length ? "Yes" : "No") },
    { header: "Order numbers", value: (p) => p.orders.map((o) => o.orderNumber).join("; ") },
  ];
  sendCsv(res, "prescriptions", columns, rows);
});

prescriptionAdminRoutes.get("/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const prescription = await prisma.prescription.findFirst({
    where: { id, status: "ISSUED" },
    include: {
      doctor: { select: { id: true, displayName: true, qualification: true, specialization: true, registrationNumber: true } },
      patient: { select: { id: true, firstName: true, lastName: true, phone: true } },
      appointment: { select: { id: true, appointmentNumber: true, scheduledAt: true, mode: true, patientAge: true, patientGender: true, symptoms: true } },
      items: { orderBy: { id: "asc" } },
      orders: { orderBy: { placedAt: "desc" }, select: { id: true, orderNumber: true, status: true, paymentStatus: true, grandTotal: true, placedAt: true } },
    },
  });
  if (!prescription) throw notFound("Prescription");

  const { doctor, patient, orders, followUpDate, ...rest } = prescription;
  res.json({
    ...rest,
    followUpDate: dayOf(followUpDate),
    doctor: { id: doctor.id, name: doctor.displayName, qualification: doctor.qualification, specialization: doctor.specialization, registrationNumber: doctor.registrationNumber },
    bookedBy: { id: patient.id, name: fullName(patient.firstName, patient.lastName) || null, phone: patient.phone },
    orders: orders.map((o) => ({ ...o, grandTotal: num(o.grandTotal) })),
  });
});

// ─────────────────────────────────────────────── doctor payouts

// What a doctor is owed: finished consultations that are not on any payout yet.
const UNPAID = {
  status: "COMPLETED", payoutId: null, completedAt: { not: null }, doctorEarning: { gt: 0 },
} satisfies Prisma.AppointmentWhereInput;

const bankSelect = { bankAccountName: true, bankAccountNumber: true, bankIfsc: true } as const;
type BankFields = { bankAccountName: string | null; bankAccountNumber: string | null; bankIfsc: string | null };
/** The account to pay into, or null when the account number or IFSC is missing. */
const bankOf = (d: BankFields) =>
  d.bankAccountNumber && d.bankIfsc ? { accountName: d.bankAccountName, accountNumber: d.bankAccountNumber, ifsc: d.bankIfsc } : null;

payoutRoutes.get("/owed", async (_req, res) => {
  const groups = await prisma.appointment.groupBy({
    by: ["doctorId"],
    where: UNPAID,
    _count: true,
    _sum: { doctorEarning: true },
    _min: { completedAt: true },
  });
  const doctors = await prisma.doctorProfile.findMany({
    where: { id: { in: groups.map((g) => g.doctorId) } },
    select: { id: true, displayName: true, photoUrl: true, ...bankSelect },
  });
  const doctorById = new Map(doctors.map((d) => [d.id, d]));

  const items = groups
    .flatMap((group) => {
      const doctor = doctorById.get(group.doctorId);
      if (!doctor) return [];
      const bank = bankOf(doctor);
      return [{
        doctorId: doctor.id, doctorName: doctor.displayName, photoUrl: doctor.photoUrl,
        consultations: group._count, amount: num(group._sum.doctorEarning), oldestCompletedAt: group._min.completedAt,
        hasBankDetails: bank !== null, bank,
      }];
    })
    .sort((a, b) => b.amount - a.amount);

  res.json({ items, totalAmount: money(items.reduce((sum, row) => sum + row.amount, 0)) });
});

const payoutFilters = z.object({
  status: z.preprocess(blank, z.enum(PayoutStatus).optional()),
  doctorId: optionalInt,
  tz: zoneParam,
});

const payoutWhere = (filters: z.infer<typeof payoutFilters>) => {
  const base: Prisma.DoctorPayoutWhereInput = filters.doctorId ? { doctorId: filters.doctorId } : {};
  const where: Prisma.DoctorPayoutWhereInput = { ...base, ...(filters.status ? { status: filters.status } : {}) };
  return { base, where };
};

payoutRoutes.get("/", async (req, res) => {
  const { page, pageSize, skip, take } = getPage(req);
  const { base, where } = payoutWhere(payoutFilters.parse(req.query));

  const [total, rows, statusCounts, doctors] = await Promise.all([
    prisma.doctorPayout.count({ where }),
    prisma.doctorPayout.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take,
      include: { doctor: { select: { id: true, displayName: true, ...bankSelect } }, _count: { select: { appointments: true } } },
    }),
    prisma.doctorPayout.groupBy({ by: ["status"], where: base, _count: true }),
    // for the doctor filter: everyone who has a payout
    prisma.doctorProfile.findMany({ where: { payouts: { some: {} } }, orderBy: { displayName: "asc" }, select: { id: true, displayName: true } }),
  ]);

  const items = rows.map(({ doctor, _count, ...p }) => {
    const bank = bankOf(doctor);
    return {
      ...p,
      periodStart: dayOf(p.periodStart),
      periodEnd: dayOf(p.periodEnd),
      amount: num(p.amount),
      doctorId: doctor.id,
      doctorName: doctor.displayName,
      consultations: _count.appointments,
      hasBankDetails: bank !== null,
      bank,
    };
  });
  res.json({
    ...paged(items, total, page, pageSize),
    statusCounts: Object.fromEntries(statusCounts.map((s) => [s.status, s._count])),
    doctors: doctors.map((d) => ({ id: d.id, name: d.displayName })),
  });
});

payoutRoutes.get("/export", async (req, res) => {
  const filters = payoutFilters.extend({ ids: idsQuery }).parse(req.query);
  const rows = await prisma.doctorPayout.findMany({
    where: filters.ids ? { id: { in: filters.ids } } : payoutWhere(filters).where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: EXPORT_LIMIT,
    include: { doctor: { select: { displayName: true } }, _count: { select: { appointments: true } } },
  });
  const columns: Column<(typeof rows)[number]>[] = [
    { header: "Payout", value: (p) => p.id },
    { header: "Doctor", value: (p) => p.doctor.displayName },
    { header: "Consultations from", value: (p) => dayOf(p.periodStart) },
    { header: "Consultations up to", value: (p) => dayOf(p.periodEnd) },
    { header: "Consultations", value: (p) => p._count.appointments },
    { header: "Amount", value: (p) => num(p.amount) },
    { header: "Status", value: (p) => p.status },
    { header: "Bank reference", value: (p) => p.reference },
    { header: `Paid (${filters.tz})`, value: (p) => stamp(p.paidAt, filters.tz) },
    { header: `Created (${filters.tz})`, value: (p) => stamp(p.createdAt, filters.tz) },
  ];
  sendCsv(res, "doctor-payouts", columns, rows);
});

const createPayoutInput = z.object({
  doctorId: z.coerce.number().int().positive(),
  upTo: z.preprocess((v) => (v === "" || v === null ? undefined : v), isoDay.optional()),
});

// Groups everything a doctor is owed, up to the end of a day (India time), into one payout.
payoutRoutes.post("/", async (req, res) => {
  const input = createPayoutInput.parse(req.body ?? {});
  const today = dayInZone(new Date(), DEFAULT_ZONE);
  const upTo = input.upTo ?? today;
  if (Number.isNaN(Date.parse(`${upTo}T00:00:00Z`))) throw new HttpError(400, "That is not a valid date");
  if (upTo > today) throw new HttpError(400, "The date cannot be in the future");

  const doctor = await prisma.doctorProfile.findUnique({ where: { id: input.doctorId }, select: { id: true, displayName: true } });
  if (!doctor) throw notFound("Doctor");

  const endOfDay = dayStart(addDays(upTo, 1), DEFAULT_ZONE);
  const payout = await prisma.$transaction(async (tx) => {
    const unpaid = await tx.appointment.findMany({
      where: { ...UNPAID, doctorId: doctor.id, completedAt: { lt: endOfDay } },
      orderBy: { completedAt: "asc" },
      select: { id: true, doctorEarning: true, completedAt: true },
    });
    if (unpaid.length === 0) throw new HttpError(400, `There is nothing to pay ${doctor.displayName} for consultations up to this date`);

    const amount = money(unpaid.reduce((sum, a) => sum + num(a.doctorEarning), 0));
    const created = await tx.doctorPayout.create({
      data: {
        doctorId: doctor.id, status: "PENDING", amount,
        periodStart: new Date(`${dayInZone(unpaid[0].completedAt!, DEFAULT_ZONE)}T00:00:00Z`),
        periodEnd: new Date(`${upTo}T00:00:00Z`),
      },
    });
    // "payoutId: null" again here: if another payout took one of these meanwhile, nothing is saved
    const linked = await tx.appointment.updateMany({ where: { id: { in: unpaid.map((a) => a.id) }, payoutId: null }, data: { payoutId: created.id } });
    if (linked.count !== unpaid.length) throw new HttpError(409, "Some of these consultations were just added to another payout. Reload and try again.");

    await tx.auditLog.create({
      data: {
        actorId: req.user!.id, action: "payout.create", entity: "DoctorPayout", entityId: String(created.id),
        changes: { doctorId: doctor.id, upTo, amount, appointmentIds: unpaid.map((a) => a.id) },
      },
    });
    return { id: created.id, amount, consultations: unpaid.length };
  });

  res.status(201).json({ ...payout, doctorId: doctor.id, doctorName: doctor.displayName, status: "PENDING", periodEnd: upTo });
});

const updatePayoutInput = z.object({
  status: z.enum(["PAID", "FAILED"]),
  reference: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.string().trim().max(120).optional()),
});

// Record that the bank transfer went through, or that it failed.
payoutRoutes.patch("/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { status, reference } = updatePayoutInput.parse(req.body ?? {});
  if (status === "PAID" && !reference) throw new HttpError(400, "Enter the bank reference for this payment");

  const payout = await prisma.doctorPayout.findUnique({ where: { id }, select: { status: true, amount: true, doctorId: true } });
  if (!payout) throw notFound("Payout");
  if (payout.status !== "PENDING") {
    throw new HttpError(400, `This payout is already marked as ${payout.status === "PAID" ? "paid" : "failed"}`);
  }

  const released = await prisma.$transaction(async (tx) => {
    const changed = await tx.doctorPayout.updateMany({
      where: { id, status: "PENDING" },
      data: status === "PAID" ? { status: "PAID", reference, paidAt: new Date() } : { status: "FAILED" },
    });
    if (changed.count === 0) throw new HttpError(409, "This payout was changed just now. Reload and try again.");

    // a failed payout lets go of its consultations, so they are owed again and can go on a new payout
    let appointmentIds: number[] = [];
    if (status === "FAILED") {
      appointmentIds = (await tx.appointment.findMany({ where: { payoutId: id }, select: { id: true } })).map((a) => a.id);
      await tx.appointment.updateMany({ where: { payoutId: id }, data: { payoutId: null } });
    }
    await tx.auditLog.create({
      data: {
        actorId: req.user!.id, action: status === "PAID" ? "payout.paid" : "payout.failed", entity: "DoctorPayout", entityId: String(id),
        changes: {
          from: payout.status, to: status, doctorId: payout.doctorId, amount: num(payout.amount),
          ...(status === "PAID" ? { reference: reference ?? null } : { releasedAppointmentIds: appointmentIds }),
        },
      },
    });
    return appointmentIds.length;
  });

  if (status === "PAID") events.payoutPaid(id);
  res.json({ ok: true, status, releasedConsultations: released });
});

// A payout that was paid is the record of money sent to a doctor, so it stays. One that is still
// waiting, or failed, can go: the database clears the link, and its consultations are owed again.
payoutRoutes.post("/bulk-delete", async (req, res) => {
  const { ids } = idsBody.parse(req.body);
  const deletable = await prisma.doctorPayout.findMany({ where: { id: { in: ids }, status: { not: "PAID" } }, select: { id: true } });
  const gone = deletable.map((p) => p.id);
  const deleted = await prisma.doctorPayout.deleteMany({ where: { id: { in: gone }, status: { not: "PAID" } } });
  await logBulkDelete(req.user!.id, "DoctorPayout", gone);
  res.json(bulkResult(deleted.count, ids.length - deleted.count, "Payouts already paid to a doctor were kept. They are the record of that bank transfer."));
});
