"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { WEEKDAYS } from "@/lib/doctor";
import { todayInZone } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { ButtonSpinner } from "@/components/custom/loaders";

type SavedHours = { id: number; dayOfWeek: number; startTime: string; endTime: string };
type Hours = { key: string; dayOfWeek: number; startTime: string; endTime: string };
type Slot = { startsAt: string; time: string; available: boolean; reason: string | null };

export const clock12 = (time: string) => {
  const [hour, minute] = time.split(":").map(Number);
  return `${hour % 12 === 0 ? 12 : hour % 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
};

let hoursKey = 0;

/**
 * Weekly working hours: any number of time ranges per day, plus a preview of the slots a patient
 * would see. `base` is the API path that has `/availability` and `/slots` under it: the admin uses
 * `/admin/doctors/12`, a doctor editing their own hours uses `/doctor`.
 */
export function WorkingHours({
  base, saved, slotMinutes: savedSlotMinutes, onSaved,
}: { base: string; saved: SavedHours[]; slotMinutes: number; onSaved: () => void }) {
  const [hours, setHours] = useState<Hours[]>(() => saved.map((a) => ({ key: `saved-${a.id}`, dayOfWeek: a.dayOfWeek, startTime: a.startTime, endTime: a.endTime })));
  const [slotMinutes, setSlotMinutes] = useState(String(savedSlotMinutes));
  const [previewDay, setPreviewDay] = useState(todayInZone());

  const { data: preview } = useQuery({
    queryKey: ["doctor-slots", base, previewDay, saved, savedSlotMinutes],
    queryFn: () => api<{ slots: Slot[] }>(`${base}/slots`, { query: { date: previewDay } }),
  });

  const save = useMutation({
    mutationFn: () =>
      api(`${base}/availability`, {
        method: "PUT",
        body: { slotMinutes: Number(slotMinutes), hours: hours.map((h) => ({ dayOfWeek: h.dayOfWeek, startTime: h.startTime, endTime: h.endTime })) },
      }),
    onSuccess: () => { toast.success("Working hours saved"); onSaved(); },
    onError: (err) => toast.error(err.message),
  });

  const add = (dayOfWeek: number) => setHours((current) => [...current, { key: `new-${++hoursKey}`, dayOfWeek, startTime: "10:00", endTime: "13:00" }]);
  const change = (key: string, field: "startTime" | "endTime", value: string) => setHours((current) => current.map((h) => (h.key === key ? { ...h, [field]: value } : h)));
  const copyToAll = (dayOfWeek: number) =>
    setHours((current) => {
      const source = current.filter((h) => h.dayOfWeek === dayOfWeek);
      return [0, 1, 2, 3, 4, 5, 6].flatMap((day) => (day === dayOfWeek ? source : source.map((h) => ({ ...h, key: `new-${++hoursKey}`, dayOfWeek: day }))));
    });

  const free = preview?.slots.filter((s) => s.available).length ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Working hours</CardTitle>
        <CardDescription>The hours each week when patients can book. India time.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2">
          {WEEKDAYS.map((name, day) => {
            const ranges = hours.filter((h) => h.dayOfWeek === day);
            return (
              <div key={name} className="flex flex-wrap items-start gap-x-3 gap-y-2 rounded-lg border p-2.5">
                <span className="w-24 pt-1.5 text-sm font-medium">{name}</span>
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  {ranges.length === 0 ? <span className="py-1.5 text-sm text-muted-foreground">Not working</span> : null}
                  {ranges.map((range) => (
                    <span key={range.key} className="flex items-center gap-1 rounded-md bg-muted/60 p-1">
                      <Input type="time" aria-label={`${name} from`} className="h-8 w-28" value={range.startTime} onChange={(e) => change(range.key, "startTime", e.target.value)} />
                      <span className="text-xs text-muted-foreground">to</span>
                      <Input type="time" aria-label={`${name} until`} className="h-8 w-28" value={range.endTime} onChange={(e) => change(range.key, "endTime", e.target.value)} />
                      <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove this ${name} time range`} onClick={() => setHours((current) => current.filter((h) => h.key !== range.key))}><X /></Button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="sm" onClick={() => add(day)}><Plus /> Add hours</Button>
                  {ranges.length ? <Button type="button" variant="ghost" size="sm" onClick={() => copyToAll(day)}>Copy to all days</Button> : null}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <Label>Each slot lasts</Label>
            <Select value={slotMinutes} onValueChange={setSlotMinutes}>
              <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
              <SelectContent>{["10", "15", "20", "30", "45", "60"].map((m) => <SelectItem key={m} value={m}>{m} minutes</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button className="h-9" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? <ButtonSpinner /> : null}Save working hours</Button>
        </div>

        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-medium">What a patient sees on</p>
            <Input type="date" aria-label="Preview date" className="h-8 w-40" value={previewDay} min={todayInZone()} onChange={(e) => setPreviewDay(e.target.value)} />
            <p className="text-sm text-muted-foreground">{preview ? `${free} of ${preview.slots.length} slots free` : "Loading…"}</p>
          </div>
          {preview && preview.slots.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {preview.slots.map((slot) => (
                <span key={slot.startsAt} title={slot.reason ?? "Free"} className={cn("rounded-md border px-2 py-1 text-xs ledger", slot.available ? "bg-background" : "bg-muted text-muted-foreground line-through")}>
                  {clock12(slot.time)}
                </span>
              ))}
            </div>
          ) : preview ? (
            <p className="mt-2 text-sm text-muted-foreground">No slots on this day. Save working hours for this weekday to open some.</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
