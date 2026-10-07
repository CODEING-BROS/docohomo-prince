"use client";

import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { clock12 } from "@/components/admin/working-hours";
import { Eyebrow } from "@/components/custom/typography";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

// The time of a consultation is given by the system: the doctor's earliest free slot. A patient who
// cannot make it asks for the next one (and can step back to an earlier one they passed over).
// They do not pick from a calendar.

export type SlotTime = { startsAt: string; time: string; day: string };

const indiaToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const addDay = (day: string) => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
};
export const dayName = (day: string) => {
  const today = indiaToday();
  if (day === today) return "Today";
  if (day === addDay(today)) return "Tomorrow";
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
};
export const slotLabel = (slot: SlotTime) => `${dayName(slot.day)}, ${clock12(slot.time)}`;

/**
 * Keeps the time offered for one doctor. `first` is the slot the server already suggested;
 * without it the earliest free slot is fetched with `reload`.
 */
export function useAssignedTime(slug: string | undefined, first?: SlotTime | null) {
  const fetchAfter = async (after?: string) => (await api<{ slot: SlotTime | null }>(`/care/doctors/${slug}/next-slot`, { query: { after } })).slot;
  // the earliest free slot, asked for only when the page did not already have one
  const earliest = useQuery({ queryKey: ["care-next-slot", slug], queryFn: () => fetchAfter(), enabled: Boolean(slug) && !first, staleTime: 0 });
  const [taken, setTaken] = useState(false); // the offered slot was lost: use the freshly fetched one instead of `first`
  const base = (taken ? earliest.data : first ?? earliest.data) ?? null;
  const [later_, setStack] = useState<SlotTime[]>([]); // the slots asked for after the first, in order
  const [busy, setLoading] = useState(false);
  const stack = base ? [base, ...later_] : [];
  const loading = busy || earliest.isFetching;
  const slot = stack[stack.length - 1] ?? null;
  /** The next free slot after the one on offer. */
  const later = async () => {
    if (!slug || !slot || loading) return;
    setLoading(true);
    try {
      const next = await fetchAfter(slot.startsAt);
      if (next) setStack((current) => [...current, next]);
      else toast.info("That is the doctor's last free time in the next two weeks.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not find another time");
    } finally {
      setLoading(false);
    }
  };
  const earlier = () => setStack((current) => current.slice(0, -1));
  /** Start again from the earliest free slot, for when the offered one was taken meanwhile. */
  const reload = async () => {
    setStack([]);
    setTaken(true);
    await earliest.refetch();
  };
  return { slot, later, earlier, canEarlier: stack.length > 1, loading, reload, moved: stack.length - 1 };
}

export function AssignedTime({ time, size = "md", className }: { time: ReturnType<typeof useAssignedTime>; size?: "sm" | "md"; className?: string }) {
  const { slot, later, earlier, canEarlier, loading } = time;
  if (!slot) return <p className={cn("text-sm text-muted-foreground", className)}>{loading ? "Finding a time…" : "No free time in the next two weeks."}</p>;

  if (size === "sm") {
    return (
      <div className={cn("grid gap-1.5", className)}>
        <p className="flex items-center gap-1.5 text-sm"><Clock className="size-3.5 text-terracotta" /> <span className="ledger font-medium">{slotLabel(slot)}</span></p>
        <div className="flex gap-1.5">
          {canEarlier ? <Button type="button" variant="ghost" size="xs" onClick={earlier}><ChevronLeft data-icon="inline-start" /> Earlier</Button> : null}
          <Button type="button" variant="outline" size="xs" className="flex-1" loading={loading} onClick={later}>Next slot <ChevronRight data-icon="inline-end" /></Button>
        </div>
      </div>
    );
  }
  return (
    <div className={cn("rounded-xl border border-terracotta/40 bg-terracotta-soft/40 p-4 shadow-[inset_3px_0_0_var(--terracotta)]", className)}>
      <Eyebrow className="text-terracotta">{time.moved ? "Your time" : "Your time · the doctor's earliest free slot"}</Eyebrow>
      <p className="font-display ledger mt-1.5 text-3xl font-medium" aria-live="polite">{slotLabel(slot)}</p>
      <p className="mt-1 text-sm text-muted-foreground">India time. Not comfortable with this? Ask for the next one.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {canEarlier ? <Button type="button" variant="ghost" onClick={earlier}><ChevronLeft data-icon="inline-start" /> Earlier time</Button> : null}
        <Button type="button" variant="outline" loading={loading} onClick={later}>Next slot <ChevronRight data-icon="inline-end" /></Button>
      </div>
    </div>
  );
}
