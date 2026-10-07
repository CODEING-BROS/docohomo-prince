"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Callout } from "@/components/custom/callout";
import { FormField } from "@/components/custom/form-field";
import { ProgressBar } from "@/components/custom/progress-ring";
import { SectionCard } from "@/components/custom/section-card";
import { Eyebrow } from "@/components/custom/typography";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";

type Weights = { fit: number; quality: number; availability: number; price: number; reliability: number; history: number; balance: number; preference: number };
type Settings = { maxResults: number; daysAhead: number; newPatientAboveTypical: number; returningPatientAboveTypical: number; ratingPriorReviews: number; weights: Weights };

const WEIGHTS: { key: keyof Weights; label: string; hint: string }[] = [
  { key: "fit", label: "Medical fit", hint: "The right specialization and the patient's own symptoms" },
  { key: "quality", label: "Doctor quality", hint: "Rating, experience, patients who come back" },
  { key: "price", label: "Price fit", hint: "How close the fee is to what this patient is comfortable with" },
  { key: "availability", label: "How soon", hint: "Doubles when the patient says it is severe or wants today" },
  { key: "history", label: "Seen before", hint: "A doctor this patient has already consulted" },
  { key: "reliability", label: "Reliability", hint: "Doctors who cancel or do not start the call lose here" },
  { key: "balance", label: "Fair turns", hint: "Room left today, and a small start for new doctors" },
  { key: "preference", label: "Language and city", hint: "The patient's preferred language, then the same city" },
];

function Form({ saved, defaults }: { saved: Settings; defaults: Settings }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(saved);
  const total = Object.values(form.weights).reduce((sum, v) => sum + (Number(v) || 0), 0) || 1;
  const save = useMutation({
    mutationFn: () => api("/admin/streams/matching", { method: "PUT", body: form }),
    onSuccess: () => { toast.success("Matching settings saved"); queryClient.invalidateQueries({ queryKey: ["matching-settings"] }); },
    onError: (err) => toast.error(err.message),
  });
  const number = (key: Exclude<keyof Settings, "weights">) => ({ value: String(form[key]), onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value === "" ? 0 : Number(e.target.value) }) });

  return (
    <form className="grid gap-5" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <Callout tone="info" compact>The right specialization always comes first, and a higher fee never moves a doctor up by itself. These settings only tune the rest.</Callout>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <FormField label="Doctors shown" hint="Two or three is easiest to choose from.">{(id) => <Input id={id} type="number" min={1} max={5} className="ledger h-9" {...number("maxResults")} />}</FormField>
        <FormField label="Look ahead (days)" hint="A doctor with no free slot in this time is not shown.">{(id) => <Input id={id} type="number" min={1} max={14} className="ledger h-9" {...number("daysAhead")} />}</FormField>
        <FormField label="First-time patient: above the usual fee (%)" hint="0 means they are never shown a dearer doctor unless they ask.">{(id) => <Input id={id} type="number" min={0} max={100} className="ledger h-9" {...number("newPatientAboveTypical")} />}</FormField>
        <FormField label="Returning patient: above the usual fee (%)" hint="Also raised by what they have paid before.">{(id) => <Input id={id} type="number" min={0} max={200} className="ledger h-9" {...number("returningPatientAboveTypical")} />}</FormField>
      </div>

      <div>
        <Eyebrow className="mb-3">What counts, and how much</Eyebrow>
        <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
          {WEIGHTS.map(({ key, label, hint }) => (
            <div key={key} className="grid grid-cols-[1fr_4.5rem] items-center gap-3">
              <ProgressBar value={Number(form.weights[key]) || 0} max={total} tone={key === "fit" ? "terracotta" : "primary"} label={label} hint={`${Math.round(((Number(form.weights[key]) || 0) / total) * 100)}%`} />
              <Input aria-label={`${label} weight`} type="number" min={0} max={100} className="ledger h-8 text-right" value={String(form.weights[key])} onChange={(e) => setForm({ ...form, weights: { ...form.weights, [key]: e.target.value === "" ? 0 : Number(e.target.value) } })} />
              <p className="col-span-2 -mt-2 text-xs text-muted-foreground">{hint}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-foreground/18 pt-4">
        <Button type="submit" loading={save.isPending}>Save</Button>
        <Button type="button" variant="ghost" onClick={() => setForm(defaults)}><RotateCcw data-icon="inline-start" /> Back to the starting values</Button>
        <FormField label="Reviews before a rating is trusted" className="ml-auto w-64">{(id) => <Input id={id} type="number" min={0} max={100} className="ledger h-9" {...number("ratingPriorReviews")} />}</FormField>
      </div>
    </form>
  );
}

/** How the guided booking picks the doctors a patient is shown. */
export function MatchingSettings() {
  const { data } = useQuery({ queryKey: ["matching-settings"], queryFn: () => api<{ settings: Settings; defaults: Settings }>("/admin/streams/matching") });
  return (
    <SectionCard title="Matching patients to doctors" description="A patient who books through the guided questions is shown a best match, a best value and a most experienced doctor." collapsible defaultOpen={false}>
      {data ? <Form key={JSON.stringify(data.settings)} saved={data.settings} defaults={data.defaults} /> : <Skeleton className="h-64" />}
    </SectionCard>
  );
}
