import { Router } from "express";
import { z } from "zod";
import { DocumentType } from "../generated/prisma/client";
import { HttpError } from "../lib/http";
import { prisma } from "../lib/prisma";

// Adding a customer or a B2B customer by hand from the admin panel.
// Mounted at /api/admin/customers and /api/admin/b2b next to their list routes.
export const customerFormRoutes = Router();
export const b2bFormRoutes = Router();

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const text = (max: number) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable().optional());
const upper = (v: unknown) => (typeof v === "string" ? v.trim().toUpperCase() : v);

const mobile = z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number");
const email = z.preprocess(emptyToNull, z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")).nullable().optional());
const pincode = z.preprocess(emptyToNull, z.string().trim().regex(/^\d{6}$/, "A pincode has 6 digits").nullable().optional());

// ─────────────────────────────────────────────── customer

const customerInput = z.object({
  firstName: z.string().trim().min(1, "Enter the customer's name").max(80),
  lastName: text(80),
  phone: mobile,
  email,
  gender: z.preprocess(emptyToNull, z.enum(["MALE", "FEMALE", "OTHER"]).nullable().optional()),
  addressLine: text(300),
  city: text(80),
  state: text(80),
  pincode,
});

customerFormRoutes.post("/", async (req, res) => {
  const input = customerInput.parse(req.body);
  if (await prisma.user.findUnique({ where: { phone: input.phone }, select: { id: true } })) {
    throw new HttpError(400, "Someone is already registered with this mobile number");
  }

  const { addressLine, city, state, pincode: pin, ...person } = input;
  const user = await prisma.user.create({
    data: {
      ...person,
      role: "CUSTOMER",
      // the customer confirms the number themselves the first time they sign in with an OTP
      addresses: addressLine
        ? { create: { label: "Home", fullName: [person.firstName, person.lastName].filter(Boolean).join(" "), phone: person.phone, line1: addressLine, city, state, pincode: pin, isDefault: true } }
        : undefined,
    },
  });
  await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "customer.create", entity: "User", entityId: String(user.id) } });
  res.status(201).json({ id: user.id });
});

// ─────────────────────────────────────────────── B2B customer (a doctor buying wholesale)

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

// What can still be changed after the account exists; editing (in b2b.routes.ts) checks these the same way.
export const b2bDetails = z.object({
  // the doctor
  doctorName: z.string().trim().min(2, "Enter the doctor's name").max(120),
  email,
  qualification: text(120),
  // registration with the medical council: what makes them eligible for wholesale prices
  registrationNumber: z.string().trim().min(2, "Enter the medical registration number").max(60),
  registrationCouncil: text(120),
  // the practice
  businessName: z.string().trim().min(2, "Enter the clinic or practice name").max(160),
  addressLine: z.string().trim().min(3, "Enter the clinic address").max(300),
  city: z.string().trim().min(2, "Enter the city").max(80),
  state: z.string().trim().min(2, "Choose the state").max(80),
  pincode: z.string().trim().regex(/^\d{6}$/, "A pincode has 6 digits"),
  // tax and licences: only needed if the doctor has them
  gstNumber: z.preprocess((v) => emptyToNull(upper(v)), z.string().regex(GSTIN, "That is not a valid GST number (15 characters, like 22AAAAA0000A1Z5)").nullable().optional()),
  panNumber: z.preprocess((v) => emptyToNull(upper(v)), z.string().regex(PAN, "That is not a valid PAN (like ABCDE1234F)").nullable().optional()),
  drugLicenseNumber: text(60),
  notes: text(1000),
});

const b2bInput = b2bDetails.extend({
  phone: mobile, // they sign in with it, so it is set once
  // the account
  priceTierId: z.number().int().positive().nullable().optional(),
  creditLimit: z.coerce.number().min(0).max(100_000_000).default(0),
  creditDays: z.coerce.number().int().min(0).max(365).default(0),
  approveNow: z.boolean().default(false),
  documents: z
    .array(z.object({
      type: z.enum(DocumentType),
      fileUrl: z.string().regex(/^\/uploads\/documents\/[\w.-]+$/, "Upload the document again"),
      fileName: text(200),
      documentNumber: text(80),
    }))
    .max(12)
    .default([]),
});

b2bFormRoutes.post("/", async (req, res) => {
  const input = b2bInput.parse(req.body);

  // the same mobile number may already belong to a retail customer; the B2B account is added to that person
  const existing = await prisma.user.findUnique({ where: { phone: input.phone }, select: { id: true, b2bAccount: { select: { id: true } } } });
  if (existing?.b2bAccount) throw new HttpError(400, "This mobile number already has a B2B account");
  if (input.priceTierId && !(await prisma.priceTier.findUnique({ where: { id: input.priceTierId }, select: { id: true } }))) {
    throw new HttpError(400, "That price tier does not exist");
  }
  const tierId = input.priceTierId ?? (await prisma.priceTier.findUnique({ where: { name: "Doctor" }, select: { id: true } }))?.id ?? null;

  const account = await prisma.$transaction(async (tx) => {
    const userId = existing
      ? (await tx.user.update({ where: { id: existing.id }, data: { role: "DOCTOR" }, select: { id: true } })).id
      : (await tx.user.create({ data: { role: "DOCTOR", firstName: input.doctorName, phone: input.phone, email: input.email }, select: { id: true } })).id;

    // one account per doctor: the same person can later be switched on for consultations
    let doctorProfile = await tx.doctorProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!doctorProfile) {
      const base = input.doctorName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "doctor";
      let slug = base;
      for (let n = 2; await tx.doctorProfile.findUnique({ where: { slug }, select: { id: true } }); n++) slug = `${base}-${n}`;
      doctorProfile = await tx.doctorProfile.create({
        data: {
          userId, slug, displayName: input.doctorName, qualification: input.qualification,
          registrationNumber: input.registrationNumber, registrationCouncil: input.registrationCouncil,
          clinicName: input.businessName, clinicAddress: input.addressLine, clinicCity: input.city, clinicState: input.state, clinicPincode: input.pincode,
          verificationStatus: input.approveNow ? "APPROVED" : "PENDING", submittedAt: new Date(),
          verifiedAt: input.approveNow ? new Date() : null, verifiedById: input.approveNow ? req.user!.id : null,
          acceptsConsultations: false, isListed: false,
        },
        select: { id: true },
      });
    }
    const doctorProfileId = doctorProfile.id;

    const created = await tx.b2BAccount.create({
      data: {
        userId,
        type: "DOCTOR",
        businessName: input.businessName,
        contactName: input.doctorName,
        contactPhone: input.phone,
        contactEmail: input.email,
        qualification: input.qualification,
        registrationNumber: input.registrationNumber,
        registrationCouncil: input.registrationCouncil,
        gstNumber: input.gstNumber,
        panNumber: input.panNumber,
        drugLicenseNumber: input.drugLicenseNumber,
        addressLine: input.addressLine,
        city: input.city,
        state: input.state,
        pincode: input.pincode,
        priceTierId: tierId,
        creditLimit: input.creditLimit,
        creditDays: input.creditDays,
        notes: input.notes,
        status: input.approveNow ? "APPROVED" : "PENDING",
        approvedAt: input.approveNow ? new Date() : null,
        approvedById: input.approveNow ? req.user!.id : null,
        documents: {
          create: input.documents.map((doc) => ({
            ...doc,
            doctorProfileId,
            // documents added by staff along with an approval count as checked
            status: input.approveNow ? ("APPROVED" as const) : ("PENDING" as const),
            reviewedById: input.approveNow ? req.user!.id : null,
            reviewedAt: input.approveNow ? new Date() : null,
          })),
        },
      },
    });
    await tx.auditLog.create({ data: { actorId: req.user!.id, action: "b2b.create", entity: "B2BAccount", entityId: String(created.id) } });
    return created;
  });

  res.status(201).json({ id: account.id, attachedToExistingCustomer: Boolean(existing) });
});
