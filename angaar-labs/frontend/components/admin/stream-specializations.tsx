"use client";

import { useMutation } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BulkActions, SelectRow, useSelection } from "@/components/admin/bulk";
import { ConfirmDialog, FormDialog } from "@/components/custom/dialogs";
import { EmptyState } from "@/components/custom/empty-state";
import { FormField, OptionalMark, SwitchRow } from "@/components/custom/form-field";
import { LabelTag } from "@/components/custom/label-tag";
import { SectionCard } from "@/components/custom/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import type { StreamSpecialization } from "@/lib/onboarding";

type Draft = { id: number | null; name: string; description: string; symptoms: string; isGeneral: boolean };
const empty: Draft = { id: null, name: "", description: "", symptoms: "", isGeneral: false };

/**
 * What doctors of this stream can specialise in. Each one carries the symptoms that point patients at
 * it in the guided booking, and can have test questions of its own.
 */
export function StreamSpecializations({ streamId, items, onChanged }: { streamId: number; items: StreamSpecialization[]; onChanged: () => void }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<StreamSpecialization | null>(null);
  const failed = (err: Error) => toast.error(err.message);
  const ids = useMemo(() => items.map((item) => item.id), [items]);
  const selection = useSelection(ids);

  const save = useMutation({
    mutationFn: (d: Draft) =>
      api(d.id ? `/admin/streams/${streamId}/specializations/${d.id}` : `/admin/streams/${streamId}/specializations`, {
        method: d.id ? "PATCH" : "POST",
        // one symptom on each line, or separated by commas
        body: { name: d.name, description: d.description, isGeneral: d.isGeneral, symptoms: [...new Set(d.symptoms.split(/[\n,]+/).map((s) => s.trim()).filter((s) => s.length >= 2))] },
      }),
    onSuccess: (_r, d) => { toast.success(d.id ? "Specialization updated" : "Specialization added"); setDraft(null); onChanged(); },
    onError: failed,
  });
  const flip = useMutation({
    mutationFn: (input: { item: StreamSpecialization; isActive: boolean }) => api(`/admin/streams/${streamId}/specializations/${input.item.id}`, { method: "PATCH", body: { isActive: input.isActive } }),
    onSuccess: (_r, input) => { toast.success(input.isActive ? "Doctors and patients can choose it again" : "Hidden from doctors and patients"); onChanged(); },
    onError: failed,
  });
  const remove = useMutation({
    mutationFn: (item: StreamSpecialization) => api(`/admin/streams/${streamId}/specializations/${item.id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Specialization deleted"); setDeleting(null); onChanged(); },
    onError: failed,
  });

  return (
    <>
      <SectionCard
        title="Specializations"
        description="A doctor picks one when registering and can change it from their profile. Patients are sent to it by the symptoms listed here."
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <BulkActions table={`streams/${streamId}/specializations`} noun="specializations" selection={selection} exportable={false} onDeleted={onChanged} deleteNote="Their own test questions become general questions of the stream. Specializations that doctors have chosen are kept." className="ml-0" />
            <Button size="sm" onClick={() => setDraft(empty)}><Plus data-icon="inline-start" /> Add specialization</Button>
          </div>
        }
        flush
      >
        {items.length === 0 ? (
          <EmptyState illustration="doctors" title="No specializations yet" description="Without them every doctor in the stream is treated the same, and patients are not asked which kind of doctor they need." />
        ) : (
          <ul className="divide-y divide-foreground/10">
            {items.map((item) => (
              <li key={item.id} className={`flex flex-wrap items-start gap-3 px-4 py-3 ${selection.has(item.id) ? "bg-muted" : ""}`}>
                <span className="mt-1"><SelectRow selection={selection} id={item.id} label={item.name} /></span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {item.name}
                    {item.isGeneral ? <LabelTag tone="primary">Suggested when unsure</LabelTag> : null}
                    {item.isActive ? null : <LabelTag tone="neutral">Hidden</LabelTag>}
                  </p>
                  {item.description ? <p className="text-sm text-muted-foreground">{item.description}</p> : null}
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {item.symptoms.length ? item.symptoms.join(" · ") : "No symptoms listed: patients reach it only by choosing it themselves."}
                  </p>
                </div>
                <dl className="ledger grid grid-cols-2 gap-x-4 text-right text-xs text-muted-foreground">
                  <dt>Doctors</dt><dd className="font-medium text-foreground">{item.doctorCount}</dd>
                  <dt>Own questions</dt><dd className="font-medium text-foreground">{item.activeQuestionCount}</dd>
                </dl>
                <div className="flex items-center gap-1">
                  <Switch aria-label={`${item.name} can be chosen`} checked={item.isActive} disabled={flip.isPending} onCheckedChange={(isActive) => flip.mutate({ item, isActive })} />
                  <Button variant="ghost" size="icon-sm" aria-label={`Edit ${item.name}`} onClick={() => setDraft({ id: item.id, name: item.name, description: item.description ?? "", symptoms: item.symptoms.join("\n"), isGeneral: item.isGeneral })}><Pencil /></Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Delete ${item.name}`} onClick={() => setDeleting(item)}><Trash2 /></Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <FormDialog
        open={draft !== null} onOpenChange={(open) => !open && setDraft(null)} formId="specialization-form"
        title={draft?.id ? "Edit specialization" : "Add specialization"} description="Name it the way a patient would say it."
        submitLabel={draft?.id ? "Save changes" : "Add specialization"} pending={save.isPending}
        onSubmit={(e) => { e.preventDefault(); if (draft) save.mutate(draft); }}
      >
        {draft ? (
          <div className="grid gap-4">
            <FormField label="Name">{(id) => <Input id={id} required minLength={2} maxLength={80} autoFocus placeholder="Skin and hair" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />}</FormField>
            <FormField label={<>Short description <OptionalMark /></>}>{(id) => <Input id={id} maxLength={300} placeholder="Acne, eczema, hair fall and dandruff" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />}</FormField>
            <FormField label="Symptoms that point here" hint="One on each line. Patients tap these while booking; the more you list, the better they are matched.">
              {(id) => <Textarea id={id} rows={6} placeholder={"Hair fall\nDandruff\nAcne"} value={draft.symptoms} onChange={(e) => setDraft({ ...draft, symptoms: e.target.value })} />}
            </FormField>
            <SwitchRow bordered label="Suggest this when the symptoms are unclear" hint="One per stream, usually the general physician." checked={draft.isGeneral} onCheckedChange={(isGeneral) => setDraft({ ...draft, isGeneral })} />
          </div>
        ) : null}
      </FormDialog>

      <ConfirmDialog
        open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)} tone="destructive" pending={remove.isPending}
        title={`Delete ${deleting?.name ?? "this specialization"}?`}
        description="Its own test questions are kept and become general questions of the stream."
        blockedReason={deleting && deleting.doctorCount > 0 ? `${deleting.doctorCount} ${deleting.doctorCount === 1 ? "doctor has" : "doctors have"} this specialization. Hide it with the switch instead, or move them first.` : undefined}
        confirmLabel="Delete" onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </>
  );
}
