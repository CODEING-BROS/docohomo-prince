import * as events from "../lib/events";
import { randomInt } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "../generated/prisma/client";
import { newPrescriptionNumber } from "../lib/consult";
import { onboardingOf, settleConsulting, testQuestionsWhere } from "../lib/doctor-onboarding";
import { HttpError, idParam, notFound, num, optionalString } from "../lib/http";
import { prisma } from "../lib/prisma";
import { slotsForDay } from "../lib/slots";
import { addDays, dayInZone, daysBetween, isoDay, dayStart as zoneDayStart, zoneParam } from "../lib/time";
import { setWholesale } from "./doctor-admin.routes";

// The doctor's own area: earnings, appointments, writing prescriptions, working hours.
// Mounted at /api/doctor for signed-in doctors.
export const doctorPanelRoutes = Router();

declare module "express-serve-static-core" {
  interface Request {
    doctorId?: number;
  }
}

// every route below acts on the signed-in doctor's own record
doctorPanelRoutes.use(async (req, _res, next) => {
  const profile = await prisma.doctorProfile.findUnique({ where: { userId: req.user!.id }, select: { id: true } });
  if (!profile) throw new HttpError(403, "This account is not registered as a doctor");
  req.doctorId = profile.id;
  next();
});

const IST = "+05:30";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const dayStart = (day: string) => new Date(`${day}T00:00:00${IST}`);
const sum = (value: unknown) => num(value);

// money a doctor has earned comes from consultations that actually happened
const EARNED = { status: "COMPLETED" } as const;

doctorPanelRoutes.get("/overview", async (req, res) => {
  const doctorId = req.doctorId!;
  const day = today();
  const monthStart = dayStart(`${day.slice(0, 7)}-01`);
  const lastMonthStart = new Date(monthStart);
  lastMonthStart.setUTCMonth(lastMonthStart.getUTCMonth() - 1);
  const dayBegin = dayStart(day);
  const dayEnd = new Date(dayBegin.getTime() + 24 * 60 * 60 * 1000);

  const [profile, thisMonth, lastMonth, allTime, unpaid, todayList, upcoming, byMonth] = await Promise.all([
    prisma.doctorProfile.findUnique({
      where: { id: doctorId },
      select: {
        displayName: true, photoUrl: true, verificationStatus: true, rejectionReason: true, acceptsConsultations: true,
        videoFee: true, audioFee: true, commissionPercent: true, slotMinutes: true, ratingAverage: true, ratingCount: true, stream: true,
        tier: { select: { name: true, maxPatientsPerDay: true } }, _count: { select: { availability: true } },
        user: { select: { b2bAccount: { select: { status: true, priceTier: { select: { name: true, defaultDiscountPercent: true } } } } } },
      },
    }),
    prisma.appointment.aggregate({ where: { doctorId, ...EARNED, completedAt: { gte: monthStart } }, _sum: { doctorEarning: true }, _count: true }),
    prisma.appointment.aggregate({ where: { doctorId, ...EARNED, completedAt: { gte: lastMonthStart, lt: monthStart } }, _sum: { doctorEarning: true }, _count: true }),
    prisma.appointment.aggregate({ where: { doctorId, ...EARNED }, _sum: { doctorEarning: true }, _count: true }),
    prisma.appointment.aggregate({ where: { doctorId, ...EARNED, payoutId: null }, _sum: { doctorEarning: true } }),
    prisma.appointment.findMany({
      where: { doctorId, scheduledAt: { gte: dayBegin, lt: dayEnd }, status: { in: ["CONFIRMED", "IN_PROGRESS", "COMPLETED", "NO_SHOW"] } },
      orderBy: { scheduledAt: "asc" },
      select: { id: true, appointmentNumber: true, patientName: true, patientAge: true, patientGender: true, mode: true, scheduledAt: true, status: true, symptoms: true, meetingUrl: true },
    }),
    prisma.appointment.count({ where: { doctorId, status: "CONFIRMED", scheduledAt: { gte: dayEnd } } }),
    prisma.$queryRaw<{ month: Date; earned: number; consultations: number }[]>`
      SELECT date_trunc('month', ("completedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata') AS month,
             coalesce(sum("doctorEarning"), 0)::float8 AS earned, count(*)::int AS consultations
      FROM "Appointment"
      WHERE "doctorId" = ${doctorId} AND status = 'COMPLETED' AND "completedAt" >= ${new Date(monthStart.getTime() - 160 * 24 * 60 * 60 * 1000)}
      GROUP BY 1 ORDER BY 1`,
  ]);
  if (!profile) throw notFound("Doctor");

  // the last six months, including the ones with nothing earned
  const months: { month: string; earned: number; consultations: number }[] = [];
  for (let back = 5; back >= 0; back--) {
    const date = new Date(`${day.slice(0, 7)}-01T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() - back);
    const key = date.toISOString().slice(0, 7);
    const found = byMonth.find((row) => row.month.toISOString().slice(0, 7) === key);
    months.push({ month: `${key}-01`, earned: found?.earned ?? 0, consultations: found?.consultations ?? 0 });
  }

  const wholesale = profile.user.b2bAccount;
  res.json({
    doctor: {
      displayName: profile.displayName, photoUrl: profile.photoUrl, verificationStatus: profile.verificationStatus, rejectionReason: profile.rejectionReason,
      consulting: profile.acceptsConsultations, videoFee: profile.videoFee === null ? null : num(profile.videoFee), audioFee: profile.audioFee === null ? null : num(profile.audioFee),
      commissionPercent: num(profile.commissionPercent), slotMinutes: profile.slotMinutes, hasWorkingHours: profile._count.availability > 0,
      stream: profile.stream, tier: profile.tier, rating: num(profile.ratingAverage), ratingCount: profile.ratingCount,
      wholesale: wholesale ? { status: wholesale.status, tier: wholesale.priceTier?.name ?? null, discountPercent: wholesale.priceTier ? num(wholesale.priceTier.defaultDiscountPercent) : null } : null,
    },
    earnings: {
      thisMonth: sum(thisMonth._sum.doctorEarning), thisMonthConsultations: thisMonth._count,
      lastMonth: sum(lastMonth._sum.doctorEarning), lastMonthConsultations: lastMonth._count,
      allTime: sum(allTime._sum.doctorEarning), allTimeConsultations: allTime._count,
      waitingForPayout: sum(unpaid._sum.doctorEarning),
      months,
    },
    today: todayList,
    upcomingAfterToday: upcoming,
  });
});

// ─────────────────────────────────────────────── appointments

doctorPanelRoutes.get("/appointments", async (req, res) => {
  const { scope, from, to, tz } = z.object({ scope: z.enum(["upcoming", "past"]).default("upcoming"), from: isoDay.optional(), to: isoDay.optional(), tz: zoneParam }).parse(req.query);
  const now = new Date();
  const where: Prisma.AppointmentWhereInput =
    scope === "upcoming"
      ? { doctorId: req.doctorId!, status: { in: ["CONFIRMED", "IN_PROGRESS"] }, scheduledAt: { gte: new Date(now.getTime() - 2 * 60 * 60 * 1000) } }
      : { doctorId: req.doctorId!, OR: [{ status: { in: ["COMPLETED", "NO_SHOW", "CANCELLED"] } }, { status: "CONFIRMED", scheduledAt: { lt: new Date(now.getTime() - 2 * 60 * 60 * 1000) } }], AND: [{ OR: [{ cancelledBy: null }, { cancelledBy: { not: "SYSTEM" } }] }] };

  const appointments = await prisma.appointment.findMany({
    where: scope === "past" && from && to ? { AND: [where, { scheduledAt: { gte: zoneDayStart(from, tz), lt: zoneDayStart(addDays(to, 1), tz) } }] } : where,
    orderBy: { scheduledAt: scope === "upcoming" ? "asc" : "desc" },
    take: 200,
    select: {
      id: true, appointmentNumber: true, patientName: true, patientAge: true, patientGender: true, patientPhone: true, mode: true,
      scheduledAt: true, durationMinutes: true, status: true, fee: true, doctorEarning: true, symptoms: true, intake: true, meetingUrl: true, doctorNotes: true, payoutId: true,
      prescription: { select: { id: true, prescriptionNumber: true, status: true } },
      files: { orderBy: { id: "asc" }, select: { id: true, fileName: true, kind: true, size: true } },
    },
  });
  res.json({ items: appointments.map((a) => ({ ...a, fee: num(a.fee), doctorEarning: num(a.doctorEarning), paidOut: a.payoutId !== null })) });
});

const own = async (doctorId: number, id: number) => {
  const appointment = await prisma.appointment.findFirst({ where: { id, doctorId } });
  if (!appointment) throw notFound("Appointment");
  return appointment;
};

// Start the call, finish the consultation, or record that the patient did not turn up.
doctorPanelRoutes.patch("/appointments/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { action, doctorNotes } = z.object({ action: z.enum(["start", "complete", "no_show"]).optional(), doctorNotes: optionalString }).parse(req.body);
  const appointment = await own(req.doctorId!, id);

  const data: Prisma.AppointmentUpdateInput = {};
  if (doctorNotes !== undefined) data.doctorNotes = doctorNotes;
  if (action === "start") {
    if (appointment.status !== "CONFIRMED") throw new HttpError(400, "Only a confirmed appointment can be started");
    data.status = "IN_PROGRESS";
  }
  if (action === "complete") {
    if (!["CONFIRMED", "IN_PROGRESS"].includes(appointment.status)) throw new HttpError(400, "This appointment cannot be marked as done");
    data.status = "COMPLETED";
    data.completedAt = new Date();
  }
  if (action === "no_show") {
    if (!["CONFIRMED", "IN_PROGRESS"].includes(appointment.status)) throw new HttpError(400, "This appointment cannot be changed");
    if (appointment.scheduledAt > new Date()) throw new HttpError(400, "The appointment has not started yet");
    data.status = "NO_SHOW";
  }
  await prisma.appointment.update({ where: { id }, data });
  res.json({ ok: true });
});

// ─────────────────────────────────────────────── prescriptions

// Medicines from the store, so a prescribed item can be ordered by the patient in one step.
doctorPanelRoutes.get("/medicine-search", async (req, res) => {
  const { q } = z.object({ q: optionalString }).parse(req.query);
  if (!q || q.length < 2) return res.json({ items: [] });
  const variants = await prisma.productVariant.findMany({
    where: { isActive: true, product: { status: "ACTIVE", name: { contains: q, mode: "insensitive" } } },
    orderBy: [{ product: { name: "asc" } }, { sortOrder: "asc" }],
    take: 20,
    select: { id: true, title: true, potency: true, sellingPrice: true, stockQuantity: true, product: { select: { name: true } } },
  });
  res.json({ items: variants.map((v) => ({ variantId: v.id, name: v.product.name, title: v.title, potency: v.potency, price: num(v.sellingPrice), inStock: v.stockQuantity > 0 })) });
});

doctorPanelRoutes.get("/appointments/:id/prescription", async (req, res) => {
  const { id } = idParam.parse(req.params);
  await own(req.doctorId!, id);
  const prescription = await prisma.prescription.findUnique({ where: { appointmentId: id }, include: { items: { orderBy: { id: "asc" } } } });
  res.json({ prescription });
});

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const line = (max: number) => z.preprocess(blank, z.string().trim().max(max).nullable().optional());

const prescriptionInput = z.object({
  diagnosis: line(1000),
  advice: line(2000),
  followUpDate: z.preprocess(blank, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()),
  issue: z.boolean().default(false), // false keeps it as a draft only the doctor sees
  items: z
    .array(z.object({
      variantId: z.number().int().positive().nullable().optional(),
      medicineName: z.string().trim().min(2, "Each medicine needs a name").max(200),
      potency: line(40), dosage: line(120), frequency: line(120), duration: line(120), instructions: line(500),
      quantity: z.coerce.number().int().min(1).max(50).default(1),
    }))
    .max(30),
});

// Save the prescription for an appointment as a draft, or issue it to the patient.
doctorPanelRoutes.put("/appointments/:id/prescription", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const input = prescriptionInput.parse(req.body);
  const appointment = await own(req.doctorId!, id);
  if (!["CONFIRMED", "IN_PROGRESS", "COMPLETED"].includes(appointment.status)) throw new HttpError(400, "A prescription can only be written for a consultation that took place");
  if (input.issue && input.items.length === 0 && !input.advice) throw new HttpError(400, "Add at least one medicine or some advice before issuing");

  const existing = await prisma.prescription.findUnique({ where: { appointmentId: id }, select: { id: true, status: true } });
  if (existing?.status === "ISSUED") throw new HttpError(400, "This prescription has already been given to the patient and cannot be changed");

  const fields = {
    diagnosis: input.diagnosis ?? null, advice: input.advice ?? null,
    followUpDate: input.followUpDate ? new Date(`${input.followUpDate}T00:00:00Z`) : null,
    status: input.issue ? ("ISSUED" as const) : ("DRAFT" as const),
    issuedAt: input.issue ? new Date() : null,
  };
  const items = input.items.map((item) => ({
    variantId: item.variantId ?? null, medicineName: item.medicineName, potency: item.potency ?? null, dosage: item.dosage ?? null,
    frequency: item.frequency ?? null, duration: item.duration ?? null, instructions: item.instructions ?? null, quantity: item.quantity,
  }));

  const saved = existing
    ? await prisma.prescription.update({ where: { id: existing.id }, data: { ...fields, items: { deleteMany: {}, create: items } } })
    : await prisma.prescription.create({
        data: {
          ...fields, prescriptionNumber: await newPrescriptionNumber(), appointmentId: id, doctorId: req.doctorId!,
          patientId: appointment.patientId, patientName: appointment.patientName, items: { create: items },
        },
      });

  // issuing the prescription closes the consultation
  if (input.issue && appointment.status !== "COMPLETED") {
    await prisma.appointment.update({ where: { id }, data: { status: "COMPLETED", completedAt: new Date() } });
  }
  if (saved.status === "ISSUED") events.prescriptionIssued(saved.id); // an issued one can no longer be saved again, so this happens once
  res.json({ id: saved.id, prescriptionNumber: saved.prescriptionNumber, status: saved.status });
});

// ─────────────────────────────────────────────── working hours

doctorPanelRoutes.get("/availability", async (req, res) => {
  const doctorId = req.doctorId!;
  const [profile, hours, timeOff] = await Promise.all([
    prisma.doctorProfile.findUnique({ where: { id: doctorId }, select: { slotMinutes: true } }),
    prisma.doctorAvailability.findMany({ where: { doctorId }, orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] }),
    prisma.doctorTimeOff.findMany({ where: { doctorId, endsAt: { gte: new Date() } }, orderBy: { startsAt: "asc" } }),
  ]);
  res.json({ slotMinutes: profile?.slotMinutes ?? 15, hours, timeOff });
});

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 10:00");
const hoursInput = z.object({
  slotMinutes: z.coerce.number().int().min(5).max(120),
  hours: z.array(z.object({ dayOfWeek: z.number().int().min(0).max(6), startTime: clock, endTime: clock })).max(60),
});
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

doctorPanelRoutes.put("/availability", async (req, res) => {
  const doctorId = req.doctorId!;
  const { slotMinutes, hours } = hoursInput.parse(req.body);
  for (const window of hours) if (window.endTime <= window.startTime) throw new HttpError(400, `${DAYS[window.dayOfWeek]}: the end time must be after the start time`);
  for (let day = 0; day < 7; day++) {
    const sameDay = hours.filter((h) => h.dayOfWeek === day).sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (let i = 1; i < sameDay.length; i++) if (sameDay[i].startTime < sameDay[i - 1].endTime) throw new HttpError(400, `${DAYS[day]}: two of the time ranges overlap`);
  }
  await prisma.$transaction([
    prisma.doctorAvailability.deleteMany({ where: { doctorId } }),
    prisma.doctorAvailability.createMany({ data: hours.map((h) => ({ ...h, doctorId })) }),
    prisma.doctorProfile.update({ where: { id: doctorId }, data: { slotMinutes } }),
  ]);
  res.json({ ok: true });
});

doctorPanelRoutes.get("/slots", async (req, res) => {
  const { date } = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(req.query);
  res.json({ date, slots: await slotsForDay(req.doctorId!, date) });
});

doctorPanelRoutes.post("/time-off", async (req, res) => {
  const { from, to, reason } = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reason: line(200) }).parse(req.body);
  if (to < from) throw new HttpError(400, "The last day is before the first day");
  const created = await prisma.doctorTimeOff.create({ data: { doctorId: req.doctorId!, startsAt: dayStart(from), endsAt: new Date(`${to}T23:59:59${IST}`), reason: reason ?? null } });
  res.status(201).json(created);
});

doctorPanelRoutes.delete("/time-off/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  await prisma.doctorTimeOff.deleteMany({ where: { id, doctorId: req.doctorId! } });
  res.json({ ok: true });
});

// ─────────────────────────────────────────────── earnings and payouts

doctorPanelRoutes.get("/earnings", async (req, res) => {
  const doctorId = req.doctorId!;
  // with dates, the two lists show that period only; the totals above them always cover everything
  const period = z.object({ from: isoDay.optional(), to: isoDay.optional(), tz: zoneParam }).parse(req.query);
  const between = period.from && period.to ? { gte: zoneDayStart(period.from, period.tz), lt: zoneDayStart(addDays(period.to, 1), period.tz) } : undefined;
  const [payouts, consultations, unpaid, paid] = await Promise.all([
    prisma.doctorPayout.findMany({
      where: { doctorId, ...(between ? { createdAt: between } : {}) }, orderBy: { createdAt: "desc" }, take: 100,
      select: { id: true, periodStart: true, periodEnd: true, amount: true, status: true, reference: true, paidAt: true, createdAt: true, _count: { select: { appointments: true } } },
    }),
    prisma.appointment.findMany({
      where: { doctorId, status: "COMPLETED", ...(between ? { completedAt: between } : {}) }, orderBy: { completedAt: "desc" }, take: 500,
      select: { id: true, appointmentNumber: true, patientName: true, mode: true, completedAt: true, scheduledAt: true, fee: true, doctorEarning: true, payoutId: true, payout: { select: { status: true } } },
    }),
    prisma.appointment.aggregate({ where: { doctorId, status: "COMPLETED", payoutId: null }, _sum: { doctorEarning: true }, _count: true }),
    prisma.doctorPayout.aggregate({ where: { doctorId, status: "PAID" }, _sum: { amount: true } }),
  ]);
  res.json({
    waitingForPayout: num(unpaid._sum.doctorEarning), waitingConsultations: unpaid._count, paidOut: num(paid._sum.amount),
    payouts: payouts.map(({ _count, ...p }) => ({ ...p, amount: num(p.amount), consultations: _count.appointments })),
    consultations: consultations.map(({ payout, payoutId, ...c }) => ({
      ...c, fee: num(c.fee), doctorEarning: num(c.doctorEarning),
      payout: payoutId === null ? "WAITING" : payout?.status === "PAID" ? "PAID" : "PROCESSING",
    })),
  });
});

// ─────────────────────────────────────────────── my profile

const profileSelect = {
  displayName: true, photoUrl: true, qualification: true, stream: true, specialization: true, specializationId: true, experienceYears: true, languages: true, bio: true,
  registrationNumber: true, registrationCouncil: true, registrationYear: true,
  clinicName: true, clinicAddress: true, clinicCity: true, clinicState: true, clinicPincode: true,
  verificationStatus: true, rejectionReason: true, submittedAt: true, verifiedAt: true,
  acceptsConsultations: true, isListed: true, videoFee: true, audioFee: true, slotMinutes: true, commissionPercent: true,
  bankAccountName: true, bankAccountNumber: true, bankIfsc: true,
  user: { select: { phone: true, email: true } },
  documents: { orderBy: { createdAt: "asc" as const }, select: { id: true, type: true, fileName: true, status: true, remarks: true } },
} as const;

doctorPanelRoutes.get("/profile", async (req, res) => {
  const profile = await prisma.doctorProfile.findUnique({ where: { id: req.doctorId! }, select: profileSelect });
  if (!profile) throw notFound("Doctor");
  const { user, bankAccountNumber, documents, ...rest } = profile;
  res.json({
    ...rest, phone: user.phone, email: user.email,
    documents: documents.map(({ remarks, ...doc }) => ({ ...doc, rejectionReason: doc.status === "REJECTED" ? remarks : null })),
    experienceYears: rest.experienceYears === null ? null : num(rest.experienceYears),
    videoFee: rest.videoFee === null ? null : num(rest.videoFee), audioFee: rest.audioFee === null ? null : num(rest.audioFee),
    commissionPercent: num(rest.commissionPercent),
    // the full account number is never sent back; the doctor types it again to change it
    bankAccountEnding: bankAccountNumber ? bankAccountNumber.slice(-4) : null,
  });
});

const fee = z.preprocess(blank, z.coerce.number().min(0, "A fee cannot be negative").max(100000).nullable().optional());
const profileInput = z.object({
  photoUrl: z.preprocess(blank, z.string().trim().max(500).nullable().optional()),
  stream: z.preprocess(blank, z.string().trim().min(2).max(80).optional()),
  specializationId: z.preprocess((v) => (v === "" ? null : v), z.coerce.number().int().positive().nullable().optional()),
  specialization: line(300),
  experienceYears: z.preprocess(blank, z.coerce.number().min(0).max(80).nullable().optional()),
  languages: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  bio: line(2000),
  email: z.preprocess(blank, z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")).nullable().optional()),
  clinicName: line(160), clinicAddress: line(400), clinicCity: line(80), clinicState: line(80),
  clinicPincode: z.preprocess(blank, z.string().trim().regex(/^\d{6}$/, "A pincode has 6 digits").nullable().optional()),
  videoFee: fee, audioFee: fee,
  bankAccountName: line(120),
  bankAccountNumber: z.preprocess(blank, z.string().trim().regex(/^\d{9,18}$/, "An account number has 9 to 18 digits").nullable().optional()),
  bankIfsc: z.preprocess(blank, z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "An IFSC code looks like HDFC0001234").nullable().optional()),
});

// What a doctor may change about themselves. Name, qualification and registration details are
// what staff verified, so those are changed by staff only.
doctorPanelRoutes.patch("/profile", async (req, res) => {
  const { email, bankAccountNumber, stream: streamName, specializationId, ...input } = profileInput.parse(req.body);
  const doctorId = req.doctorId!;
  const current = await prisma.doctorProfile.findUnique({ where: { id: doctorId }, select: { acceptsConsultations: true, videoFee: true, audioFee: true, stream: true, specializationId: true, testPassedAt: true } });
  if (!current) throw notFound("Doctor");

  // a change of stream or specialization: checked against staff's lists, and the test is taken again if there is one
  const practice: { stream?: string; specializationId?: number | null; specialization?: string | null; testPassedAt?: null } = {};
  const nextStreamName = streamName ?? current.stream;
  if (streamName !== undefined && streamName !== current.stream) {
    const found = await prisma.consultingStream.findFirst({ where: { name: streamName, isActive: true, status: { not: "CLOSED" } }, select: { name: true } });
    if (!found) throw new HttpError(400, "Choose your consulting stream from the list");
    practice.stream = found.name;
    practice.specializationId = null;
    practice.specialization = null;
  }
  if (specializationId !== undefined && (specializationId !== current.specializationId || practice.stream)) {
    if (specializationId === null) {
      practice.specializationId = null;
    } else {
      const found = await prisma.streamSpecialization.findFirst({ where: { id: specializationId, isActive: true, stream: { name: nextStreamName ?? "" } }, select: { id: true, name: true } });
      if (!found) throw new HttpError(400, "Choose a specialization from the list for your stream");
      practice.specializationId = found.id;
      practice.specialization = found.name;
    }
  }
  const practiceChanged = practice.stream !== undefined || (practice.specializationId !== undefined && practice.specializationId !== current.specializationId);
  // the test is taken again only when there is something new to be asked: another stream, or a specialization
  // with questions of its own. Moving between specializations that share the general questions changes nothing.
  const ownQuestions = practice.specializationId ? await prisma.streamQuestion.count({ where: { specializationId: practice.specializationId, isActive: true } }) : 0;
  const retest = practiceChanged && (practice.stream !== undefined || ownQuestions > 0);
  if (retest && current.testPassedAt) practice.testPassedAt = null;
  if (practice.specialization !== undefined) delete input.specialization;
  const videoFee = input.videoFee === undefined ? current.videoFee : input.videoFee;
  const audioFee = input.audioFee === undefined ? current.audioFee : input.audioFee;
  if (current.acceptsConsultations && videoFee === null && audioFee === null) throw new HttpError(400, "Keep a fee for video or phone calls while you are taking consultations");

  await prisma.$transaction(async (tx) => {
    await tx.doctorProfile.update({ where: { id: doctorId }, data: { ...input, ...practice, ...(bankAccountNumber ? { bankAccountNumber } : {}) } });
    if (email !== undefined) await tx.user.update({ where: { id: req.user!.id }, data: { email } });
    // a new stream or specialization may come with its own test: consultations pause until it is passed
    if (retest) {
      const state = await onboardingOf(tx, doctorId);
      if (state?.testRequired && !state.testPassed && current.acceptsConsultations) {
        await tx.doctorProfile.update({ where: { id: doctorId }, data: { acceptsConsultations: false } });
      }
    }
  });
  res.json({ ok: true, testRequired: retest ? (await onboardingOf(prisma, doctorId))?.testRequired ?? false : undefined });
});

// ─────────────────────────────────────────────── buying at wholesale prices

const NOT_COUNTED = ["CANCELLED", "RETURNED", "REFUNDED"] as const;

doctorPanelRoutes.get("/wholesale", async (req, res) => {
  const account = await prisma.b2BAccount.findUnique({
    where: { userId: req.user!.id },
    select: {
      id: true, status: true, businessName: true, gstNumber: true, creditLimit: true, creditDays: true, rejectionReason: true,
      priceTier: { select: { name: true, defaultDiscountPercent: true } },
    },
  });
  if (!account) return res.json({ account: null, stats: null, orders: [] });

  const counted = { b2bAccountId: account.id, status: { notIn: [...NOT_COUNTED] } };
  const [spent, owed, orders] = await Promise.all([
    prisma.order.aggregate({ where: counted, _sum: { grandTotal: true, discountTotal: true }, _count: true }),
    prisma.order.aggregate({ where: { ...counted, paymentMethod: "CREDIT", paymentStatus: { in: ["PENDING", "PARTIALLY_PAID"] } }, _sum: { grandTotal: true } }),
    prisma.order.findMany({
      where: { b2bAccountId: account.id }, orderBy: { placedAt: "desc" }, take: 100,
      select: { id: true, orderNumber: true, status: true, paymentMethod: true, paymentStatus: true, grandTotal: true, placedAt: true, _count: { select: { items: true } } },
    }),
  ]);
  res.json({
    account: {
      status: account.status, businessName: account.businessName, gstNumber: account.gstNumber, rejectionReason: account.rejectionReason,
      tier: account.priceTier?.name ?? null, discountPercent: account.priceTier ? num(account.priceTier.defaultDiscountPercent) : null,
      creditLimit: num(account.creditLimit), creditDays: account.creditDays, creditUsed: num(owed._sum.grandTotal),
    },
    stats: { orders: spent._count, spent: num(spent._sum.grandTotal), saved: num(spent._sum.discountTotal) },
    orders: orders.map(({ _count, ...o }) => ({ ...o, grandTotal: num(o.grandTotal), items: _count.items })),
  });
});

// A doctor who registered only to consult can ask for wholesale prices later.
// A verified doctor gets them straight away; otherwise they start with the verification.
doctorPanelRoutes.post("/wholesale/request", async (req, res) => {
  const existing = await prisma.b2BAccount.findUnique({ where: { userId: req.user!.id }, select: { status: true } });
  if (existing?.status === "SUSPENDED" || existing?.status === "REJECTED") throw new HttpError(400, "Your wholesale account was switched off. Please contact us to turn it back on.");
  if (existing) throw new HttpError(400, "You already have a wholesale account");
  await prisma.$transaction((tx) => setWholesale(tx, req.doctorId!, true, req.user!.id));
  res.status(201).json({ ok: true });
});

// ─────────────────────────────────────────────── onboarding: steps, test questions, level

const MAX_TESTS_A_DAY = 3;

doctorPanelRoutes.get("/onboarding", async (req, res) => {
  const doctorId = req.doctorId!;
  const [state, profile, attempts] = await Promise.all([
    onboardingOf(prisma, doctorId),
    prisma.doctorProfile.findUnique({
      where: { id: doctorId },
      select: { submittedAt: true, verifiedAt: true, testPassedAt: true, rejectionReason: true, tier: { select: { name: true, minPatientsPerDay: true, maxPatientsPerDay: true, commissionPercent: true, description: true } } },
    }),
    prisma.doctorTestAttempt.findMany({ where: { doctorId, submittedAt: { not: null } }, orderBy: { startedAt: "desc" }, take: 10, select: { id: true, score: true, total: true, passed: true, submittedAt: true } }),
  ]);
  if (!state || !profile) throw notFound("Doctor");
  const today = await prisma.doctorTestAttempt.count({ where: { doctorId, startedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } });
  res.json({
    ...state,
    submittedAt: profile.submittedAt, verifiedAt: profile.verifiedAt, testPassedAt: profile.testPassedAt, rejectionReason: profile.rejectionReason,
    tier: profile.tier ? { ...profile.tier, commissionPercent: num(profile.tier.commissionPercent) } : null,
    attempts,
    triesLeftToday: Math.max(0, MAX_TESTS_A_DAY - today),
  });
});

// Starts a sitting: a random set of the stream's questions, without the answers.
doctorPanelRoutes.post("/test/start", async (req, res) => {
  const doctorId = req.doctorId!;
  const state = await onboardingOf(prisma, doctorId);
  if (!state) throw notFound("Doctor");
  if (!state.testRequired || !state.stream) throw new HttpError(400, "There is no test for your stream right now");
  if (state.testPassed) throw new HttpError(400, "You have already passed the test");
  const recent = await prisma.doctorTestAttempt.count({ where: { doctorId, startedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } });
  if (recent >= MAX_TESTS_A_DAY) throw new HttpError(429, "You have used today's tries. Please come back tomorrow.");

  const all = await prisma.streamQuestion.findMany({ where: testQuestionsWhere(state.stream.id, state.specialization?.id ?? null), select: { id: true, question: true, options: true } });
  // shuffle, then take as many as the stream asks for
  for (let i = all.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [all[i], all[j]] = [all[j], all[i]];
  }
  const asked = all.slice(0, Math.max(1, state.stream.questionsPerTest));
  const attempt = await prisma.doctorTestAttempt.create({ data: { doctorId, streamId: state.stream.id, questionIds: asked.map((q) => q.id), total: asked.length } });
  res.status(201).json({ attemptId: attempt.id, stream: state.stream.name, passPercent: state.stream.passPercent, questions: asked });
});

doctorPanelRoutes.post("/test/:id/submit", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { answers } = z.object({ answers: z.record(z.string(), z.number().int().min(0).max(10)) }).parse(req.body);
  const doctorId = req.doctorId!;
  const attempt = await prisma.doctorTestAttempt.findFirst({ where: { id, doctorId }, include: { stream: { select: { passPercent: true } } } });
  if (!attempt) throw notFound("Test");
  if (attempt.submittedAt) throw new HttpError(400, "This test has already been handed in");

  const questions = await prisma.streamQuestion.findMany({ where: { id: { in: attempt.questionIds } }, select: { id: true, correctIndex: true } });
  const score = questions.filter((q) => answers[String(q.id)] === q.correctIndex).length;
  const passed = attempt.total > 0 && (score / attempt.total) * 100 >= attempt.stream.passPercent;

  const consulting = await prisma.$transaction(async (tx) => {
    await tx.doctorTestAttempt.update({ where: { id }, data: { answers, score, passed, submittedAt: new Date() } });
    if (!passed) return false;
    await tx.doctorProfile.update({ where: { id: doctorId }, data: { testPassedAt: new Date() } });
    // a new doctor starts on the first level
    const profile = await tx.doctorProfile.findUnique({ where: { id: doctorId }, select: { tierId: true } });
    if (!profile?.tierId) {
      const first = await tx.doctorTier.findFirst({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
      if (first) await tx.doctorProfile.update({ where: { id: doctorId }, data: { tierId: first.id, commissionPercent: first.commissionPercent } });
    }
    return settleConsulting(tx, doctorId);
  });
  if (passed) events.doctorTestPassed(doctorId, `${score} out of ${attempt.total}`);
  res.json({ score, total: attempt.total, passed, passPercent: attempt.stream.passPercent, consultingOn: consulting });
});

// ─────────────────────────────────────────────── what patients said

doctorPanelRoutes.get("/reviews", async (req, res) => {
  const doctorId = req.doctorId!;
  const [reviews, grouped, profile] = await Promise.all([
    prisma.doctorReview.findMany({
      where: { doctorId, status: "APPROVED" }, orderBy: { createdAt: "desc" }, take: 100,
      select: { id: true, rating: true, comment: true, createdAt: true, appointment: { select: { patientName: true, appointmentNumber: true } } },
    }),
    prisma.doctorReview.groupBy({ by: ["rating"], where: { doctorId, status: "APPROVED" }, _count: true }),
    prisma.doctorProfile.findUnique({ where: { id: doctorId }, select: { ratingAverage: true, ratingCount: true } }),
  ]);
  res.json({
    average: num(profile?.ratingAverage), count: profile?.ratingCount ?? 0,
    stars: [5, 4, 3, 2, 1].map((rating) => ({ rating, count: grouped.find((g) => g.rating === rating)?._count ?? 0 })),
    items: reviews.map(({ appointment, ...r }) => ({ ...r, patientName: appointment.patientName, appointmentNumber: appointment.appointmentNumber })),
  });
});

// ─────────────────────────────────────────────── numbers for a chosen period

const rangeQuery = z.object({ from: isoDay.optional(), to: isoDay.optional(), tz: zoneParam });
const percentChange = (current: number, previous: number) => (previous === 0 ? null : Math.round(((current - previous) / previous) * 1000) / 10);

/** What happened in the doctor's practice between two instants. */
const periodTotals = async (doctorId: number, from: Date, to: Date) => {
  const [done, booked, missed, patients] = await Promise.all([
    prisma.appointment.aggregate({ where: { doctorId, status: "COMPLETED", completedAt: { gte: from, lt: to } }, _sum: { doctorEarning: true, fee: true }, _count: true }),
    prisma.appointment.count({ where: { doctorId, scheduledAt: { gte: from, lt: to }, status: { in: ["CONFIRMED", "IN_PROGRESS", "COMPLETED", "NO_SHOW"] } } }),
    prisma.appointment.count({ where: { doctorId, scheduledAt: { gte: from, lt: to }, OR: [{ status: "NO_SHOW" }, { status: "CANCELLED", OR: [{ cancelledBy: null }, { cancelledBy: { not: "SYSTEM" } }] }] } }),
    prisma.appointment.groupBy({ by: ["patientId", "patientName"], where: { doctorId, status: "COMPLETED", completedAt: { gte: from, lt: to } } }),
  ]);
  return { earned: num(done._sum.doctorEarning), fees: num(done._sum.fee), consultations: done._count, booked, missed, patients: patients.length };
};

// Earnings, consultations and bookings for Today / 7 days / 30 days / … or any two dates,
// each with its change against the period just before, and a day-by-day (or month-by-month) series.
doctorPanelRoutes.get("/stats", async (req, res) => {
  const doctorId = req.doctorId!;
  const query = rangeQuery.parse(req.query);
  const zone = query.tz;
  const toDay = query.to ?? dayInZone(new Date(), zone);
  const fromDay = query.from ?? addDays(toDay, -29);
  if (fromDay > toDay) throw new HttpError(400, "The first day is after the last day");
  const from = zoneDayStart(fromDay, zone);
  const to = zoneDayStart(addDays(toDay, 1), zone); // exclusive
  const days = daysBetween(fromDay, toDay) + 1;
  const previousFrom = zoneDayStart(addDays(fromDay, -days), zone);
  const unit = days <= 92 ? "day" : "month";

  const first = await prisma.appointment.aggregate({ where: { doctorId }, _min: { scheduledAt: true, createdAt: true } });
  const firstAt = [first._min.scheduledAt, first._min.createdAt].filter((d): d is Date => d !== null).sort((a, b) => a.getTime() - b.getTime())[0];
  const firstDay = firstAt ? dayInZone(firstAt, zone) : toDay;
  // the period before must lie wholly after the first appointment, or the comparison means nothing
  const comparable = addDays(fromDay, -days) >= firstDay;

  const [current, previous, rows] = await Promise.all([
    periodTotals(doctorId, from, to),
    periodTotals(doctorId, previousFrom, from),
    prisma.$queryRaw<{ bucket: Date; earned: number; consultations: number }[]>`
      SELECT date_trunc(${unit}, ("completedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${zone}) AS bucket,
             coalesce(sum("doctorEarning"), 0)::float8 AS earned, count(*)::int AS consultations
      FROM "Appointment"
      WHERE "doctorId" = ${doctorId} AND status = 'COMPLETED' AND "completedAt" >= ${from} AND "completedAt" < ${to}
      GROUP BY 1 ORDER BY 1`,
  ]);

  // every day (or month) of the period, including the ones with nothing earned
  const found = new Map(rows.map((row) => [row.bucket.toISOString().slice(0, unit === "day" ? 10 : 7), row]));
  const series: { date: string; earned: number; consultations: number }[] = [];
  if (unit === "day") {
    for (let day = fromDay; day <= toDay; day = addDays(day, 1)) series.push({ date: day, earned: found.get(day)?.earned ?? 0, consultations: found.get(day)?.consultations ?? 0 });
  } else {
    for (let month = fromDay.slice(0, 7); month <= toDay.slice(0, 7); ) {
      series.push({ date: `${month}-01`, earned: found.get(month)?.earned ?? 0, consultations: found.get(month)?.consultations ?? 0 });
      const next = new Date(`${month}-01T00:00:00Z`);
      next.setUTCMonth(next.getUTCMonth() + 1);
      month = next.toISOString().slice(0, 7);
    }
  }

  const metric = (key: keyof typeof current) => ({ value: current[key], change: comparable ? percentChange(current[key], previous[key]) : null });
  res.json({
    range: { from: fromDay, to: toDay, unit, firstDay },
    totals: { earned: metric("earned"), consultations: metric("consultations"), booked: metric("booked"), missed: metric("missed"), patients: metric("patients") },
    averagePerConsultation: current.consultations ? Math.round((current.earned / current.consultations) * 100) / 100 : 0,
    series,
  });
});
