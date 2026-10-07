import * as events from "./events";
import { num } from "./http";
import { money, notifyStaff, notifyUser, siteLink } from "./notifications";
import { prisma } from "./prisma";
import { dayInZone, DEFAULT_ZONE } from "./time";

// Three jobs about doctors that the server does by itself:
//   payouts      on the chosen day, what each doctor has earned is gathered into a payout, ready to be paid
//   levels       a doctor who has done enough consultations with a good enough rating moves up a level
//   stale calls  a consultation nobody closed is closed; one the doctor never started is cancelled and refunded

// ───────────────────────────────────────────── payouts

export type PayoutSettings = {
  automatic: boolean;
  frequency: "weekly" | "monthly";
  weekday: number; // 0 Sunday … 6 Saturday, for weekly
  dayOfMonth: number; // 1 to 28, for monthly
  minimumAmount: number; // smaller amounts wait for the next round
  holdDays: number; // a finished consultation waits this many days first, in case it is refunded
};
const PAYOUT_KEY = "payouts";
const PAYOUT_DEFAULTS: PayoutSettings = { automatic: true, frequency: "weekly", weekday: 1, dayOfMonth: 1, minimumAmount: 500, holdDays: 3 };

export const payoutSettings = async (): Promise<PayoutSettings> => {
  const saved = await prisma.setting.findUnique({ where: { key: PAYOUT_KEY } });
  return { ...PAYOUT_DEFAULTS, ...((saved?.value ?? {}) as Partial<PayoutSettings>) };
};
export const savePayoutSettings = async (value: PayoutSettings) => {
  await prisma.setting.upsert({ where: { key: PAYOUT_KEY }, update: { value }, create: { key: PAYOUT_KEY, value } });
  return value;
};

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * Gathers what every doctor is owed into payouts waiting to be paid. One payout per doctor.
 * Doctors without bank details, or owed less than the minimum, are left for next time and listed.
 */
export const createPayoutBatch = async (settings: PayoutSettings, byUserId?: number) => {
  const cutoff = new Date(Date.now() - settings.holdDays * 86_400_000);
  const owed = await prisma.appointment.groupBy({
    by: ["doctorId"],
    where: { status: "COMPLETED", payoutId: null, completedAt: { not: null, lt: cutoff }, doctorEarning: { gt: 0 } },
    _sum: { doctorEarning: true },
  });
  const doctors = await prisma.doctorProfile.findMany({
    where: { id: { in: owed.map((o) => o.doctorId) } },
    select: { id: true, displayName: true, bankAccountNumber: true, bankIfsc: true },
  });
  const doctorById = new Map(doctors.map((d) => [d.id, d]));
  const created: { payoutId: number; doctor: string; amount: number; consultations: number }[] = [];
  const skipped: { doctor: string; amount: number; why: string }[] = [];

  for (const group of owed) {
    const doctor = doctorById.get(group.doctorId);
    if (!doctor) continue;
    const total = round(num(group._sum.doctorEarning));
    if (!doctor.bankAccountNumber || !doctor.bankIfsc) { skipped.push({ doctor: doctor.displayName, amount: total, why: "no bank details" }); continue; }
    if (total < settings.minimumAmount) { skipped.push({ doctor: doctor.displayName, amount: total, why: `under ${money(settings.minimumAmount)}` }); continue; }

    const payout = await prisma.$transaction(async (tx) => {
      const unpaid = await tx.appointment.findMany({
        where: { doctorId: doctor.id, status: "COMPLETED", payoutId: null, completedAt: { not: null, lt: cutoff }, doctorEarning: { gt: 0 } },
        orderBy: { completedAt: "asc" }, select: { id: true, doctorEarning: true, completedAt: true },
      });
      if (unpaid.length === 0) return null;
      const amount = round(unpaid.reduce((sum, a) => sum + num(a.doctorEarning), 0));
      const made = await tx.doctorPayout.create({
        data: {
          doctorId: doctor.id, status: "PENDING", amount,
          periodStart: new Date(`${dayInZone(unpaid[0].completedAt!, DEFAULT_ZONE)}T00:00:00Z`),
          periodEnd: new Date(`${dayInZone(unpaid[unpaid.length - 1].completedAt!, DEFAULT_ZONE)}T00:00:00Z`),
        },
      });
      // "payoutId: null" again: if another payout took one of these meanwhile, this one is not made
      const linked = await tx.appointment.updateMany({ where: { id: { in: unpaid.map((a) => a.id) }, payoutId: null }, data: { payoutId: made.id } });
      if (linked.count !== unpaid.length) throw new Error("taken by another payout");
      await tx.auditLog.create({ data: { actorId: byUserId ?? null, action: byUserId ? "payout.create" : "payout.auto", entity: "DoctorPayout", entityId: String(made.id), changes: { doctorId: doctor.id, amount, consultations: unpaid.length } } });
      return { payoutId: made.id, doctor: doctor.displayName, amount, consultations: unpaid.length };
    }).catch(() => null);
    if (payout) created.push(payout);
  }
  return { created, skipped, total: round(created.reduce((sum, p) => sum + p.amount, 0)) };
};

/** Once on the payout day: makes the batch and tells staff it is ready to pay. */
export const runScheduledPayouts = async () => {
  const settings = await payoutSettings();
  if (!settings.automatic) return null;
  const today = dayInZone(new Date(), DEFAULT_ZONE);
  const date = new Date(`${today}T00:00:00Z`);
  const due = settings.frequency === "weekly" ? date.getUTCDay() === settings.weekday : date.getUTCDate() === settings.dayOfMonth;
  if (!due) return null;
  const last = await prisma.setting.findUnique({ where: { key: "payouts.lastRun" } });
  if (last?.value === today) return null;
  await prisma.setting.upsert({ where: { key: "payouts.lastRun" }, update: { value: today }, create: { key: "payouts.lastRun", value: today } });

  const batch = await createPayoutBatch(settings);
  if (batch.created.length || batch.skipped.length) {
    await notifyStaff("staff.payouts_ready", {
      count: batch.created.length, total: money(batch.total),
      list: batch.created.map((p) => `• ${p.doctor}: ${money(p.amount)} for ${p.consultations} consultation${p.consultations === 1 ? "" : "s"}`).join("\n") || "None this time.",
      skipped: batch.skipped.length ? `Left for next time:\n${batch.skipped.map((s) => `• ${s.doctor}: ${money(s.amount)} (${s.why})`).join("\n")}` : "",
      link: siteLink("/admin/payouts"),
    });
  }
  return batch;
};

// ───────────────────────────────────────────── levels

const MIN_REVIEWS = 5; // a rating means little with fewer reviews than this

/**
 * Moves doctors up to the highest level they have earned. Doctors only ever move up by themselves;
 * moving someone down, or up early, stays a decision for staff.
 */
export const runPromotions = async () => {
  const tiers = await prisma.doctorTier.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
  const withRules = tiers.filter((t) => t.promoteAfterConsultations !== null || t.promoteMinRating !== null);
  if (withRules.length === 0) return [];
  const rankOf = new Map(tiers.map((t, index) => [t.id, index]));

  const doctors = await prisma.doctorProfile.findMany({
    where: { verificationStatus: "APPROVED" },
    select: { id: true, userId: true, displayName: true, tierId: true, ratingAverage: true, ratingCount: true },
  });
  const done = await prisma.appointment.groupBy({ by: ["doctorId"], where: { status: "COMPLETED" }, _count: true });
  const doneBy = new Map(done.map((d) => [d.doctorId, d._count]));
  const promoted: { doctor: string; from: string | null; to: string }[] = [];

  for (const doctor of doctors) {
    const consultations = doneBy.get(doctor.id) ?? 0;
    const rating = num(doctor.ratingAverage);
    const earned = [...withRules].reverse().find((tier) =>
      (tier.promoteAfterConsultations === null || consultations >= tier.promoteAfterConsultations) &&
      (tier.promoteMinRating === null || (doctor.ratingCount >= MIN_REVIEWS && rating >= num(tier.promoteMinRating))));
    if (!earned) continue;
    const current = doctor.tierId === null ? -1 : rankOf.get(doctor.tierId) ?? -1;
    if ((rankOf.get(earned.id) ?? -1) <= current) continue; // already there, or higher

    const from = tiers.find((t) => t.id === doctor.tierId)?.name ?? null;
    await prisma.$transaction([
      prisma.doctorProfile.update({ where: { id: doctor.id }, data: { tierId: earned.id, commissionPercent: earned.commissionPercent } }),
      prisma.auditLog.create({ data: { action: "doctor.level-up", entity: "DoctorProfile", entityId: String(doctor.id), changes: { from, to: earned.name, consultations, rating, reviews: doctor.ratingCount } } }),
    ]);
    promoted.push({ doctor: doctor.displayName, from, to: earned.name });
    await notifyUser("doctor.level_up", doctor.userId, {
      level: earned.name, patients: earned.maxPatientsPerDay, share: `${100 - num(earned.commissionPercent)}%`, consultations, link: siteLink("/doctor"),
    }, { type: "DoctorProfile", id: doctor.id });
  }
  return promoted;
};

// ───────────────────────────────────────────── consultations nobody closed

const CLOSE_AFTER_MINUTES = 60; // a call that was started is taken as finished this long after its slot ends
const MISSED_AFTER_MINUTES = 30; // a call never started by then did not happen

export const closeStaleAppointments = async () => {
  const now = Date.now();
  const open = await prisma.appointment.findMany({
    where: { status: { in: ["CONFIRMED", "IN_PROGRESS"] }, scheduledAt: { lt: new Date(now - MISSED_AFTER_MINUTES * 60_000) } },
    select: { id: true, status: true, scheduledAt: true, durationMinutes: true },
    take: 100,
  });
  let closed = 0;
  let missed = 0;
  for (const a of open) {
    const end = a.scheduledAt.getTime() + a.durationMinutes * 60_000;
    if (a.status === "IN_PROGRESS" && end + CLOSE_AFTER_MINUTES * 60_000 < now) {
      // the doctor started the call and forgot to press "Mark as done": the consultation happened
      const changed = await prisma.appointment.updateMany({ where: { id: a.id, status: "IN_PROGRESS" }, data: { status: "COMPLETED", completedAt: new Date(end) } });
      closed += changed.count;
    } else if (a.status === "CONFIRMED" && end + MISSED_AFTER_MINUTES * 60_000 < now) {
      // the doctor never started it: the patient gets their money back
      const changed = await prisma.appointment.updateMany({
        where: { id: a.id, status: "CONFIRMED" },
        data: { status: "CANCELLED", cancelledBy: "DOCTOR", cancelReason: "The doctor did not start the call", doctorEarning: 0 },
      });
      if (changed.count) {
        missed++;
        events.appointmentMissed(a.id);
      }
    }
  }
  return { closed, missed };
};
