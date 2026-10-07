"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, FileText, Phone, Video } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/admin/parts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { APPOINTMENT_LABEL, type DoctorAppointment, MODE_LABEL } from "@/lib/care";
import { formatDateTime, formatMoneyExact } from "@/lib/format";
import { getTimeZone } from "@/lib/timezone";
import { FileChips } from "@/components/custom/file-chips";

export const APPOINTMENT_TONE: Record<string, string> = { CONFIRMED: "CONFIRMED", IN_PROGRESS: "PENDING", COMPLETED: "DELIVERED", CANCELLED: "CANCELLED", NO_SHOW: "CANCELLED", PENDING_PAYMENT: "PENDING" };

/** One appointment with everything the doctor can do to it. */
export function AppointmentCard({ appointment: a, onPrescribe }: { appointment: DoctorAppointment; onPrescribe: (a: DoctorAppointment) => void }) {
  const queryClient = useQueryClient();
  const act = useMutation({
    mutationFn: (action: "start" | "complete" | "no_show") => api(`/doctor/appointments/${a.id}`, { method: "PATCH", body: { action } }),
    onSuccess: () => ["doctor-appointments", "doctor-overview", "doctor-earnings", "doctor-stats"].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    onError: (err) => toast.error(err.message),
  });
  const live = a.status === "CONFIRMED" || a.status === "IN_PROGRESS";
  const started = new Date(a.scheduledAt) <= new Date();
  const ModeIcon = a.mode === "AUDIO" ? Phone : Video;

  return (
    <Card>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><ModeIcon className="size-4.5" /></span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 font-medium">
              {a.patientName}
              <span className="text-sm font-normal text-muted-foreground">{[a.patientAge !== null ? `${a.patientAge} yrs` : null, a.patientGender?.toLowerCase()].filter(Boolean).join(", ")}</span>
              <StatusBadge status={APPOINTMENT_TONE[a.status]} label={APPOINTMENT_LABEL[a.status]} />
            </p>
            <p className="text-sm text-muted-foreground">{formatDateTime(a.scheduledAt)} · {MODE_LABEL[a.mode]} · {a.durationMinutes} min · {a.appointmentNumber}</p>
          </div>
          <p className="text-right text-sm">
            <span className="font-semibold ledger">{formatMoneyExact(a.doctorEarning || a.fee)}</span>
            <span className="block text-xs text-muted-foreground">{a.status === "COMPLETED" ? (a.paidOut ? "Paid to you" : "Waiting for payout") : a.doctorEarning ? "Your share" : "Fee"}</span>
          </p>
        </div>
        {a.symptoms ? <p className="rounded-lg bg-surface-2 p-2.5 text-sm whitespace-pre-line"><span className="text-muted-foreground">Problem:</span> {a.symptoms}</p> : null}
        {a.files?.length ? <FileChips files={a.files} hrefOf={(file) => `/api/doctor/consultation-files/${file.id}?panel=doctor`} /> : null}
        {a.intake ? (
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {a.intake.severity ? <span>Severity: <span className="font-medium text-foreground">{a.intake.severity.toLowerCase()}</span></span> : null}
            {a.intake.conditions ? <span>Conditions: <span className="font-medium text-foreground">{a.intake.conditions}</span></span> : null}
            {a.intake.diagnosis ? <span>Earlier diagnosis: <span className="font-medium text-foreground">{a.intake.diagnosis}</span></span> : null}
            {a.intake.medications ? <span>Medicines: <span className="font-medium text-foreground">{a.intake.medications}</span></span> : null}
            {a.intake.language ? <span>Prefers: <span className="font-medium text-foreground">{a.intake.language}</span></span> : null}
            {a.intake.city ? <span>City: <span className="font-medium text-foreground">{a.intake.city}</span></span> : null}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {live && a.meetingUrl ? (
            <Button asChild>
              <a href={a.meetingUrl} target="_blank" rel="noreferrer" onClick={() => a.status === "CONFIRMED" && act.mutate("start")}><Video /> {a.status === "IN_PROGRESS" ? "Rejoin the call" : "Start the call"}</a>
            </Button>
          ) : null}
          {a.status !== "CANCELLED" && a.status !== "NO_SHOW" && a.status !== "PENDING_PAYMENT" ? (
            <Button variant="outline" onClick={() => onPrescribe(a)}>
              <FileText /> {a.prescription?.status === "ISSUED" ? "View prescription" : a.prescription ? "Continue prescription" : "Write prescription"}
            </Button>
          ) : null}
          {live ? <Button variant="outline" disabled={act.isPending} onClick={() => act.mutate("complete")}><CheckCircle2 /> Mark as done</Button> : null}
          {live && started ? <Button variant="ghost" disabled={act.isPending} onClick={() => act.mutate("no_show")}>Patient did not join</Button> : null}
        </div>
      </CardContent>
    </Card>
  );
}

/** Upcoming appointments, or past ones (optionally only those between two days). */
export const useAppointments = (scope: "upcoming" | "past", range?: { from: string; to: string } | null) =>
  useQuery({
    queryKey: ["doctor-appointments", scope, range ?? null],
    queryFn: () => api<{ items: DoctorAppointment[] }>("/doctor/appointments", { query: { scope, ...(range ?? {}), tz: getTimeZone() } }),
    placeholderData: (previous) => previous,
  });

export function AppointmentList({ scope, search = "", range, onPrescribe }: { scope: "upcoming" | "past"; search?: string; range?: { from: string; to: string } | null; onPrescribe: (a: DoctorAppointment) => void }) {
  const { data, isPending } = useAppointments(scope, range);
  if (isPending) return <div className="grid gap-3"><Skeleton className="h-32 rounded-xl" /><Skeleton className="h-32 rounded-xl" /></div>;
  const text = search.trim().toLowerCase();
  const items = (data?.items ?? []).filter((a) => !text || a.patientName.toLowerCase().includes(text) || a.appointmentNumber.toLowerCase().includes(text));

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-14 text-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground"><CalendarClock className="size-5" /></span>
        <p className="font-medium">{text ? "No appointment matches that search" : scope === "upcoming" ? "No appointments booked" : range ? "No consultations in this period" : "No past consultations yet"}</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {text ? "Try the patient's name or the appointment number." : scope === "upcoming" ? "When a patient books one of your slots, it appears here with the link to start the call." : "Consultations you have finished are listed here with what you earned."}
        </p>
      </div>
    );
  }
  return <div className="grid gap-3">{items.map((a) => <AppointmentCard key={a.id} appointment={a} onPrescribe={onPrescribe} />)}</div>;
}
