import * as events from "../lib/events";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { DocumentType } from "../generated/prisma/client";
import { onboardingOf } from "../lib/doctor-onboarding";
import { HttpError } from "../lib/http";
import { prisma } from "../lib/prisma";
import { htmlToText } from "../lib/text";
import { startSession } from "../middleware/auth";
import { setWholesale } from "./doctor-admin.routes";
import { UPLOAD_DIR } from "./uploads.routes";

// A doctor registering themselves: they sign in with their mobile number, fill in their details,
// upload certificates, and wait for staff to verify them. Mounted at /api/me (signed-in users).
export const doctorRegisterRoutes = Router();

const MAX_BYTES = 5 * 1024 * 1024;
const receive = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1 } }).single("file");

const documentKind = (bytes: Buffer) => {
  if (bytes.subarray(0, 5).toString("ascii") === "%PDF-") return "pdf";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (bytes.length > 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
};

// A certificate or ID proof. Stored where only staff can open it.
doctorRegisterRoutes.post("/documents", (req, res, next) => {
  receive(req, res, async (err: unknown) => {
    try {
      if (err instanceof multer.MulterError) throw new HttpError(400, err.code === "LIMIT_FILE_SIZE" ? "The file is larger than 5 MB" : "Could not read the upload");
      if (err) throw err;
      if (!req.file) throw new HttpError(400, "Choose a file to upload");
      const extension = documentKind(req.file.buffer);
      if (!extension) throw new HttpError(400, "Upload a PDF, or a JPG, PNG or WebP image");
      const name = `${randomUUID()}.${extension}`;
      await mkdir(path.join(UPLOAD_DIR, "documents"), { recursive: true });
      await writeFile(path.join(UPLOAD_DIR, "documents", name), req.file.buffer);
      res.status(201).json({ url: `/uploads/documents/${name}` });
    } catch (error) {
      next(error);
    }
  });
});

// The doctor's own photo. Unlike the proofs it is shown to patients, so it is stored with the public images.
doctorRegisterRoutes.post("/photo", (req, res, next) => {
  receive(req, res, async (err: unknown) => {
    try {
      if (err instanceof multer.MulterError) throw new HttpError(400, err.code === "LIMIT_FILE_SIZE" ? "The photo is larger than 5 MB" : "Could not read the upload");
      if (err) throw err;
      if (!req.file) throw new HttpError(400, "Choose a photo to upload");
      const extension = documentKind(req.file.buffer);
      if (!extension || extension === "pdf") throw new HttpError(400, "Upload a JPG, PNG or WebP photo");
      const name = `${randomUUID()}.${extension}`;
      await mkdir(path.join(UPLOAD_DIR, "doctors"), { recursive: true });
      await writeFile(path.join(UPLOAD_DIR, "doctors", name), req.file.buffer);
      res.status(201).json({ url: `/uploads/doctors/${name}` });
    } catch (error) {
      next(error);
    }
  });
});

export const DOCTOR_TITLES = ["Dr.", "Mr.", "Mrs.", "Ms.", "Prof."] as const;
// what counts as proof that the person practises
const PROFESSIONAL_PROOFS = ["REGISTRATION_CERTIFICATE", "DEGREE_CERTIFICATE", "CLINIC_PROOF", "OTHER"];

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const text = (max: number) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable().optional());
const optionalFee = z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), z.coerce.number().min(0).max(100_000).nullable().optional());

const registrationInput = z.object({
  title: z.enum(DOCTOR_TITLES, "Choose your title"),
  name: z.string().trim().min(2, "Enter your full name").max(110),
  gender: z.enum(["MALE", "FEMALE", "OTHER"], "Choose your gender"),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter your date of birth"),
  city: z.string().trim().min(2, "Enter your city or town").max(80),
  location: text(200), // area or locality
  state: text(80),
  languages: z.array(z.string().trim().min(1).max(40)).min(1, "Choose at least one language").max(25),
  experienceYears: z.coerce.number("Enter your work experience in years").min(0).max(80),
  stream: z.string().trim().min(2, "Choose your main consulting stream").max(80),
  specializationId: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.number().int().positive().optional()),
  password: z.string().min(8, "Use at least 8 characters for the password").max(100),
  photoUrl: z.string().regex(/^\/uploads\/doctors\/[\w.-]+$/, "Upload your photo again"),
  email: z.preprocess(emptyToNull, z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")).nullable().optional()),
  qualification: text(160),
  registrationNumber: text(60),
  registrationCouncil: text(160),
  documents: z
    .array(z.object({ type: z.enum(DocumentType), fileUrl: z.string().regex(/^\/uploads\/documents\/[\w.-]+$/, "Upload the document again"), fileName: text(200) }))
    .max(12),
});

const slugify = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "doctor";

doctorRegisterRoutes.post("/doctor-registration", async (req, res) => {
  const input = registrationInput.parse(req.body);
  if (!input.documents.some((d) => d.type === "GOVERNMENT_ID")) throw new HttpError(400, "Upload a government ID proof with your photo and address");
  if (!input.documents.some((d) => PROFESSIONAL_PROOFS.includes(d.type))) throw new HttpError(400, "Upload a professional proof, such as your registration certificate or visiting card");
  // streams are managed by staff in the admin panel
  const stream = await prisma.consultingStream.findFirst({ where: { name: input.stream, isActive: true, status: { not: "CLOSED" } }, select: { id: true, name: true, specializations: { where: { isActive: true }, select: { id: true, name: true } } } });
  if (!stream) throw new HttpError(400, "Choose your main consulting stream from the list");
  // a stream with specializations asks the doctor to pick one; the test is then built for it
  const specialization = input.specializationId ? stream.specializations.find((s) => s.id === input.specializationId) : undefined;
  if (stream.specializations.length && !specialization) throw new HttpError(400, "Choose your specialization from the list");
  const born = new Date(`${input.dateOfBirth}T00:00:00Z`);
  const age = (Date.now() - born.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(age) || age < 18 || age > 100) throw new HttpError(400, "Check your date of birth");

  const userId = req.user!.id;
  if (await prisma.doctorProfile.findUnique({ where: { userId }, select: { id: true } })) throw new HttpError(400, "You have already registered. Sign in to see your dashboard.");
  const account = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  const email = account?.email ?? input.email ?? null;
  if (!email) throw new HttpError(400, "Enter your email address");

  // "Dr. Asha Verma": the title is kept in front unless they typed it themselves
  const displayName = /^(dr|mr|mrs|ms|prof)\.?\s/i.test(input.name) ? input.name : `${input.title} ${input.name}`;
  let slug = slugify(displayName);
  for (let n = 2; await prisma.doctorProfile.findUnique({ where: { slug }, select: { id: true } }); n++) slug = `${slugify(displayName)}-${n}`;
  const passwordHash = await bcrypt.hash(input.password, 12);

  const doctor = await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { role: "DOCTOR", firstName: input.name, lastName: null, email, gender: input.gender, dateOfBirth: born, passwordHash, avatarUrl: input.photoUrl } });
    const created = await tx.doctorProfile.create({
      data: {
        userId, slug, displayName, photoUrl: input.photoUrl, stream: input.stream, qualification: input.qualification ?? null,
        specializationId: specialization?.id ?? null, specialization: specialization?.name ?? null,
        experienceYears: input.experienceYears, languages: input.languages,
        registrationNumber: input.registrationNumber ?? null, registrationCouncil: input.registrationCouncil ?? null,
        clinicAddress: input.location ?? null, clinicCity: input.city, clinicState: input.state ?? null,
        verificationStatus: "PENDING", submittedAt: new Date(),
        // nothing is switched on until staff verify the registration; isListed remembers the wish to consult
        acceptsConsultations: false, isListed: true,
        documents: { create: input.documents },
      },
    });
    // every doctor may buy at wholesale prices; the account opens with the verification
    await setWholesale(tx, created.id, true, userId);
    return created;
  });

  startSession(res, { id: userId, role: "DOCTOR" }, "doctor"); // the doctor sign-in now carries the new role
  events.doctorRegistered(doctor.id);
  const state = await onboardingOf(prisma, doctor.id);
  res.status(201).json({ id: doctor.id, verificationStatus: doctor.verificationStatus, testRequired: state?.testRequired ?? false });
});
