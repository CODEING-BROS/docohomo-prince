"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Award, Pencil, Plus, Trash2, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BulkActions, SelectAll, SelectRow, useSelection } from "@/components/admin/bulk";
import { EmptyState, PageHeader, StatusBadge } from "@/components/admin/parts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import type { DoctorTier } from "@/lib/onboarding";
import { ButtonSpinner, Spinner } from "@/components/custom/loaders";

type Draft = {
  id: number | null; name: string; description: string; minPatientsPerDay: string; maxPatientsPerDay: string;
  commissionPercent: string; sortOrder: string; isActive: boolean; doctorCount: number; savedPercent: number | null;
  promoteAfterConsultations: string; promoteMinRating: string;
};
const emptyDraft: Draft = { id: null, name: "", description: "", minPatientsPerDay: "", maxPatientsPerDay: "", commissionPercent: "", sortOrder: "", isActive: true, doctorCount: 0, savedPercent: null, promoteAfterConsultations: "", promoteMinRating: "" };

const doctorWord = (count: number) => `${formatNumber(count)} ${count === 1 ? "doctor" : "doctors"}`;
const patientsText = (tier: Pick<DoctorTier, "minPatientsPerDay" | "maxPatientsPerDay">) =>
  tier.minPatientsPerDay === tier.maxPatientsPerDay ? formatNumber(tier.maxPatientsPerDay)
  : tier.minPatientsPerDay === 0 ? `Up to ${formatNumber(tier.maxPatientsPerDay)}`
  : `${formatNumber(tier.minPatientsPerDay)} to ${formatNumber(tier.maxPatientsPerDay)}`;
/** 30 -> "30%", 22.5 -> "22.5%" */
const percent = (value: number) => `${Number(value.toFixed(2))}%`;
/** "after 100 consultations with a rating of 4 or more", or null when the level has no rule */
const ruleText = (tier: Pick<DoctorTier, "promoteAfterConsultations" | "promoteMinRating">) => {
  const count = tier.promoteAfterConsultations === null ? null : `after ${formatNumber(tier.promoteAfterConsultations)} ${tier.promoteAfterConsultations === 1 ? "consultation" : "consultations"}`;
  const rating = tier.promoteMinRating === null ? null : `a rating of ${tier.promoteMinRating} or more`;
  return count && rating ? `${count} with ${rating}` : count ?? (rating ? `with ${rating}` : null);
};

export default function DoctorTiersPage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<DoctorTier | null>(null);

  const { data, isPending, isError } = useQuery({ queryKey: ["doctor-tiers"], queryFn: () => api<{ items: DoctorTier[] }>("/admin/doctor-tiers") });
  const tiers = useMemo(() => data?.items ?? [], [data]);
  const tierIds = useMemo(() => tiers.map((tier) => tier.id), [tiers]);
  const selection = useSelection(tierIds);
  const refresh = () => ["doctor-tiers", "doctor", "doctor-onboarding"].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));

  const save = useMutation({
    mutationFn: (d: Draft) =>
      api<DoctorTier & { doctorsUpdated?: number }>(d.id ? `/admin/doctor-tiers/${d.id}` : "/admin/doctor-tiers", {
        method: d.id ? "PATCH" : "POST",
        body: {
          name: d.name, description: d.description, minPatientsPerDay: Number(d.minPatientsPerDay || 0), maxPatientsPerDay: Number(d.maxPatientsPerDay),
          commissionPercent: Number(d.commissionPercent), isActive: d.isActive, ...(d.sortOrder !== "" ? { sortOrder: Number(d.sortOrder) } : {}),
          promoteAfterConsultations: d.promoteAfterConsultations === "" ? null : Number(d.promoteAfterConsultations),
          promoteMinRating: d.promoteMinRating === "" ? null : Number(d.promoteMinRating),
        },
      }),
    onSuccess: (saved, d) => {
      toast.success(d.id ? `${saved.name} level updated` : `${saved.name} level added`);
      if (saved.doctorsUpdated) toast.success(`The new platform share now applies to the ${doctorWord(saved.doctorsUpdated)} on this level`);
      setDraft(null);
      refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: (tier: DoctorTier) => api(`/admin/doctor-tiers/${tier.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Level deleted");
      setDeleting(null);
      refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  const promote = useMutation({
    mutationFn: () => api<{ promoted: { doctor: string; from: string | null; to: string }[] }>("/admin/doctor-tiers/promote-now", { method: "POST", body: {} }),
    onSuccess: ({ promoted }) => {
      if (promoted.length === 0) toast.info("Nobody has earned a higher level yet");
      else toast.success(`${promoted.map((p) => `${p.doctor} moved up to ${p.to}`).slice(0, 5).join(". ")}${promoted.length > 5 ? `, and ${formatNumber(promoted.length - 5)} more` : ""}. They have been told.`);
      refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  const edit = (tier: DoctorTier) =>
    setDraft({
      id: tier.id, name: tier.name, description: tier.description ?? "", minPatientsPerDay: String(tier.minPatientsPerDay), maxPatientsPerDay: String(tier.maxPatientsPerDay),
      commissionPercent: String(tier.commissionPercent), sortOrder: String(tier.sortOrder), isActive: tier.isActive, doctorCount: tier.doctorCount, savedPercent: tier.commissionPercent,
      promoteAfterConsultations: tier.promoteAfterConsultations === null ? "" : String(tier.promoteAfterConsultations), promoteMinRating: tier.promoteMinRating === null ? "" : String(tier.promoteMinRating),
    });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    if (Number(draft.minPatientsPerDay || 0) > Number(draft.maxPatientsPerDay)) return toast.error("The most patients a day cannot be less than the fewest");
    save.mutate(draft);
  };

  const shareChanges = draft?.id && draft.doctorCount > 0 && draft.commissionPercent !== "" && Number(draft.commissionPercent) !== draft.savedPercent;

  return (
    <>
      <PageHeader title="Doctor levels" description="How many patients a day a doctor takes, and what share of each consultation fee the platform keeps">
        {tiers.some((tier) => tier.isActive && ruleText(tier)) ? (
          <Button variant="outline" className="h-9" disabled={promote.isPending} onClick={() => promote.mutate()}>
            {promote.isPending ? <Spinner size="sm" /> : <TrendingUp />}
            Check promotions now
          </Button>
        ) : null}
        <Button className="h-9" onClick={() => setDraft(emptyDraft)}><Plus /> Add level</Button>
      </PageHeader>

      <Card className="mb-4 bg-muted/30">
        <CardContent className="text-sm text-muted-foreground">
          <p className="font-medium text-foreground">How levels work</p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
            <li>A new doctor starts on the first level below when they pass the test. Move a doctor up or down from the doctor&apos;s own page.</li>
            <li>Give a level a &quot;moves up&quot; rule and doctors reach it by themselves: every morning each doctor is checked and moved up when they have earned it, with a message to tell them. Nobody is ever moved down automatically.</li>
            <li>Once a doctor has the day&apos;s highest number of bookings, patients cannot book that day any more.</li>
            <li>The platform share is taken from each consultation fee; the doctor is paid the rest.</li>
          </ul>
        </CardContent>
      </Card>

      {isError ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Could not load the levels. Check that the backend is running.</p>
      ) : isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-44" />)}</div>
      ) : tiers.length === 0 ? (
        <Card className="py-0"><EmptyState icon={Award} title="No levels yet" description="Add levels such as Bronze, Silver and Gold to set how many patients a doctor takes a day and what the platform keeps." /></Card>
      ) : (
        <>
        <div className="mb-3 flex min-h-9 flex-wrap items-center gap-2">
          <SelectAll selection={selection} noun="levels" />
          <BulkActions table="doctor-tiers" noun="levels" selection={selection} exportable={false} refresh={["doctor-tiers", "doctor", "doctor-onboarding"]} deleteNote="Levels that still have doctors on them are kept." />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {tiers.map((tier, index) => (
            <Card key={tier.id} className={selection.has(tier.id) ? "ring-2 ring-primary" : undefined}>
              <CardContent className="grid gap-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="mt-1"><SelectRow selection={selection} id={tier.id} label={`the ${tier.name} level`} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-base font-medium">
                      <Award className="size-4 shrink-0 text-primary" />
                      <span className="truncate">{tier.name}</span>
                      {tier.isActive ? null : <StatusBadge status="ARCHIVED" label="Switched off" />}
                      {tier.isActive && tiers.findIndex((t) => t.isActive) === index ? <StatusBadge status="CONFIRMED" label="Starting level" /> : null}
                    </p>
                    {tier.description ? <p className="mt-0.5 text-xs text-muted-foreground">{tier.description}</p> : null}
                  </div>
                  <div className="flex shrink-0">
                    <Button variant="ghost" size="icon-sm" aria-label={`Edit the ${tier.name} level`} onClick={() => edit(tier)}><Pencil /></Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Delete the ${tier.name} level`} onClick={() => setDeleting(tier)}><Trash2 /></Button>
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-xs text-muted-foreground">Patients a day</dt><dd className="mt-0.5 font-medium ledger">{patientsText(tier)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Doctors on this level</dt><dd className="mt-0.5 font-medium ledger">{formatNumber(tier.doctorCount)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Platform share</dt><dd className="mt-0.5 font-medium ledger">{percent(tier.commissionPercent)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Doctor keeps</dt><dd className="mt-0.5 ledger">{percent(100 - tier.commissionPercent)}</dd></div>
                </dl>
                <p className="flex items-start gap-2 border-t pt-3 text-xs text-muted-foreground">
                  <TrendingUp className="mt-px size-3.5 shrink-0" />
                  {tier.isActive && tiers.findIndex((t) => t.isActive) === index
                    ? "Doctors start here when they pass the test."
                    : ruleText(tier) ? <span>Doctors move up to this level <span className="text-foreground">{ruleText(tier)}</span>.</span> : "No rule: only staff move a doctor to this level."}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
        </>
      )}

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit level" : "Add level"}</DialogTitle>
            <DialogDescription>A level sets how busy a doctor can be and how each fee is split.</DialogDescription>
          </DialogHeader>
          {draft ? (
            <form id="tier-form" className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="tier-name">Name</Label>
                <Input id="tier-name" required autoFocus minLength={2} maxLength={40} placeholder="Platinum" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="tier-description">Description <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Textarea id="tier-description" rows={2} maxLength={300} placeholder="Who this level is for" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="tier-min">Fewest patients a day</Label>
                <Input id="tier-min" type="number" inputMode="numeric" min={0} max={1000} step={1} className="h-9" placeholder="0" value={draft.minPatientsPerDay} onChange={(e) => setDraft({ ...draft, minPatientsPerDay: e.target.value })} />
                <p className="text-xs text-muted-foreground">What the doctor is expected to see.</p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="tier-max">Most patients a day</Label>
                <Input id="tier-max" required type="number" inputMode="numeric" min={Math.max(1, Number(draft.minPatientsPerDay) || 1)} max={1000} step={1} className="h-9" value={draft.maxPatientsPerDay} onChange={(e) => setDraft({ ...draft, maxPatientsPerDay: e.target.value })} />
                <p className="text-xs text-muted-foreground">Bookings stop for the day at this number.</p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="tier-share">Platform share (%)</Label>
                <Input id="tier-share" required type="number" inputMode="decimal" min={0} max={90} step="0.5" className="h-9" value={draft.commissionPercent} onChange={(e) => setDraft({ ...draft, commissionPercent: e.target.value })} />
                <p className="text-xs text-muted-foreground">
                  {draft.commissionPercent !== "" && Number(draft.commissionPercent) <= 90 ? `The doctor keeps ${percent(100 - Number(draft.commissionPercent))} of each fee.` : "Kept from each consultation fee."}
                </p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="tier-order">Order <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input id="tier-order" type="number" inputMode="numeric" min={0} step={1} className="h-9" placeholder="Goes last" value={draft.sortOrder} onChange={(e) => setDraft({ ...draft, sortOrder: e.target.value })} />
                <p className="text-xs text-muted-foreground">Lowest comes first. New doctors start on the first level.</p>
              </div>
              <fieldset className="grid gap-4 rounded-lg border p-3 sm:col-span-2 sm:grid-cols-2">
                <legend className="px-1 text-sm font-medium">Moving up to this level automatically</legend>
                <div className="grid content-start gap-1.5">
                  <Label htmlFor="tier-promote-count">Completed consultations</Label>
                  <Input id="tier-promote-count" type="number" inputMode="numeric" min={1} max={100000} step={1} className="h-9" placeholder="No rule" value={draft.promoteAfterConsultations} onChange={(e) => setDraft({ ...draft, promoteAfterConsultations: e.target.value })} />
                  <p className="text-xs text-muted-foreground">The doctor needs at least this many.</p>
                </div>
                <div className="grid content-start gap-1.5">
                  <Label htmlFor="tier-promote-rating">Rating from patients</Label>
                  <Input id="tier-promote-rating" type="number" inputMode="decimal" min={1} max={5} step="0.1" className="h-9" placeholder="No rule" value={draft.promoteMinRating} onChange={(e) => setDraft({ ...draft, promoteMinRating: e.target.value })} />
                  <p className="text-xs text-muted-foreground">Out of 5, from at least 5 reviews.</p>
                </div>
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  Leave both empty and only staff can move a doctor to this level. Fill both and the doctor needs both.
                </p>
              </fieldset>
              {shareChanges ? (
                <p className="rounded-lg bg-warning/15 p-3 text-sm sm:col-span-2">
                  The {doctorWord(draft.doctorCount)} on this level will move from {percent(draft.savedPercent ?? 0)} to {percent(Number(draft.commissionPercent))} platform share.
                </p>
              ) : null}
              <label className="flex items-start gap-2 text-sm sm:col-span-2">
                <Checkbox className="mt-0.5" checked={draft.isActive} onCheckedChange={(checked) => setDraft({ ...draft, isActive: checked === true })} />
                <span>Level is switched on<span className="block text-xs text-muted-foreground">Switched off, it cannot be given to more doctors. Doctors already on it stay on it.</span></span>
              </label>
            </form>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
            <Button type="submit" form="tier-form" loading={save.isPending}>{draft?.id ? "Save changes" : "Add level"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete the {deleting?.name} level?</DialogTitle>
            <DialogDescription>
              {deleting?.doctorCount
                ? `${doctorWord(deleting.doctorCount)} ${deleting.doctorCount === 1 ? "is" : "are"} on this level, so it cannot be deleted. Move them to another level first, or switch the level off.`
                : "This cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="destructive" disabled={!deleting || deleting.doctorCount > 0 || remove.isPending} onClick={() => deleting && remove.mutate(deleting)}>
              {remove.isPending ? <ButtonSpinner /> : null}Delete level
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
