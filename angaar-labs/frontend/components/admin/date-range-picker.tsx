"use client";

import { endOfMonth, format, startOfMonth, startOfYear, subDays, subMonths } from "date-fns";
import { CalendarDays } from "lucide-react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toDay } from "@/lib/format";
import { cn } from "@/lib/utils";

export type DayRange = { from: string; to: string }; // yyyy-MM-dd, both inclusive

const today = () => new Date();

const PRESETS: { label: string; range: () => [Date, Date] }[] = [
  { label: "Today", range: () => [today(), today()] },
  { label: "Last 7 days", range: () => [subDays(today(), 6), today()] },
  { label: "Last 30 days", range: () => [subDays(today(), 29), today()] },
  { label: "Last 90 days", range: () => [subDays(today(), 89), today()] },
  { label: "This month", range: () => [startOfMonth(today()), today()] },
  { label: "Last month", range: () => [startOfMonth(subMonths(today(), 1)), endOfMonth(subMonths(today(), 1))] },
  { label: "Last 12 months", range: () => [startOfMonth(subMonths(today(), 11)), today()] },
  { label: "This year", range: () => [startOfYear(today()), today()] },
];

const parseDay = (day: string) => new Date(`${day}T00:00:00`);
const describe = (range: DayRange) =>
  `${format(parseDay(range.from), "d MMM yyyy")} – ${format(parseDay(range.to), "d MMM yyyy")}`;

export function DateRangePicker({
  value, onChange, placeholder = "Any date", align = "end", className,
}: {
  value: DayRange | null;
  onChange: (range: DayRange | null) => void;
  placeholder?: string;
  align?: "start" | "end";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>();

  const selected: DateRange | undefined = draft ?? (value ? { from: parseDay(value.from), to: parseDay(value.to) } : undefined);

  const apply = (from: Date, to: Date) => {
    onChange({ from: toDay(from), to: toDay(to) });
    setDraft(undefined);
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setDraft(undefined);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("h-9 justify-start gap-2 font-normal", !value && "text-muted-foreground", className)}>
          <CalendarDays className="size-4" />
          {value ? describe(value) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} className="flex w-auto flex-col gap-0 p-0 sm:flex-row">
        <div className="flex flex-row flex-wrap gap-1 border-b p-2 sm:w-40 sm:flex-col sm:flex-nowrap sm:border-r sm:border-b-0">
          {PRESETS.map((preset) => {
            const [from, to] = preset.range();
            const active = value?.from === toDay(from) && value?.to === toDay(to);
            return (
              <Button
                key={preset.label}
                variant={active ? "secondary" : "ghost"}
                size="sm"
                className="justify-start font-normal"
                onClick={() => apply(from, to)}
              >
                {preset.label}
              </Button>
            );
          })}
          {value ? (
            <Button
              variant="ghost"
              size="sm"
              className="justify-start font-normal text-muted-foreground"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              Clear dates
            </Button>
          ) : null}
        </div>
        <div className="p-2">
          <Calendar
            mode="range"
            numberOfMonths={2}
            defaultMonth={selected?.from ? subMonths(selected.to ?? selected.from, 1) : subMonths(today(), 1)}
            selected={selected}
            onSelect={setDraft}
            disabled={{ after: today() }}
          />
          <div className="flex items-center justify-between gap-2 border-t px-2 pt-2">
            <p className="text-xs text-muted-foreground">
              {draft?.from ? `${format(draft.from, "d MMM yyyy")} – ${draft.to ? format(draft.to, "d MMM yyyy") : "pick an end date"}` : "Pick a start and an end date"}
            </p>
            <Button size="sm" disabled={!draft?.from || !draft?.to} onClick={() => draft?.from && draft.to && apply(draft.from, draft.to)}>
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
