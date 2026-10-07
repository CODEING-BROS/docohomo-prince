import * as events from "../lib/events";
import { settleConsulting } from "../lib/doctor-onboarding";
import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "../generated/prisma/client";
import { VerificationStatus } from "../generated/prisma/client";
import { HttpError, getPage, idParam, notFound, numOrNull, optionalString, paged } from "../lib/http";
import { prisma } from "../lib/prisma";

export const doctorRoutes = Router();

const listSchema = z.object({
  q: optionalString,
  status: z.preprocess((v) => (v === "" ? undefined : v), z.enum(VerificationStatus).optional()),
});

export const doctorFilters = listSchema;

export const doctorWhere = (filters: z.infer<typeof listSchema>) => {
  const base: Prisma.DoctorProfileWhereInput = {};
  if (filters.q) {
    base.OR = [
      { displayName: { contains: filters.q, mode: "insensitive" } },
      { specialization: { contains: filters.q, mode: "insensitive" } },
      { registrationNumber: { contains: filters.q, mode: "insensitive" } },
    ];
  }
  const where: Prisma.DoctorProfileWhereInput = { ...base, ...(filters.status ? { verificationStatus: filters.status } : {}) };
  return { base, where };
};

doctorRoutes.get("/", async (req, res) => {
  const { page, pageSize, skip, take } = getPage(req);
  const { base, where } = doctorWhere(listSchema.parse(req.query));

  const [total, rows, statusCounts] = await Promise.all([
    prisma.doctorProfile.count({ where }),
    prisma.doctorProfile.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      select: {
        id: true, displayName: true, photoUrl: true, qualification: true, specialization: true,
        experienceYears: true, languages: true, registrationNumber: true, verificationStatus: true,
        acceptsConsultations: true, videoFee: true, audioFee: true, createdAt: true,
        user: { select: { phone: true, email: true, b2bAccount: { select: { status: true } } } },
        _count: { select: { documents: true, appointments: true } },
      },
    }),
    prisma.doctorProfile.groupBy({ by: ["verificationStatus"], where: base, _count: true }),
  ]);

  const items = rows.map(({ _count, user, ...d }) => ({
    ...d,
    experienceYears: numOrNull(d.experienceYears),
    videoFee: numOrNull(d.videoFee),
    audioFee: numOrNull(d.audioFee),
    phone: user.phone,
    email: user.email,
    wholesaleStatus: user.b2bAccount?.status ?? null,
    documentCount: _count.documents,
    appointmentCount: _count.appointments,
  }));

  res.json({
    ...paged(items, total, page, pageSize),
    statusCounts: Object.fromEntries(statusCounts.map((s) => [s.verificationStatus, s._count])),
  });
});

const reviewSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED", "SUSPENDED", "UNDER_REVIEW"]),
  reason: z.string().trim().max(500).optional(),
});

// Approve, reject or suspend a doctor's registration.
doctorRoutes.patch("/:id/verification", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { decision, reason } = reviewSchema.parse(req.body);
  if (decision === "REJECTED" && !reason) throw new HttpError(400, "Give a reason for rejecting");

  const doctor = await prisma.doctorProfile.findUnique({ where: { id }, select: { verificationStatus: true } });
  if (!doctor) throw notFound("Doctor");

  await prisma.$transaction(async (tx) => {
    await tx.doctorProfile.update({
      where: { id },
      data: {
        verificationStatus: decision,
        verifiedAt: decision === "APPROVED" ? new Date() : null,
        verifiedById: decision === "APPROVED" ? req.user!.id : null,
        rejectionReason: decision === "REJECTED" || decision === "SUSPENDED" ? (reason ?? null) : null,
      },
    });
    const account = await tx.b2BAccount.findFirst({ where: { user: { doctorProfile: { id } } }, select: { id: true, status: true } });
    if (account) {
      if (decision === "APPROVED" && (account.status === "PENDING" || account.status === "UNDER_REVIEW")) {
        await tx.b2BAccount.update({ where: { id: account.id }, data: { status: "APPROVED", approvedAt: new Date(), approvedById: req.user!.id, rejectionReason: null } });
      }
      if (decision === "REJECTED" || decision === "SUSPENDED") {
        await tx.b2BAccount.update({ where: { id: account.id }, data: { status: decision, rejectionReason: reason ?? null } });
      }
    }
    if (decision === "APPROVED") {
      // consultations start now only if the doctor's stream has no test, or they have already passed it
      await settleConsulting(tx, id);
    } else {
      await tx.doctorProfile.update({ where: { id }, data: { acceptsConsultations: false } });
    }
    await tx.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: "doctor.verification",
        entity: "DoctorProfile",
        entityId: String(id),
        changes: { from: doctor.verificationStatus, to: decision, reason: reason ?? null },
      },
    });
  });

  events.doctorDecision(id);
  res.json({ ok: true, verificationStatus: decision });
});
