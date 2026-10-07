import { matchDoctors, matchInput, recordMatch, suggestSpecializations } from "../lib/doctor-match";
import * as events from "../lib/events";
import { Router } from "express";
import { z } from "zod";
import { newAppointmentNumber, newOrderNumber, payForAppointment } from "../lib/consult";
import { HttpError, idParam, notFound, num, numOrNull, optionalString } from "../lib/http";
import { paymentsMode, startPayment } from "../lib/payments";
import { shippingFor } from "../lib/pricing";
import { prisma } from "../lib/prisma";
import { nextFreeSlots, slotsForDay } from "../lib/slots";
import { MAX_FILES_PER_BOOKING, attachFiles, fileSelect } from "./consultation-files.routes";

// The patient side of consultations.
//   careRoutes     /api/care   public: find a doctor, see free slots
//   patientRoutes  /api/me     signed in: book and pay, appointments, prescriptions, order medicines
export const careRoutes = Router();
export const patientRoutes = Router();

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const publicDoctor = {
  id: true, slug: true, displayName: true, photoUrl: true, qualification: true, specialization: true, experienceYears: true,
  languages: true, bio: true, clinicCity: true, videoFee: true, audioFee: true, slotMinutes: true, ratingAverage: true, ratingCount: true,
} as const;

type PublicDoctor = { experienceYears: unknown; videoFee: unknown; audioFee: unknown; ratingAverage: unknown };
const shape = <T extends PublicDoctor>(d: T) => ({
  ...d, experienceYears: numOrNull(d.experienceYears), videoFee: numOrNull(d.videoFee), audioFee: numOrNull(d.audioFee), ratingAverage: num(d.ratingAverage),
});

// only verified doctors who have consultations switched on are shown
const BOOKABLE = { verificationStatus: "APPROVED", acceptsConsultations: true, isListed: true } as const;

// The consulting streams a doctor can register under, with which ones are open.
careRoutes.get("/streams", async (_req, res) => {
  const streams = await prisma.consultingStream.findMany({
    where: { isActive: true, status: { not: "CLOSED" } }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { name: true, status: true, description: true, specializations: { where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, description: true } } },
  });
  res.json({ items: streams });
});

// ─────────────────────────────────────────────── guided booking

// The symptoms a patient can tap, and the specializations of the streams that are open.
careRoutes.get("/symptoms", async (_req, res) => {
  const specializations = await prisma.streamSpecialization.findMany({
    where: { isActive: true, stream: { isActive: true, status: "OPEN" } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, description: true, symptoms: true, isGeneral: true },
  });
  const seenSymptom = new Set<string>();
  const symptoms: string[] = [];
  for (const s of specializations) for (const raw of s.symptoms) {
    const label = raw.trim();
    if (label && !seenSymptom.has(label.toLowerCase())) { seenSymptom.add(label.toLowerCase()); symptoms.push(label); }
  }
  res.json({ symptoms, specializations: specializations.map(({ symptoms: own, ...s }) => ({ ...s, symptomCount: own.length })) });
});

// Which specialization the symptoms point at; the patient can still choose another.
careRoutes.post("/suggest-specialization", async (req, res) => {
  const input = z.object({ symptoms: z.array(z.string().trim().max(80)).max(20).default([]), problem: z.string().trim().max(2000).default("") }).parse(req.body);
  res.json(await suggestSpecializations(input.symptoms, input.problem));
});

careRoutes.get("/doctors", async (req, res) => {
  const { q } = z.object({ q: optionalString }).parse(req.query);
  const doctors = await prisma.doctorProfile.findMany({
    where: {
      ...BOOKABLE,
      availability: { some: { isActive: true } }, // a doctor with no working hours has no slot to book
      ...(q ? { OR: [{ displayName: { contains: q, mode: "insensitive" } }, { specialization: { contains: q, mode: "insensitive" } }, { languages: { has: q } }] } : {}),
    },
    orderBy: [{ ratingAverage: "desc" }, { experienceYears: "desc" }],
    select: publicDoctor,
  });
  res.json({ items: doctors.map(shape) });
});

careRoutes.get("/doctors/:slug", async (req, res) => {
  const doctor = await prisma.doctorProfile.findFirst({
    where: { slug: String(req.params.slug), ...BOOKABLE },
    select: { ...publicDoctor, availability: { where: { isActive: true }, select: { dayOfWeek: true, startTime: true, endTime: true } } },
  });
  if (!doctor) throw notFound("Doctor");
  res.json(shape(doctor));
});

careRoutes.get("/doctors/:slug/slots", async (req, res) => {
  const { date } = z.object({ date: isoDay }).parse(req.query);
  const doctor = await prisma.doctorProfile.findFirst({ where: { slug: String(req.params.slug), ...BOOKABLE }, select: { id: true } });
  if (!doctor) throw notFound("Doctor");
  res.json({ date, slots: await slotsForDay(doctor.id, date) });
});

// The time the system offers for this doctor: the next free slot, or the one after a slot the patient could not make.
careRoutes.get("/doctors/:slug/next-slot", async (req, res) => {
  const { after } = z.object({ after: z.iso.datetime().optional() }).parse(req.query);
  const doctor = await prisma.doctorProfile.findFirst({ where: { slug: String(req.params.slug), ...BOOKABLE }, select: { id: true } });
  if (!doctor) throw notFound("Doctor");
  const [slot] = await nextFreeSlots(doctor.id, after ? new Date(after) : new Date(), 1);
  res.json({ slot: slot ?? null });
});

// ─────────────────────────────────────────────── my account

patientRoutes.patch("/profile", async (req, res) => {
  const input = z
    .object({
      firstName: z.string().trim().min(1, "Enter your name").max(80),
      lastName: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(80).nullable().optional()),
      email: z.preprocess((v) => (v === "" ? null : v), z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")).nullable().optional()),
      gender: z.preprocess((v) => (v === "" ? null : v), z.enum(["MALE", "FEMALE", "OTHER"]).nullable().optional()),
      dateOfBirth: z.preprocess((v) => (v === "" ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date").nullable().optional()),
    })
    .parse(req.body);
  const { dateOfBirth, ...rest } = input;
  if (dateOfBirth && new Date(dateOfBirth) > new Date()) throw new HttpError(400, "The date of birth cannot be in the future");
  await prisma.user.update({
    where: { id: req.user!.id },
    data: { ...rest, ...(dateOfBirth === undefined ? {} : { dateOfBirth: dateOfBirth ? new Date(`${dateOfBirth}T00:00:00Z`) : null }) },
  });
  res.json({ ok: true });
});

// ─────────────────────────────────────────────── appointments

// The two or three doctors to show, and a record of having shown them.
patientRoutes.post("/match", async (req, res) => {
  const input = matchInput.parse(req.body);
  const result = await matchDoctors(input, req.user!.id);
  const sessionId = result.items.length ? await recordMatch(req.user!.id, input, result) : null;
  res.json({ sessionId, ...result });
});

// The patient opened one of the suggested doctors.
patientRoutes.post("/match/:id/opened", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { doctorId } = z.object({ doctorId: z.coerce.number().int().positive() }).parse(req.body);
  const shown = await prisma.matchEvent.findFirst({ where: { sessionId: id, doctorId, type: "IMPRESSION", session: { userId: req.user!.id } }, select: { position: true, reason: true } });
  if (shown) await prisma.matchEvent.create({ data: { sessionId: id, doctorId, type: "CLICK", position: shown.position, reason: shown.reason } });
  res.json({ ok: true });
});

// what the patient told us on the way to booking; kept with the appointment for the doctor
const intakeInput = z.object({
  relation: z.enum(["SELF", "FAMILY", "CHILD"]).optional(),
  city: z.string().trim().max(80).optional(),
  language: z.string().trim().max(200).optional(), // the languages they chose, as words
  symptoms: z.array(z.string().trim().max(80)).max(20).optional(),
  duration: z.string().trim().max(60).optional(),
  severity: z.enum(["MILD", "MODERATE", "SEVERE"]).optional(),
  conditions: z.string().trim().max(500).optional(),
  diagnosis: z.string().trim().max(500).optional(),
  medications: z.string().trim().max(500).optional(),
  specialization: z.string().trim().max(80).optional(),
}).optional();

const bookInput = z.object({
  fileIds: z.array(z.coerce.number().int().positive()).max(MAX_FILES_PER_BOOKING).default([]),
  intake: intakeInput,
  matchSessionId: z.coerce.number().int().positive().optional(),
  doctorId: z.number().int().positive(),
  startsAt: z.iso.datetime(),
  mode: z.enum(["VIDEO", "AUDIO"]),
  patientName: z.string().trim().min(2, "Enter the patient's name").max(120),
  patientAge: z.coerce.number().int().min(0).max(120),
  patientGender: z.enum(["MALE", "FEMALE", "OTHER"]),
  symptoms: z.string().trim().min(5, "Describe the problem in a few words").max(2000),
});

// Holds a slot. It is confirmed once paid; an unpaid hold is dropped after 15 minutes.
patientRoutes.post("/appointments", async (req, res) => {
  const input = bookInput.parse(req.body);
  const doctor = await prisma.doctorProfile.findFirst({ where: { id: input.doctorId, ...BOOKABLE }, select: { id: true, videoFee: true, audioFee: true, slotMinutes: true } });
  if (!doctor) throw new HttpError(400, "This doctor is not taking consultations right now");

  const fee = input.mode === "VIDEO" ? doctor.videoFee : doctor.audioFee;
  if (fee === null) throw new HttpError(400, `This doctor does not offer ${input.mode === "VIDEO" ? "video" : "audio"} consultations`);

  // release holds that were never paid for, so they do not block the slot forever
  await prisma.appointment.updateMany({
    where: { doctorId: doctor.id, status: "PENDING_PAYMENT", createdAt: { lt: new Date(Date.now() - 15 * 60 * 1000) } },
    data: { status: "CANCELLED", cancelledBy: "SYSTEM", cancelReason: "Not paid in time" },
  });

  const startsAt = new Date(input.startsAt);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(startsAt);
  const slot = (await slotsForDay(doctor.id, day)).find((s) => s.startsAt === startsAt.toISOString());
  if (!slot) throw new HttpError(400, "That time is not one of the doctor's slots");
  if (!slot.available) throw new HttpError(409, `That slot is no longer free: ${slot.reason?.toLowerCase()}. Pick another one.`);

  const patient = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { phone: true } });
  // only a search this patient ran counts as where the booking came from
  const session = input.matchSessionId
    ? await prisma.matchSession.findFirst({ where: { id: input.matchSessionId, userId: req.user!.id }, select: { id: true, events: { where: { doctorId: doctor.id, type: "IMPRESSION" }, select: { position: true, reason: true }, take: 1 } } })
    : null;
  const appointment = await prisma.appointment.create({
    data: {
      appointmentNumber: await newAppointmentNumber(), doctorId: doctor.id, patientId: req.user!.id,
      patientName: input.patientName, patientAge: input.patientAge, patientGender: input.patientGender, patientPhone: patient?.phone,
      mode: input.mode, scheduledAt: startsAt, durationMinutes: doctor.slotMinutes, fee, symptoms: input.symptoms,
      intake: input.intake ?? undefined, matchSessionId: session?.id ?? null,
    },
  });
  await attachFiles(appointment.id, req.user!.id, input.fileIds);
  if (session) await prisma.matchEvent.create({ data: { sessionId: session.id, doctorId: doctor.id, type: "BOOKED", position: session.events[0]?.position ?? null, reason: session.events[0]?.reason ?? null } });
  res.status(201).json({ id: appointment.id, appointmentNumber: appointment.appointmentNumber, fee: num(fee) });
});

// Pays the fee for a held slot. With the gateway connected the reply carries the pay page to go to.
patientRoutes.post("/appointments/:id/pay", async (req, res) => {
  const { id } = idParam.parse(req.params);
  if (paymentsMode() !== "gateway") {
    await payForAppointment(id, req.user!.id);
    return res.json({ ok: true, payUrl: null });
  }
  const appointment = await prisma.appointment.findFirst({ where: { id, patientId: req.user!.id }, select: { status: true, scheduledAt: true, fee: true, patientPhone: true } });
  if (!appointment) throw notFound("Appointment");
  if (appointment.status !== "PENDING_PAYMENT") throw new HttpError(400, "This appointment is already paid for or cancelled");
  if (appointment.scheduledAt < new Date()) throw new HttpError(400, "This slot has passed. Book another one.");
  const { payUrl } = await startPayment({ userId: req.user!.id, amount: num(appointment.fee), phone: appointment.patientPhone, appointmentId: id, returnTo: "/patient/consultations" });
  res.json({ ok: true, payUrl });
});

patientRoutes.post("/appointments/:id/cancel", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const appointment = await prisma.appointment.findFirst({ where: { id, patientId: req.user!.id } });
  if (!appointment) throw notFound("Appointment");
  if (!["PENDING_PAYMENT", "CONFIRMED"].includes(appointment.status)) throw new HttpError(400, "This appointment can no longer be cancelled");
  if (appointment.status === "CONFIRMED" && appointment.scheduledAt.getTime() - Date.now() < 2 * 60 * 60 * 1000) {
    throw new HttpError(400, "Appointments can be cancelled up to 2 hours before they start");
  }
  await prisma.appointment.update({ where: { id }, data: { status: "CANCELLED", cancelledBy: "PATIENT", cancelReason: "Cancelled by the patient", doctorEarning: 0 } });
  if (appointment.status === "CONFIRMED") events.appointmentCancelled(id, { refundDue: true }); // an unpaid hold needs no message
  res.json({ ok: true, refundDue: appointment.status === "CONFIRMED" });
});

// After a finished consultation the patient can rate the doctor, once.
patientRoutes.post("/appointments/:id/review", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const input = z.object({ rating: z.coerce.number().int().min(1, "Choose 1 to 5 stars").max(5), comment: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(1000).nullable().optional()) }).parse(req.body);
  const appointment = await prisma.appointment.findFirst({ where: { id, patientId: req.user!.id }, select: { id: true, doctorId: true, status: true, review: { select: { id: true } } } });
  if (!appointment) throw notFound("Appointment");
  if (appointment.status !== "COMPLETED") throw new HttpError(400, "You can rate a consultation after it is finished");
  if (appointment.review) throw new HttpError(400, "You have already rated this consultation");

  await prisma.$transaction(async (tx) => {
    await tx.doctorReview.create({ data: { doctorId: appointment.doctorId, patientId: req.user!.id, appointmentId: id, rating: input.rating, comment: input.comment ?? null } });
    const summary = await tx.doctorReview.aggregate({ where: { doctorId: appointment.doctorId, status: "APPROVED" }, _avg: { rating: true }, _count: true });
    await tx.doctorProfile.update({ where: { id: appointment.doctorId }, data: { ratingAverage: Math.round((summary._avg.rating ?? 0) * 100) / 100, ratingCount: summary._count } });
  });
  res.status(201).json({ ok: true });
});

patientRoutes.get("/appointments", async (req, res) => {
  const appointments = await prisma.appointment.findMany({
    where: { patientId: req.user!.id, NOT: { status: "CANCELLED", cancelledBy: "SYSTEM" } },
    orderBy: { scheduledAt: "desc" },
    take: 100,
    select: {
      id: true, appointmentNumber: true, patientName: true, mode: true, scheduledAt: true, durationMinutes: true, status: true, fee: true,
      meetingUrl: true, symptoms: true, cancelledBy: true, cancelReason: true, createdAt: true,
      files: { orderBy: { id: "asc" }, select: fileSelect },
      doctor: { select: { displayName: true, photoUrl: true, specialization: true, slug: true } },
      prescription: { select: { id: true, prescriptionNumber: true, status: true } },
      review: { select: { rating: true } },
      payments: { where: { status: { in: ["SUCCESS", "REFUNDED"] } }, select: { amount: true, refundedAmount: true } },
    },
  });
  const now = Date.now();
  res.json({
    items: appointments.map(({ payments, createdAt, ...a }) => ({
      ...a, fee: num(a.fee),
      paid: payments.length > 0, refunded: payments.reduce((sum, p) => sum + num(p.refundedAmount), 0),
      // a held slot can be paid for 15 minutes; a booked one can be cancelled until 2 hours before
      canPay: a.status === "PENDING_PAYMENT" && a.scheduledAt.getTime() > now && createdAt.getTime() > now - 15 * 60_000,
      canCancel: a.status === "PENDING_PAYMENT" || (a.status === "CONFIRMED" && a.scheduledAt.getTime() - now >= 2 * 60 * 60_000),
      canRate: a.status === "COMPLETED" && !a.review,
      // the call link is only handed out for a confirmed appointment
      meetingUrl: a.status === "CONFIRMED" || a.status === "IN_PROGRESS" ? a.meetingUrl : null,
      prescription: a.prescription?.status === "ISSUED" ? a.prescription : null,
    })),
  });
});

// ─────────────────────────────────────────────── prescriptions, and ordering from one

const prescriptionInclude = {
  doctor: { select: { displayName: true, qualification: true, registrationNumber: true } },
  items: {
    include: {
      variant: {
        select: {
          id: true, title: true, sellingPrice: true, mrp: true, stockQuantity: true, isActive: true,
          product: { select: { id: true, name: true, status: true, brand: { select: { name: true } }, images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } } } },
        },
      },
    },
  },
} as const;

patientRoutes.get("/prescriptions", async (req, res) => {
  const prescriptions = await prisma.prescription.findMany({
    where: { patientId: req.user!.id, status: "ISSUED" },
    orderBy: { issuedAt: "desc" },
    include: { ...prescriptionInclude, orders: { select: { id: true, orderNumber: true, status: true } } },
  });
  res.json({
    items: prescriptions.map((p) => ({
      id: p.id, prescriptionNumber: p.prescriptionNumber, patientName: p.patientName, diagnosis: p.diagnosis, advice: p.advice,
      followUpDate: p.followUpDate, issuedAt: p.issuedAt, doctor: p.doctor, orders: p.orders,
      items: p.items.map((item) => ({
        id: item.id, medicineName: item.medicineName, potency: item.potency, dosage: item.dosage, frequency: item.frequency, duration: item.duration,
        instructions: item.instructions, quantity: item.quantity,
        // what can be bought here, if the medicine is one we sell
        buy: item.variant && item.variant.isActive && item.variant.product.status === "ACTIVE"
          ? { variantId: item.variant.id, productName: item.variant.product.name, title: item.variant.title, price: num(item.variant.sellingPrice), inStock: item.variant.stockQuantity >= item.quantity, imageUrl: item.variant.product.images[0]?.url ?? null }
          : null,
      })),
    })),
  });
});

const orderInput = z.object({
  fullName: z.string().trim().min(2, "Enter the name for delivery").max(120),
  address: z.string().trim().min(5, "Enter the delivery address").max(400),
  city: z.string().trim().min(2, "Enter the city").max(80),
  state: z.string().trim().min(2, "Choose the state").max(80),
  pincode: z.string().trim().regex(/^\d{6}$/, "A pincode has 6 digits"),
});

// One step from prescription to order: every prescribed medicine we sell and have in stock, paid on delivery.
patientRoutes.post("/prescriptions/:id/order", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const input = orderInput.parse(req.body);
  const prescription = await prisma.prescription.findFirst({ where: { id, patientId: req.user!.id, status: "ISSUED" }, include: prescriptionInclude });
  if (!prescription) throw notFound("Prescription");

  const lines = prescription.items
    .filter((item) => item.variant && item.variant.isActive && item.variant.product.status === "ACTIVE" && item.variant.stockQuantity >= item.quantity)
    .map((item) => ({ item, variant: item.variant! }));
  if (lines.length === 0) throw new HttpError(400, "None of the prescribed medicines are available to order right now");

  const subtotal = lines.reduce((sum, l) => sum + num(l.variant.sellingPrice) * l.item.quantity, 0);
  const shipping = await shippingFor("D2C", subtotal);
  const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { phone: true, email: true } });
  const orderNumber = await newOrderNumber();

  const order = await prisma.$transaction(async (tx) => {
    for (const { item, variant } of lines) {
      const taken = await tx.productVariant.updateMany({ where: { id: variant.id, stockQuantity: { gte: item.quantity } }, data: { stockQuantity: { decrement: item.quantity } } });
      if (taken.count === 0) throw new HttpError(409, `${variant.product.name} just went out of stock`);
    }
    const created = await tx.order.create({
      data: {
        orderNumber, channel: "D2C", userId: req.user!.id, prescriptionId: prescription.id,
        status: "CONFIRMED", confirmedAt: new Date(), paymentMethod: "COD", paymentStatus: "PENDING", // pay on delivery: nothing to wait for
        subtotal, shippingCharge: shipping.charge, grandTotal: Math.round((subtotal + shipping.charge) * 100) / 100,
        customerName: input.fullName, customerPhone: user?.phone, customerEmail: user?.email,
        shippingAddress: input.address, shippingCity: input.city, shippingState: input.state, shippingPincode: input.pincode,
        customerNote: `Ordered from prescription ${prescription.prescriptionNumber}`,
        items: {
          create: lines.map(({ item, variant }) => ({
            productId: variant.product.id, variantId: variant.id, productName: variant.product.name, variantTitle: variant.title,
            brandName: variant.product.brand?.name ?? null, imageUrl: variant.product.images[0]?.url ?? null,
            quantity: item.quantity, mrp: variant.mrp, unitPrice: variant.sellingPrice, lineTotal: num(variant.sellingPrice) * item.quantity,
          })),
        },
        history: { create: { status: "CONFIRMED", note: `Placed from prescription ${prescription.prescriptionNumber}` } },
      },
    });
    for (const { item, variant } of lines) {
      const after = await tx.productVariant.findUnique({ where: { id: variant.id }, select: { stockQuantity: true } });
      await tx.inventoryMovement.create({ data: { variantId: variant.id, type: "SALE", quantity: -item.quantity, balanceAfter: after?.stockQuantity ?? 0, orderId: created.id, note: `Order ${orderNumber}` } });
    }
    return created;
  });

  events.orderPlaced(order.id);
  res.status(201).json({ id: order.id, orderNumber, itemsOrdered: lines.length, itemsLeftOut: prescription.items.length - lines.length, total: num(order.grandTotal) });
});

// `?channel=D2C` leaves out a doctor's wholesale orders, which have their own page in the doctor dashboard.
patientRoutes.get("/orders", async (req, res) => {
  const { channel } = z.object({ channel: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["D2C", "B2B"]).optional()) }).parse(req.query);
  const orders = await prisma.order.findMany({
    where: { userId: req.user!.id, ...(channel ? { channel } : {}) },
    orderBy: { placedAt: "desc" },
    take: 50,
    select: {
      id: true, orderNumber: true, status: true, paymentMethod: true, paymentStatus: true, grandTotal: true, placedAt: true, channel: true,
      estimatedDelivery: true, prescription: { select: { prescriptionNumber: true } },
      items: { select: { productName: true, variantTitle: true, quantity: true, imageUrl: true } },
      shipments: { where: { trackingNumber: { not: null } }, orderBy: { createdAt: "desc" }, take: 1, select: { carrier: true, trackingNumber: true, trackingUrl: true } },
    },
  });
  res.json({ items: orders.map((o) => ({ ...o, grandTotal: num(o.grandTotal) })) });
});
