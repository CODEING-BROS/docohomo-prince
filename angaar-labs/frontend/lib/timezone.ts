"use client";

import { useSyncExternalStore } from "react";

// The timezone the admin shows dates in. Chosen in the header, remembered on this device,
// and sent to the backend so "today" and chart days are counted in the same zone.

export const DEFAULT_ZONE = "Asia/Kolkata";

export const ZONES: { value: string; label: string; short: string }[] = [
  { value: "Asia/Kolkata", label: "India", short: "IST" },
  { value: "UTC", label: "UTC", short: "UTC" },
  { value: "Asia/Dubai", label: "Dubai", short: "GST" },
  { value: "Asia/Singapore", label: "Singapore", short: "SGT" },
  { value: "Europe/London", label: "London", short: "UK" },
  { value: "America/New_York", label: "New York", short: "ET" },
];

const STORAGE_KEY = "dh_timezone";
const listeners = new Set<() => void>();
let current: string | null = null;

const read = () => {
  if (current) return current;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    current = saved && ZONES.some((zone) => zone.value === saved) ? saved : DEFAULT_ZONE;
  } catch {
    current = DEFAULT_ZONE;
  }
  return current;
};

/** The current zone. Safe to call anywhere; on the server it is the default. */
export const getTimeZone = () => (typeof window === "undefined" ? DEFAULT_ZONE : read());

export const setTimeZone = (zone: string) => {
  current = zone;
  try {
    window.localStorage.setItem(STORAGE_KEY, zone);
  } catch {
    // private windows may refuse storage; the choice then lasts for this visit only
  }
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useTimeZone = () => useSyncExternalStore(subscribe, read, () => DEFAULT_ZONE);

export const zoneShortName = (zone: string) => ZONES.find((z) => z.value === zone)?.short ?? zone;

/** Today's calendar day (yyyy-MM-dd) in the current zone. */
export const todayInZone = () => new Intl.DateTimeFormat("en-CA", { timeZone: getTimeZone() }).format(new Date());

/** Moves a calendar day by whole days. */
export const shiftDay = (day: string, days: number) => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
