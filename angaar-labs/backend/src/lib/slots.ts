import { prisma } from "./prisma";

// Bookable consultation slots. A doctor sets weekly working hours; each day's hours are cut into
// slots of the doctor's slot length. A slot is free unless it is in the past, falls in time off,
// or already has an appointment. All clock times are India time.

const IST = "+05:30";
const LEAD_MINUTES = 30; // a slot cannot be booked closer than this to its start

const toMinutes = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));
const toClock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** Sunday = 0 … Saturday = 6 for a calendar day. */
export const weekdayOf = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();

export const slotsForDay = async (doctorId: number, day: string) => {
  const doctor = await prisma.doctorProfile.findUnique({
    where: { id: doctorId },
    select: { slotMinutes: true, tier: { select: { maxPatientsPerDay: true } }, availability: { where: { isActive: true, dayOfWeek: weekdayOf(day) }, orderBy: { startTime: "asc" } } },
  });
  if (!doctor) return [];

  const dayStart = new Date(`${day}T00:00:00${IST}`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const [timeOff, booked] = await Promise.all([
    prisma.doctorTimeOff.findMany({ where: { doctorId, startsAt: { lt: dayEnd }, endsAt: { gt: dayStart } } }),
    prisma.appointment.findMany({
      where: { doctorId, scheduledAt: { gte: dayStart, lt: dayEnd }, status: { notIn: ["CANCELLED", "NO_SHOW"] } },
      select: { scheduledAt: true, durationMinutes: true },
    }),
  ]);

  const earliest = Date.now() + LEAD_MINUTES * 60 * 1000;
  // Bronze, Silver, Gold: once the day's limit is reached no more slots are offered
  const dayIsFull = doctor.tier !== null && booked.length >= doctor.tier.maxPatientsPerDay;
  const length = doctor.slotMinutes;
  const slots: { startsAt: string; time: string; mode: string; available: boolean; reason: string | null }[] = [];

  for (const window of doctor.availability) {
    for (let minute = toMinutes(window.startTime); minute + length <= toMinutes(window.endTime); minute += length) {
      const start = new Date(`${day}T${toClock(minute)}:00${IST}`);
      const end = new Date(start.getTime() + length * 60 * 1000);
      const overlaps = (from: Date, to: Date) => from < end && to > start;
      const reason =
        start.getTime() < earliest ? "Too soon or already past"
        : timeOff.some((off) => overlaps(off.startsAt, off.endsAt)) ? "Doctor is away"
        : booked.some((b) => overlaps(b.scheduledAt, new Date(b.scheduledAt.getTime() + b.durationMinutes * 60 * 1000))) ? "Already booked"
        : dayIsFull ? "Fully booked for the day"
        : null;
      slots.push({ startsAt: start.toISOString(), time: toClock(minute), mode: window.mode, available: reason === null, reason });
    }
  }
  return slots;
};

const indiaDayOf = (when: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(when);

/**
 * The doctor's next free slots after a moment, looking up to `days` ahead. The system offers these
 * one at a time: a patient who cannot make one asks for the next.
 */
export const nextFreeSlots = async (doctorId: number, after: Date = new Date(), count = 1, days = 14) => {
  const found: { startsAt: string; time: string; day: string }[] = [];
  const first = new Date(`${indiaDayOf(new Date())}T00:00:00Z`);
  for (let i = 0; i < days && found.length < count; i++) {
    const date = new Date(first);
    date.setUTCDate(date.getUTCDate() + i);
    const day = date.toISOString().slice(0, 10);
    if (day < indiaDayOf(after)) continue;
    for (const slot of await slotsForDay(doctorId, day)) {
      if (slot.available && new Date(slot.startsAt).getTime() > after.getTime() && found.length < count) found.push({ startsAt: slot.startsAt, time: slot.time, day });
    }
  }
  return found;
};
