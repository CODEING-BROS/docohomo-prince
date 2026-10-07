import { z } from "zod";

// Calendar days ("2026-10-05") only mean something in a timezone. The admin sends the zone it is
// showing times in, so "today" and each day on a chart match what the person sees on screen.

export const DEFAULT_ZONE = "Asia/Kolkata";

const isZone = (zone: string) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};

export const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const zoneParam = z.preprocess((v) => (v === "" ? undefined : v), z.string().refine(isZone, "Unknown timezone").default(DEFAULT_ZONE));

/** The calendar day an instant falls on in a zone. */
export const dayInZone = (at: Date, zone: string) => new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(at);

/** Minutes the zone is ahead of UTC at that instant (330 for India). */
const offsetMinutes = (at: Date, zone: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const part = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const wallClock = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
  return Math.round((wallClock - at.getTime()) / 60_000);
};

/** The instant a calendar day starts in a zone. */
export const dayStart = (day: string, zone: string) => {
  const utcMidnight = new Date(`${day}T00:00:00Z`).getTime();
  const guess = new Date(utcMidnight - offsetMinutes(new Date(utcMidnight), zone) * 60_000);
  // the offset can differ at the corrected instant on a daylight-saving change day
  return new Date(utcMidnight - offsetMinutes(guess, zone) * 60_000);
};

/** Moves a calendar day forward or back by whole days. */
export const addDays = (day: string, days: number) => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export const daysBetween = (fromDay: string, toDay: string) =>
  Math.round((Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / 86_400_000);
