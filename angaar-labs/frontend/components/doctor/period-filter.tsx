"use client";

import { type DayRange, DateRangePicker } from "@/components/admin/date-range-picker";
import { FilterChips } from "@/components/custom/filter-chips";
import { shiftDay, todayInZone } from "@/lib/timezone";

export type { DayRange };

export const lastDays = (days: number): DayRange => {
  const today = todayInZone();
  return { from: shiftDay(today, 1 - days), to: today };
};

const QUICK = [
  { label: "Today", days: 1 },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "3 months", days: 90 },
  { label: "6 months", days: 180 },
  { label: "1 year", days: 365 },
];

/** In words, for card hints: "today", "the last 7 days", or the two dates. */
export const describePeriod = (range: DayRange) => {
  const quick = QUICK.find((q) => { const r = lastDays(q.days); return r.from === range.from && r.to === range.to; });
  if (quick) return quick.days === 1 ? "today" : `the last ${quick.label}`;
  const show = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return range.from === range.to ? show(range.from) : `${show(range.from)} to ${show(range.to)}`;
};

/**
 * One-click periods (Today, 7 days, 30 days…) plus a calendar for any two dates.
 * "All" starts on the day of the doctor's first appointment.
 */
export function PeriodFilter({ value, onChange, firstDay }: { value: DayRange; onChange: (range: DayRange) => void; firstDay?: string }) {
  const today = todayInZone();
  const ranges = [
    ...QUICK.map((quick) => ({ label: quick.label, range: lastDays(quick.days) })),
    ...(firstDay && firstDay < today ? [{ label: "All", range: { from: firstDay, to: today } }] : []),
  ];
  const current = ranges.find((r) => r.range.from === value.from && r.range.to === value.to)?.label ?? "";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterChips
        variant="segmented" scrollable={false} ariaLabel="Period" value={current}
        onChange={(label) => { const found = ranges.find((r) => r.label === label); if (found) onChange(found.range); }}
        options={ranges.map((r) => ({ value: r.label, label: r.label }))}
      />
      <DateRangePicker value={value} onChange={(next) => onChange(next ?? lastDays(30))} />
    </div>
  );
}

/** The same words starting with a capital, for use on their own: "Today", "The last 7 days". */
export const periodLabel = (range: DayRange) => {
  const text = describePeriod(range);
  return text.charAt(0).toUpperCase() + text.slice(1);
};
