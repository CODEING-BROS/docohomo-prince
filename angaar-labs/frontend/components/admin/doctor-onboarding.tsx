"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clock, Minus, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/admin/parts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { formatDate, formatDateTime, humanize } from "@/lib/format";
import { type DoctorOnboarding, type DoctorTier, STREAM_STATUS } from "@/lib/onboarding";
import { cn } from "@/lib/utils";
import { ButtonSpinner } from "@/components/custom/loaders";

/** One doctor's progress through the four steps. The card and the page's "About" share this. */
export function useDoctorOnboarding(doctorId: number) {
  return useQuery({ queryKey: ["doctor-onboarding", doctorId], queryFn: () => api<DoctorOnboarding>(`/admin/doctors/${doctorId}/onboarding`) });
}

type StepState = "done" | "skipped" | "now" | "later" | "problem";

const STEP_ICON: Record<StepState, { icon: typeof Check; className: string }> = {
  done: { icon: Check, className: "bg-success text-white" },
  skipped: { icon: Minus, className: "bg-muted text-muted-foreground" },
  now: { icon: Clock, className: "bg-warning/15 text-warning" },
  later: { icon: Clock, className: "bg-muted text-muted-foreground/60" },
  problem: { icon: X, className: "bg-destructive/10 text-destructive" },
};

const NO_LEVEL = "none";
const patientsText = (tier: { minPatientsPerDay: number; maxPatientsPerDay: number }) =>
  tier.minPatientsPerDay === tier.maxPatientsPerDay || tier.minPatientsPerDay === 0 ? `up to ${tier.maxPatientsPerDay}` : `${tier.minPatientsPerDay} to ${tier.maxPatientsPerDay}`;

/**
 * The four onboarding steps of one doctor (registered, documents verified, test, consultations on),
 * with their level and the test they sat. Staff can change the level, waive the test or reset it.
 */
export function DoctorOnboardingCard({ doctorId, doctorName }: { doctorId: number; doctorName: string }) {
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState<"pass" | "reset" | null>(null);

  const { data: state, isPending, isError } = useDoctorOnboarding(doctorId);
  const { data: tierData } = useQuery({ queryKey: ["doctor-tiers"], queryFn: () => api<{ items: DoctorTier[] }>("/admin/doctor-tiers") });
  const refresh = () => ["doctor-onboarding", "doctor", "doctors", "doctor-tiers", "streams"].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));

  const change = useMutation({
    mutationFn: (body: { tierId?: number | null; testPassed?: boolean }) =>
      api<DoctorOnboarding & { consultingSwitchedOn: boolean }>(`/admin/doctors/${doctorId}/onboarding`, { method: "PATCH", body }),
    onSuccess: (saved, body) => {
      if (body.testPassed === true) toast.success(saved.consultingSwitchedOn ? "Test marked as passed. Consultations are now on." : "Test marked as passed");
      else if (body.testPassed === false) toast.success("Test reset. The doctor has to pass it again.");
      else toast.success(saved.tier ? `Moved to the ${saved.tier.name} level` : "Level removed");
      setAsking(null);
      refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  if (isError) return null;
  if (isPending || !state) return <Skeleton className="h-64" />;

  const tiers = (tierData?.items ?? []).filter((tier) => tier.isActive || tier.id === state.tierId);
  const tried = state.attempts.filter((attempt) => attempt.submittedAt !== null);
  const streamLabel = state.stream?.name ?? state.streamName;
  const blocked = state.verificationStatus === "REJECTED" || state.verificationStatus === "SUSPENDED";
  // consulting from before the stream had a test: nothing switches consultations off on its own
  const waived = state.consulting && state.testRequired && !state.testPassed;

  const steps: { title: string; state: StepState; detail: string }[] = [
    {
      title: "Registered", state: "done",
      detail: `Signed up on ${formatDate(state.registeredAt)}${state.submittedAt ? `, sent for checking on ${formatDate(state.submittedAt)}` : ""}.`,
    },
    {
      title: "Documents verified", state: state.verified ? "done" : blocked ? "problem" : "now",
      detail: state.verified ? `Verified${state.verifiedAt ? ` on ${formatDate(state.verifiedAt)}` : ""}.`
        : blocked ? `${humanize(state.verificationStatus)}. Nothing else moves until the doctor is verified again.`
        : "Waiting for staff to check the documents.",
    },
    {
      title: "Test questions",
      state: state.testPassed ? "done" : !state.testRequired ? "skipped" : state.verified ? "now" : "later",
      detail: state.testPassed ? `Passed${state.testPassedAt ? ` on ${formatDate(state.testPassedAt)}` : ""}.`
        : !state.testRequired ? `Not needed: ${streamLabel ? `${streamLabel} has` : "the doctor's stream has"} no test questions in use.`
        : `${tried.length > 0 ? `Not passed yet. Tried ${tried.length} ${tried.length === 1 ? "time" : "times"}.` : state.verified ? "Not taken yet." : "Opens for the doctor once the documents are verified."}${waived ? " This doctor was already consulting, and consultations stay on." : ""}`,
    },
    {
      title: "Consultations on",
      state: state.consulting ? "done" : state.ready ? "now" : "later",
      detail: state.consulting ? `Patients can book this doctor.${state.hasFee ? "" : " No fee is set yet, so set one on the edit page."}`
        : !state.verified ? "Starts after the steps above."
        : state.testRequired && !state.testPassed ? "Starts when the test is passed."
        : !state.streamOpen ? `Waiting for ${streamLabel ?? "the stream"} to open.`
        : state.wantsToConsult ? "Every step is done. Switch consultations on under \"What this doctor can do\"."
        : "Every step is done, but consultations are switched off for this doctor.",
    },
  ];

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Onboarding</CardTitle>
          <CardDescription>
            {waived ? "Consulting, but the test has not been passed yet."
              : state.consulting ? "All four steps are done."
              : `Step ${steps.findIndex((step) => step.state === "now" || step.state === "problem") + 1 || 4} of 4.`}{" "}
            {streamLabel ? (
              <>
                Stream: <span className="font-medium text-foreground">{streamLabel}</span>{" "}
                {state.stream ? (
                  <>
                    <StatusBadge status={STREAM_STATUS[state.stream.status].tone} label={STREAM_STATUS[state.stream.status].label} />
                    {!state.streamOpen && state.stream.status === "OPEN" ? <StatusBadge status="ARCHIVED" label="Switched off" className="ml-1" /> : null}
                  </>
                ) : (
                  <span>(not in the list of streams, so treated as open)</span>
                )}
              </>
            ) : "No stream chosen."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <ol className="grid gap-3">
            {steps.map((step, index) => {
              const { icon: Icon, className } = STEP_ICON[step.state];
              return (
                <li key={step.title} className="flex items-start gap-3">
                  <span className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full", className)}><Icon className="size-3.5" /></span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm font-medium", step.state === "later" && "text-muted-foreground")}>{index + 1}. {step.title}</p>
                    <p className="text-sm text-muted-foreground">{step.detail}</p>
                    {index === 2 ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {state.testPassed ? (
                          <Button size="sm" variant="outline" onClick={() => setAsking("reset")}><RotateCcw /> Reset the test…</Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => setAsking("pass")}><Check /> Mark as passed…</Button>
                        )}
                        {state.stream ? <Link href={`/admin/streams/${state.stream.id}`} className="text-sm text-primary hover:underline">See the questions</Link> : null}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>

          {state.attempts.length > 0 ? (
            <div className="grid gap-2 border-t pt-4">
              <p className="text-[0.6875rem]/none font-semibold tracking-[0.12em] text-muted-foreground uppercase">Tests taken</p>
              <ul className="grid gap-1.5">
                {state.attempts.map((attempt) => (
                  <li key={attempt.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-sm">
                    <span className="min-w-44 flex-1 text-muted-foreground">{formatDateTime(attempt.submittedAt ?? attempt.startedAt)}{attempt.streamName !== streamLabel ? ` · ${attempt.streamName}` : ""}</span>
                    {attempt.submittedAt ? (
                      <>
                        <span className="font-medium ledger">{attempt.score} of {attempt.total} right</span>
                        <StatusBadge status={attempt.passed ? "APPROVED" : "REJECTED"} label={attempt.passed ? "Passed" : "Not passed"} />
                      </>
                    ) : (
                      <StatusBadge status="DRAFT" label="Started, not handed in" />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="grid gap-1.5 border-t pt-4">
            <Label>Level</Label>
            <div className="flex flex-wrap items-center gap-3">
              <Select value={state.tierId ? String(state.tierId) : NO_LEVEL} disabled={change.isPending} onValueChange={(v) => change.mutate({ tierId: v === NO_LEVEL ? null : Number(v) })}>
                <SelectTrigger className="h-9 w-48" aria-label="Level"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_LEVEL}>No level</SelectItem>
                  {tiers.map((tier) => <SelectItem key={tier.id} value={String(tier.id)}>{tier.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="min-w-48 flex-1 text-sm text-muted-foreground">
                {state.tier
                  ? `Takes ${patientsText(state.tier)} patients a day. The platform keeps ${state.commissionPercent}% of each fee.`
                  : `No limit on patients a day. The platform keeps ${state.commissionPercent}% of each fee.`}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              {state.tier && state.tier.commissionPercent !== state.commissionPercent
                ? `The ${state.tier.name} level's share is ${state.tier.commissionPercent}%; this doctor's was changed by hand. Choosing a level sets the doctor's share to the level's.`
                : "Choosing a level also sets the doctor's platform share to the level's."}{" "}
              <Link href="/admin/doctor-tiers" className="text-primary hover:underline">Manage levels</Link>
            </p>
          </div>
        </CardContent>
      </Card>

      <Dialog open={asking !== null} onOpenChange={(open) => !open && setAsking(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="pr-8 leading-snug">{asking === "reset" ? `Reset the test for ${doctorName}?` : `Mark the test as passed for ${doctorName}?`}</DialogTitle>
            <DialogDescription>
              {asking === "reset"
                ? "The doctor will have to pass the test again. Consultations that are already on stay on; switch them off under \"What this doctor can do\" if they should stop."
                : "Use this when you are satisfied with the doctor without the test. If every other step is done, consultations switch on straight away."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAsking(null)}>Cancel</Button>
            <Button variant={asking === "reset" ? "destructive" : "default"} disabled={change.isPending} onClick={() => change.mutate({ testPassed: asking === "pass" })}>
              {change.isPending ? <ButtonSpinner /> : null}{asking === "reset" ? "Reset the test" : "Mark as passed"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
