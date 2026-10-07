"use client";

import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { DayRange } from "@/components/doctor/period-filter";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { useTimeZone } from "@/lib/timezone";

type Metric = { value: number; change: number | null };
export type DoctorStats = {
  range: { from: string; to: string; unit: "day" | "month"; firstDay: string };
  totals: { earned: Metric; consultations: Metric; booked: Metric; missed: Metric; patients: Metric };
  averagePerConsultation: number;
  series: { date: string; earned: number; consultations: number }[];
};

/** Earnings, consultations and bookings for the chosen period. The last numbers stay on screen while new ones load. */
export const useDoctorStats = (range: DayRange) => {
  const tz = useTimeZone();
  return useQuery({
    queryKey: ["doctor-stats", range, tz],
    queryFn: () => api<DoctorStats>("/doctor/stats", { query: { ...range, tz } }),
    placeholderData: (previous) => previous,
  });
};

const config = { earned: { label: "Earned", color: "var(--chart-1)" } } satisfies ChartConfig;
const show = (day: string, options: Intl.DateTimeFormatOptions) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-IN", { ...options, timeZone: "UTC" });

/** What the doctor earned on each day of the period, or in each month when the period is long. */
export function EarningsChart({ stats, className = "h-64" }: { stats: DoctorStats; className?: string }) {
  const byDay = stats.range.unit === "day";
  const tick = (day: string) => (byDay ? show(day, { day: "numeric", month: "short" }) : show(day, { month: "short", year: "2-digit" }));
  return (
    <ChartContainer config={config} className={`aspect-auto w-full ${className}`}>
      <BarChart data={stats.series} margin={{ left: 0, right: 4, top: 4 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={tick} />
        <YAxis tickLine={false} axisLine={false} width={48} allowDecimals={false} tickFormatter={(v: number) => (v >= 1000 ? `₹${Math.round(v / 100) / 10}K` : `₹${v}`)} />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              labelFormatter={(_label, payload) => {
                const day = payload?.[0]?.payload?.date as string | undefined;
                return day ? (byDay ? show(day, { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : show(day, { month: "long", year: "numeric" })) : "";
              }}
              formatter={(value, _name, item) => (
                <span className="flex w-full items-center justify-between gap-4">
                  <span className="text-muted-foreground">{item.payload.consultations} consultation{item.payload.consultations === 1 ? "" : "s"}</span>
                  <span className="font-medium ledger">{formatMoney(Number(value))}</span>
                </span>
              )}
            />
          }
        />
        <Bar dataKey="earned" fill="var(--color-earned)" radius={stats.series.length > 45 ? 1 : 4} />
      </BarChart>
    </ChartContainer>
  );
}
