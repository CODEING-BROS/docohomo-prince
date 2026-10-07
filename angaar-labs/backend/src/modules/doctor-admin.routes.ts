import { Router } from "express";
import { z } from "zod";
import { DocumentType, type Prisma } from "../generated/prisma/client";
import { HttpError, idParam, notFound, num, numOrNull } from "../lib/http";
import { prisma } from "../lib/prisma";
import { slotsForDay } from "../lib/slots";
import { htmlToText } from "../lib/text";

// A doctor's full record in the admin: registering one by hand, editing, reviewing documents,
// working hours, and the two switches (consultations, wholesale buying).
// One doctor has one account. Verification happens once; the switches decide what they can do.
// Mounted at /api/admin/doctors next to the list and verification routes.
export const doctorAdminRoutes = Router();

type Tx = Prisma.TransactionClient;

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const text = (max: number) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable().optional());
const optionalNumber = (max: number) => z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), z.coerce.number().min(0).max(max).nullable().optional());
const imageAddress = z.union([z.url(), z.string().regex(/^\/uploads\/[\w./-]+$/)]);

const documentInput = z.object({
  type: z.enum(DocumentType),
  fileUrl: z.string().regex(/^\/uploads\/documents\/[\w.-]+$/, "Upload the document again"),
  fileName: text(200),
});

const doctorInput = z.object({
  displayName: z.string().trim().min(2, "Enter the doctor's name").max(120),
  phone: z.preprocess(emptyToNull, z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number").nullable().optional()),
  email: z.preprocess(emptyToNull, z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")).nullable().optional()),
  photoUrl: z.preprocess(emptyToNull, imageAddress.nullable().optional()),
  stream: text(60),
  qualification: text(160),
  specialization: text(200),
  // which of the stream's specializations: patients are matched by it and the test is built for it
  specializationId: z.preprocess((v) => (v === "" || v === undefined ? null : v), z.coerce.number().int().positive().nullable()),
  experienceYears: optionalNumber(80),
  languages: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  bio: z.preprocess((v) => emptyToNull(typeof v === "string" ? htmlToText(v) : v), z.string().max(5000).nullable().optional()),
  registrationNumber: text(60),
  registrationCouncil: text(160),
  registrationYear: z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), z.coerce.number().int().min(1950).max(2100).nullable().optional()),
  clinicName: text(160),
  clinicAddress: text(300),
  clinicCity: text(80),
  clinicState: text(80),
  clinicPincode: z.preprocess(emptyToNull, z.string().regex(/^\d{6}$/, "A pincode has 6 digits").nullable().optional()),
  videoFee: optionalNumber(100_000),
  audioFee: optionalNumber(100_000),
  slotMinutes: z.coerce.number().int().min(5).max(120).default(15),
  commissionPercent: z.coerce.number().min(0).max(90).default(20),
  consulting: z.boolean().default(false), // offers consultations on the platform
  wholesale: z.boolean().default(false), // can buy at wholesale prices
});

const createInput = doctorInput.extend({ approveNow: z.boolean().default(false), documents: z.array(documentInput).max(12).default([]) });

const slugify = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "doctor";
const freeSlug = async (name: string) => {
  const base = slugify(name);
  let slug = base;
  for (let n = 2; await prisma.doctorProfile.findUnique({ where: { slug }, select: { id: true } }); n++) slug = `${base}-${n}`;
  return slug;
};

/**
 * Turns wholesale buying on or off for a doctor. On: opens (or reopens) their B2B account, approved
 * only if the doctor is verified. Off: pauses the account; nothing is deleted.
 */
export const setWholesale = async (tx: Tx, doctorId: number, on: boolean, staffId: number) => {
  const doctor = await tx.doctorProfile.findUnique({ where: { id: doctorId }, include: { user: { include: { b2bAccount: true } } } });
  if (!doctor) return;
  const account = doctor.user.b2bAccount;
  const verified = doctor.verificationStatus === "APPROVED";

  if (!on) {
    if (account && account.status !== "SUSPENDED" && account.status !== "REJECTED") {
      await tx.b2BAccount.update({ where: { id: account.id }, data: { status: "SUSPENDED", rejectionReason: "Wholesale buying switched off" } });
    }
    return;
  }
  const status = verified ? ("APPROVED" as const) : ("PENDING" as const);
  const approval = verified ? { approvedAt: new Date(), approvedById: staffId, rejectionReason: null } : {};
  if (account) {
    await tx.b2BAccount.update({ where: { id: account.id }, data: { status, ...approval } });
    return;
  }
  const tier = await tx.priceTier.findUnique({ where: { name: "Doctor" }, select: { id: true } });
  const created = await tx.b2BAccount.create({
    data: {
      userId: doctor.userId, type: "DOCTOR", businessName: doctor.clinicName ?? doctor.displayName, contactName: doctor.displayName,
      contactPhone: doctor.user.phone, contactEmail: doctor.user.email, qualification: doctor.qualification,
      registrationNumber: doctor.registrationNumber, registrationCouncil: doctor.registrationCouncil,
      addressLine: doctor.clinicAddress, city: doctor.clinicCity, state: doctor.clinicState, pincode: doctor.clinicPincode,
      priceTierId: tier?.id ?? null, status, ...approval,
    },
  });
  // the doctor's proofs also count for the wholesale account
  await tx.verificationDocument.updateMany({ where: { doctorProfileId: doctorId, b2bAccountId: null }, data: { b2bAccountId: created.id } });
};

/** The chosen specialization must belong to the doctor's stream. Gives back its name, used when staff typed no description. */
const specializationFor = async (input: z.infer<typeof doctorInput>) => {
  if (input.specializationId === null) return null;
  const found = await prisma.streamSpecialization.findFirst({ where: { id: input.specializationId, stream: { name: input.stream ?? "" } }, select: { id: true, name: true } });
  if (!found) throw new HttpError(400, "Choose a specialization from this doctor's stream");
  return found;
};

const profileData = (input: z.infer<typeof doctorInput>, verified: boolean, chosen: { id: number; name: string } | null) => ({
  displayName: input.displayName, photoUrl: input.photoUrl, stream: input.stream, qualification: input.qualification,
  specializationId: chosen?.id ?? null,
  // what patients read: staff's own words when given, otherwise the name of the specialization
  specialization: input.specialization ?? chosen?.name ?? null, experienceYears: input.experienceYears, languages: input.languages, bio: input.bio,
  registrationNumber: input.registrationNumber, registrationCouncil: input.registrationCouncil, registrationYear: input.registrationYear,
  clinicName: input.clinicName, clinicAddress: input.clinicAddress, clinicCity: input.clinicCity, clinicState: input.clinicState, clinicPincode: input.clinicPincode,
  videoFee: input.videoFee, audioFee: input.audioFee, slotMinutes: input.slotMinutes, commissionPercent: input.commissionPercent,
  // patients only ever see a doctor who is verified AND accepting; isListed remembers the wish until then
  acceptsConsultations: input.consulting && verified,
  isListed: input.consulting,
});

// ─────────────────────────────────────────────── register a doctor by hand

doctorAdminRoutes.post("/", async (req, res) => {
  const input = createInput.parse(req.body);
  if (!input.registrationNumber) throw new HttpError(400, "Enter the medical registration number");
  if (!input.phone) throw new HttpError(400, "Enter the doctor's mobile number; they sign in with it");

  const existing = await prisma.user.findUnique({ where: { phone: input.phone }, select: { id: true, doctorProfile: { select: { id: true } } } });
  if (existing?.doctorProfile) throw new HttpError(400, "A doctor is already registered with this mobile number");
  const slug = await freeSlug(input.displayName);
  const now = new Date();
  const chosen = await specializationFor(input);

  const doctor = await prisma.$transaction(async (tx) => {
    const userId = existing
      ? (await tx.user.update({ where: { id: existing.id }, data: { role: "DOCTOR", email: input.email ?? undefined }, select: { id: true } })).id
      : (await tx.user.create({ data: { role: "DOCTOR", firstName: input.displayName, phone: input.phone, email: input.email }, select: { id: true } })).id;

    const created = await tx.doctorProfile.create({
      data: {
        userId, slug, ...profileData(input, input.approveNow, chosen),
        verificationStatus: input.approveNow ? "APPROVED" : "PENDING",
        submittedAt: now, verifiedAt: input.approveNow ? now : null, verifiedById: input.approveNow ? req.user!.id : null,
        documents: {
          create: input.documents.map((doc) => ({
            ...doc, status: input.approveNow ? ("APPROVED" as const) : ("PENDING" as const),
            reviewedById: input.approveNow ? req.user!.id : null, reviewedAt: input.approveNow ? now : null,
          })),
        },
      },
    });
    if (input.wholesale) await setWholesale(tx, created.id, true, req.user!.id);
    await tx.auditLog.create({ data: { actorId: req.user!.id, action: "doctor.create", entity: "DoctorProfile", entityId: String(created.id) } });
    return created;
  });

  res.status(201).json({ id: doctor.id });
});

// ─────────────────────────────────────────────── one doctor, in full

doctorAdminRoutes.get("/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const doctor = await prisma.doctorProfile.findUnique({
    where: { id },
    include: {
      user: { select: { phone: true, email: true, b2bAccount: { select: { id: true, status: true, priceTier: { select: { name: true } } } } } },
      documents: { orderBy: { createdAt: "asc" } },
      availability: { orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] },
      timeOff: { where: { endsAt: { gte: new Date() } }, orderBy: { startsAt: "asc" } },
      _count: { select: { appointments: true, prescriptions: true } },
    },
  });
  if (!doctor) throw notFound("Doctor");

  const { user, _count, ...profile } = doctor;
  res.json({
    ...profile,
    experienceYears: numOrNull(profile.experienceYears), videoFee: numOrNull(profile.videoFee), audioFee: numOrNull(profile.audioFee),
    chatFee: numOrNull(profile.chatFee), inClinicFee: numOrNull(profile.inClinicFee), commissionPercent: num(profile.commissionPercent),
    ratingAverage: num(profile.ratingAverage),
    phone: user.phone, email: user.email,
    consulting: profile.acceptsConsultations,
    wholesale: user.b2bAccount ? { id: user.b2bAccount.id, status: user.b2bAccount.status, tier: user.b2bAccount.priceTier?.name ?? null } : null,
    appointmentCount: _count.appointments, prescriptionCount: _count.prescriptions,
  });
});

doctorAdminRoutes.patch("/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const input = doctorInput.parse(req.body);
  const doctor = await prisma.doctorProfile.findUnique({ where: { id }, include: { user: { select: { id: true, phone: true } } } });
  if (!doctor) throw notFound("Doctor");
  if (input.phone && input.phone !== doctor.user.phone && (await prisma.user.findUnique({ where: { phone: input.phone }, select: { id: true } }))) {
    throw new HttpError(400, "Someone else is registered with this mobile number");
  }
  const verified = doctor.verificationStatus === "APPROVED";
  if (input.consulting && !verified) throw new HttpError(400, "Verify the doctor's registration before switching consultations on");
  const chosen = await specializationFor(input);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: doctor.user.id }, data: { firstName: input.displayName, phone: input.phone ?? null, email: input.email ?? null } });
    await tx.doctorProfile.update({ where: { id }, data: profileData(input, verified, chosen) });
    await setWholesale(tx, id, input.wholesale, req.user!.id);
    await tx.auditLog.create({ data: { actorId: req.user!.id, action: "doctor.update", entity: "DoctorProfile", entityId: String(id) } });
  });
  res.json({ id });
});

// Flip one switch without sending the whole form.
doctorAdminRoutes.patch("/:id/switches", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { consulting, wholesale } = z.object({ consulting: z.boolean().optional(), wholesale: z.boolean().optional() }).parse(req.body);
  const doctor = await prisma.doctorProfile.findUnique({ where: { id }, select: { verificationStatus: true } });
  if (!doctor) throw notFound("Doctor");
  if (doctor.verificationStatus !== "APPROVED" && (consulting || wholesale)) {
    throw new HttpError(400, "Verify the doctor's registration first");
  }
  await prisma.$transaction(async (tx) => {
    if (consulting !== undefined) await tx.doctorProfile.update({ where: { id }, data: { acceptsConsultations: consulting, isListed: consulting } });
    if (wholesale !== undefined) await setWholesale(tx, id, wholesale, req.user!.id);
    await tx.auditLog.create({ data: { actorId: req.user!.id, action: "doctor.switches", entity: "DoctorProfile", entityId: String(id), changes: { consulting, wholesale } } });
  });
  res.json({ ok: true });
});

// ─────────────────────────────────────────────── documents

doctorAdminRoutes.post("/:id/documents", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const input = documentInput.parse(req.body);
  const doctor = await prisma.doctorProfile.findUnique({ where: { id }, select: { user: { select: { b2bAccount: { select: { id: true } } } } } });
  if (!doctor) throw notFound("Doctor");
  const document = await prisma.verificationDocument.create({ data: { ...input, doctorProfileId: id, b2bAccountId: doctor.user.b2bAccount?.id ?? null } });
  res.status(201).json(document);
});

doctorAdminRoutes.patch("/:id/documents/:documentId", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { documentId } = z.object({ documentId: z.coerce.number().int().positive() }).parse(req.params);
  const { status, remarks } = z.object({ status: z.enum(["APPROVED", "REJECTED", "PENDING"]), remarks: text(300) }).parse(req.body);
  if (status === "REJECTED" && !remarks) throw new HttpError(400, "Say what is wrong with the document");
  const document = await prisma.verificationDocument.findFirst({ where: { id: documentId, doctorProfileId: id }, select: { id: true } });
  if (!document) throw notFound("Document");
  await prisma.verificationDocument.update({
    where: { id: documentId },
    data: { status, remarks: status === "REJECTED" ? remarks : null, reviewedById: req.user!.id, reviewedAt: new Date() },
  });
  res.json({ ok: true });
});

// ─────────────────────────────────────────────── working hours and slots

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 10:00");
const hoursInput = z.object({
  slotMinutes: z.coerce.number().int().min(5).max(120),
  hours: z
    .array(z.object({ dayOfWeek: z.number().int().min(0).max(6), startTime: clock, endTime: clock, mode: z.enum(["VIDEO", "AUDIO", "CHAT", "IN_CLINIC"]).default("VIDEO") }))
    .max(60),
});

// Replaces the doctor's weekly working hours.
doctorAdminRoutes.put("/:id/availability", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { slotMinutes, hours } = hoursInput.parse(req.body);
  if (!(await prisma.doctorProfile.findUnique({ where: { id }, select: { id: true } }))) throw notFound("Doctor");

  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  for (const window of hours) {
    if (window.endTime <= window.startTime) throw new HttpError(400, `${DAYS[window.dayOfWeek]}: the end time must be after the start time`);
  }
  for (let day = 0; day < 7; day++) {
    const sameDay = hours.filter((h) => h.dayOfWeek === day).sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (let i = 1; i < sameDay.length; i++) {
      if (sameDay[i].startTime < sameDay[i - 1].endTime) throw new HttpError(400, `${DAYS[day]}: two of the time ranges overlap`);
    }
  }

  await prisma.$transaction([
    prisma.doctorAvailability.deleteMany({ where: { doctorId: id } }),
    prisma.doctorAvailability.createMany({ data: hours.map((h) => ({ ...h, doctorId: id })) }),
    prisma.doctorProfile.update({ where: { id }, data: { slotMinutes } }),
  ]);
  res.json({ ok: true });
});

// The slots a patient could book on one day.
doctorAdminRoutes.get("/:id/slots", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { date } = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(req.query);
  res.json({ date, slots: await slotsForDay(id, date) });
});

const timeOffInput = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reason: text(200) });

// Whole days the doctor is away.
doctorAdminRoutes.post("/:id/time-off", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { from, to, reason } = timeOffInput.parse(req.body);
  if (to < from) throw new HttpError(400, "The last day is before the first day");
  if (!(await prisma.doctorProfile.findUnique({ where: { id }, select: { id: true } }))) throw notFound("Doctor");
  const created = await prisma.doctorTimeOff.create({
    data: { doctorId: id, startsAt: new Date(`${from}T00:00:00+05:30`), endsAt: new Date(`${to}T23:59:59+05:30`), reason },
  });
  res.status(201).json(created);
});

doctorAdminRoutes.delete("/:id/time-off/:timeOffId", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { timeOffId } = z.object({ timeOffId: z.coerce.number().int().positive() }).parse(req.params);
  await prisma.doctorTimeOff.deleteMany({ where: { id: timeOffId, doctorId: id } });
  res.json({ ok: true });
});
