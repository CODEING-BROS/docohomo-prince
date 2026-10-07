import { Router } from "express";
import { z } from "zod";
import { sendCsv } from "../lib/bulk";
import { createPayoutBatch, payoutSettings, runPromotions, savePayoutSettings } from "../lib/doctor-jobs";
import * as events from "../lib/events";
import { HttpError, num } from "../lib/http";
import { prisma } from "../lib/prisma";

// The automatic side of doctor payouts and levels.
//   payoutAutoRoutes  /api/admin/payouts       when payouts are gathered, the bank file, paying many at once
//   tierAutoRoutes    /api/admin/doctor-tiers  check promotions now
// Both are mounted before the hand-operated routers at the same addresses.
export const payoutAutoRoutes = Router();
export const tierAutoRoutes = Router();

payoutAutoRoutes.get("/settings", async (_req, res) => {
  const [settings, lastRun, waiting] = await Promise.all([
    payoutSettings(),
    prisma.setting.findUnique({ where: { key: "payouts.lastRun" } }),
    prisma.doctorPayout.aggregate({ where: { status: "PENDING" }, _count: true, _sum: { amount: true } }),
  ]);
  res.json({ settings, lastRun: (lastRun?.value as string | undefined) ?? null, waiting: { count: waiting._count, amount: num(waiting._sum.amount) } });
});

const settingsInput = z.object({
  automatic: z.boolean(),
  frequency: z.enum(["weekly", "monthly"]),
  weekday: z.coerce.number().int().min(0).max(6),
  dayOfMonth: z.coerce.number().int().min(1, "Choose a day from 1 to 28").max(28, "Choose a day from 1 to 28, so every month has it"),
  minimumAmount: z.coerce.number().min(0, "The smallest payout cannot be negative").max(100000),
  holdDays: z.coerce.number().int().min(0, "Days to wait cannot be negative").max(30),
});

payoutAutoRoutes.put("/settings", async (req, res) => {
  const saved = await savePayoutSettings(settingsInput.parse(req.body));
  await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "payout.settings", entity: "Setting", entityId: "payouts", changes: saved } });
  res.json(saved);
});

/** Gathers what is owed into payouts right now, without waiting for the payout day. */
payoutAutoRoutes.post("/run-now", async (req, res) => {
  res.status(201).json(await createPayoutBatch(await payoutSettings(), req.user!.id));
});

/** A sheet for the bank's "pay many people at once" upload: one line per payout waiting to be paid. */
payoutAutoRoutes.get("/bank-file", async (_req, res) => {
  const payouts = await prisma.doctorPayout.findMany({
    where: { status: "PENDING" }, orderBy: { id: "asc" },
    include: { doctor: { select: { displayName: true, bankAccountName: true, bankAccountNumber: true, bankIfsc: true, user: { select: { email: true, phone: true } } } } },
  });
  sendCsv(res, "doctor-payouts", [
    { header: "Payout", value: (p) => `PAYOUT-${p.id}` },
    { header: "Beneficiary name", value: (p) => p.doctor.bankAccountName ?? p.doctor.displayName },
    { header: "Account number", value: (p) => p.doctor.bankAccountNumber ?? "" },
    { header: "IFSC", value: (p) => p.doctor.bankIfsc ?? "" },
    { header: "Amount", value: (p) => num(p.amount).toFixed(2) },
    { header: "Narration", value: (p) => `DocHomoeo payout ${p.id}` },
    { header: "Doctor", value: (p) => p.doctor.displayName },
    { header: "Mobile", value: (p) => p.doctor.user.phone ?? "" },
    { header: "Email", value: (p) => p.doctor.user.email ?? "" },
  ], payouts);
});

const paidInput = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1, "Choose at least one payout").max(500),
  reference: z.string().trim().min(2, "Enter the bank reference for this payment").max(120),
});

/** After the bank transfer: marks many payouts as paid in one go and tells each doctor. */
payoutAutoRoutes.post("/mark-paid", async (req, res) => {
  const { ids, reference } = paidInput.parse(req.body);
  const waiting = await prisma.doctorPayout.findMany({ where: { id: { in: ids }, status: "PENDING" }, select: { id: true } });
  if (waiting.length === 0) throw new HttpError(400, "None of these payouts is waiting to be paid");
  const now = new Date();
  await prisma.$transaction([
    prisma.doctorPayout.updateMany({ where: { id: { in: waiting.map((p) => p.id) }, status: "PENDING" }, data: { status: "PAID", reference, paidAt: now } }),
    prisma.auditLog.create({ data: { actorId: req.user!.id, action: "payout.mark-paid", entity: "DoctorPayout", entityId: "bulk", changes: { ids: waiting.map((p) => p.id), reference } } }),
  ]);
  for (const payout of waiting) events.payoutPaid(payout.id);
  res.json({ paid: waiting.length, skipped: ids.length - waiting.length });
});

/** Looks at every doctor now and moves up the ones who have earned it. */
tierAutoRoutes.post("/promote-now", async (_req, res) => {
  const promoted = await runPromotions();
  res.json({ promoted });
});
