import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { type Response, Router } from "express";
import multer from "multer";
import { HttpError, idParam, notFound } from "../lib/http";
import { prisma } from "../lib/prisma";
import { imageType } from "./uploads.routes";

// Reports and photos a patient adds while booking a consultation.
//
// These are medical files, so they are NOT kept with the public images under /uploads. They live in
// backend/private/consultations, which nothing serves directly, and are only ever handed out by the
// routes below after checking who is asking:
//   the patient who uploaded it (or whose appointment it belongs to)     /api/me/consultation-files/:id
//   the doctor of the appointment it is attached to                      /api/doctor/consultation-files/:id
//   staff who may see consultations                                      /api/admin/appointments/files/:id
// A file is uploaded first and attached when the booking is made; one that is never attached is
// removed after a day (see sweepLooseFiles, run by housekeeping).

export const PRIVATE_DIR = path.resolve(process.cwd(), "private", "consultations");
export const MAX_FILES_PER_BOOKING = 5;
const MAX_BYTES = 5 * 1024 * 1024;
const MIME: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" };

export const fileSelect = { id: true, fileName: true, kind: true, size: true } as const;

const receive = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1 } }).single("file");

/** A name safe to show and to put in a download header. */
const tidyName = (name: string, kind: string) => {
  const base = name.replace(/\.[^.]+$/, "").replace(/[^\w .()-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "file";
  return `${base}.${kind}`;
};

const send = (res: Response, file: { storedName: string; fileName: string; kind: string }) => {
  res.setHeader("Content-Type", MIME[file.kind] ?? "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename="${file.fileName.replace(/"/g, "")}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.sendFile(path.join(PRIVATE_DIR, file.storedName), (error) => {
    if (error && !res.headersSent) res.status(404).json({ message: "This file is no longer available" });
  });
};

// ───────────────────────────────────────────── the patient

export const patientFileRoutes = Router();

patientFileRoutes.post("/consultation-files", (req, res, next) => {
  receive(req, res, async (err: unknown) => {
    try {
      if (err instanceof multer.MulterError) throw new HttpError(400, err.code === "LIMIT_FILE_SIZE" ? "The file is larger than 5 MB" : "Could not read the upload");
      if (err) throw err;
      if (!req.file) throw new HttpError(400, "Choose a file to upload");
      // told by its first bytes, so a renamed file cannot pass as a photo or a PDF
      const kind = req.file.buffer.subarray(0, 5).toString("ascii") === "%PDF-" ? "pdf" : imageType(req.file.buffer);
      if (!kind || kind === "gif") throw new HttpError(400, "Upload a PDF, or a JPG, PNG or WebP photo");
      const loose = await prisma.consultationFile.count({ where: { uploaderId: req.user!.id, appointmentId: null } });
      if (loose >= MAX_FILES_PER_BOOKING) throw new HttpError(400, `You can add up to ${MAX_FILES_PER_BOOKING} files. Remove one first.`);

      const storedName = `${randomUUID()}.${kind}`;
      await mkdir(PRIVATE_DIR, { recursive: true });
      await writeFile(path.join(PRIVATE_DIR, storedName), req.file.buffer);
      const saved = await prisma.consultationFile.create({
        data: { uploaderId: req.user!.id, storedName, kind, size: req.file.size, fileName: tidyName(req.file.originalname, kind) },
        select: fileSelect,
      });
      res.status(201).json(saved);
    } catch (error) {
      next(error);
    }
  });
});

patientFileRoutes.get("/consultation-files/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const file = await prisma.consultationFile.findFirst({ where: { id, OR: [{ uploaderId: req.user!.id }, { appointment: { patientId: req.user!.id } }] } });
  if (!file) throw notFound("File");
  send(res, file);
});

// only before it is attached: once the doctor may have read it, it stays with the consultation
patientFileRoutes.delete("/consultation-files/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const file = await prisma.consultationFile.findFirst({ where: { id, uploaderId: req.user!.id, appointmentId: null } });
  if (!file) throw notFound("File");
  await prisma.consultationFile.delete({ where: { id } });
  await unlink(path.join(PRIVATE_DIR, file.storedName)).catch(() => undefined);
  res.json({ ok: true });
});

// ───────────────────────────────────────────── the doctor, and staff

export const doctorFileRoutes = Router();
doctorFileRoutes.get("/consultation-files/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  // only once the booking is paid for: an unpaid hold is not yet this doctor’s patient
  const file = await prisma.consultationFile.findFirst({ where: { id, appointment: { doctorId: req.doctorId!, status: { in: ["CONFIRMED", "IN_PROGRESS", "COMPLETED", "NO_SHOW"] } } } });
  if (!file) throw notFound("File");
  send(res, file);
});

export const adminFileRoutes = Router();
adminFileRoutes.get("/files/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const file = await prisma.consultationFile.findFirst({ where: { id, appointmentId: { not: null } } });
  if (!file) throw notFound("File");
  await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "consultation-file.open", entity: "ConsultationFile", entityId: String(id), changes: { appointmentId: file.appointmentId } } });
  send(res, file);
});

// ───────────────────────────────────────────── used by the booking, and by housekeeping

/** Ties the patient's uploaded files to the appointment they just made. Files that are not theirs are ignored. */
export const attachFiles = async (appointmentId: number, userId: number, fileIds: number[]) => {
  if (!fileIds.length) return 0;
  const result = await prisma.consultationFile.updateMany({ where: { id: { in: fileIds.slice(0, MAX_FILES_PER_BOOKING) }, uploaderId: userId, appointmentId: null }, data: { appointmentId } });
  return result.count;
};

/** Removes files that were uploaded but never booked with, a day later. */
export const sweepLooseFiles = async () => {
  const old = await prisma.consultationFile.findMany({ where: { appointmentId: null, createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }, select: { id: true, storedName: true }, take: 200 });
  for (const file of old) {
    await prisma.consultationFile.delete({ where: { id: file.id } }).catch(() => undefined);
    await unlink(path.join(PRIVATE_DIR, file.storedName)).catch(() => undefined);
  }
  return old.length;
};
