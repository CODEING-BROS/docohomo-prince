"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import type { DoctorAppointment } from "@/lib/care";
import { formatMoney, titleCase } from "@/lib/format";
import { ButtonSpinner, Spinner } from "@/components/custom/loaders";

type Medicine = { variantId: number; name: string; title: string; potency: string | null; price: number; inStock: boolean };
type Line = { key: string; variantId: number | null; medicineName: string; potency: string; dosage: string; frequency: string; duration: string; instructions: string; quantity: string };
type Saved = {
  status: "DRAFT" | "ISSUED"; diagnosis: string | null; advice: string | null; followUpDate: string | null;
  items: { variantId: number | null; medicineName: string; potency: string | null; dosage: string | null; frequency: string | null; duration: string | null; instructions: string | null; quantity: number }[];
};

let lineKey = 0;
const newLine = (medicine?: Medicine): Line => ({
  key: `line-${++lineKey}`, variantId: medicine?.variantId ?? null, medicineName: medicine ? `${medicine.name} (${medicine.title})` : "",
  potency: medicine?.potency ?? "", dosage: "", frequency: "", duration: "", instructions: "", quantity: "1",
});

/** Finds a medicine in the store so the patient can order it; anything else can be typed by hand. */
function MedicineSearch({ onPick }: { onPick: (medicine: Medicine) => void }) {
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), 250);
    return () => clearTimeout(timer);
  }, [text]);
  const { data, isFetching } = useQuery({
    queryKey: ["medicine-search", query],
    queryFn: () => api<{ items: Medicine[] }>("/doctor/medicine-search", { query: { q: query } }),
    enabled: query.length >= 2,
  });

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
      <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search the store for a medicine, like “arnica 30”" className="h-9 pl-8" />
      {query.length >= 2 ? (
        <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border bg-popover p-1 shadow-md">
          {isFetching && !data ? <li className="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground"><Spinner size="md" /> Searching…</li> : null}
          {data && data.items.length === 0 ? <li className="px-2 py-2 text-sm text-muted-foreground">Nothing in the store matches. Add it by hand below.</li> : null}
          {data?.items.map((medicine) => (
            <li key={medicine.variantId}>
              <button type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2" onClick={() => { onPick(medicine); setText(""); setQuery(""); }}>
                <span className="min-w-0 flex-1 truncate">{titleCase(medicine.name)} <span className="text-muted-foreground">· {medicine.title}</span></span>
                <span className="shrink-0 text-xs text-muted-foreground ledger">{formatMoney(medicine.price)}{medicine.inStock ? "" : " · out of stock"}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** The doctor writes the prescription for one appointment: save as a draft, or give it to the patient. */
export function PrescriptionEditor({ appointment, onClose }: { appointment: DoctorAppointment | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const id = appointment?.id;
  const [diagnosis, setDiagnosis] = useState("");
  const [advice, setAdvice] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [loadedFor, setLoadedFor] = useState<number | null>(null);

  const { data, isPending } = useQuery({
    queryKey: ["doctor-prescription", id],
    queryFn: () => api<{ prescription: Saved | null }>(`/doctor/appointments/${id}/prescription`),
    enabled: Boolean(id),
    staleTime: 0,
  });

  // fill the form once when a saved draft arrives for this appointment
  if (id && data && loadedFor !== id) {
    setLoadedFor(id);
    const saved = data.prescription;
    setDiagnosis(saved?.diagnosis ?? "");
    setAdvice(saved?.advice ?? "");
    setFollowUp(saved?.followUpDate ? saved.followUpDate.slice(0, 10) : "");
    setLines((saved?.items ?? []).map((item) => ({
      key: `line-${++lineKey}`, variantId: item.variantId, medicineName: item.medicineName, potency: item.potency ?? "", dosage: item.dosage ?? "",
      frequency: item.frequency ?? "", duration: item.duration ?? "", instructions: item.instructions ?? "", quantity: String(item.quantity),
    })));
  }

  const issued = data?.prescription?.status === "ISSUED";
  const change = (key: string, field: keyof Line, value: string) => setLines((current) => current.map((line) => (line.key === key ? { ...line, [field]: value } : line)));

  const save = useMutation({
    mutationFn: (issue: boolean) =>
      api(`/doctor/appointments/${id}/prescription`, {
        method: "PUT",
        body: { diagnosis, advice, followUpDate: followUp, issue, items: lines.map((line) => ({
          variantId: line.variantId, medicineName: line.medicineName, potency: line.potency, dosage: line.dosage, frequency: line.frequency,
          duration: line.duration, instructions: line.instructions, quantity: Number(line.quantity || 1),
        })) },
      }),
    onSuccess: (_result, issue) => {
      toast.success(issue ? "Prescription sent to the patient" : "Draft saved");
      ["doctor-appointments", "doctor-overview", "doctor-prescription"].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
      if (issue) close();
    },
    onError: (err) => toast.error(err.message),
  });

  const close = () => { setLoadedFor(null); onClose(); };

  return (
    <Dialog open={appointment !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Prescription for {appointment?.patientName}</DialogTitle>
          <DialogDescription>
            {issued ? "This prescription has been given to the patient and can no longer be changed."
              : "Search the store to add medicines the patient can order in one step, or type any medicine by hand."}
          </DialogDescription>
        </DialogHeader>

        {isPending ? <div className="flex justify-center py-10"><Spinner size="md" /></div> : (
          <fieldset disabled={issued} className="grid gap-4">
            <div className="grid gap-1.5"><Label htmlFor="rx-diagnosis">Diagnosis</Label><Input id="rx-diagnosis" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} /></div>

            <div className="grid gap-2">
              <Label>Medicines</Label>
              {issued ? null : <MedicineSearch onPick={(medicine) => setLines((current) => [...current, newLine(medicine)])} />}
              {lines.map((line, index) => (
                <div key={line.key} className="grid gap-2 rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">{index + 1}</span>
                    <Input aria-label="Medicine" required className="h-8 flex-1" placeholder="Medicine name" value={line.medicineName} readOnly={line.variantId !== null} onChange={(e) => change(line.key, "medicineName", e.target.value)} />
                    {line.variantId !== null ? <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">In store</span> : null}
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove this medicine" onClick={() => setLines((current) => current.filter((l) => l.key !== line.key))}><Trash2 /></Button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-5">
                    <Input aria-label="Potency" className="h-8" placeholder="Potency" value={line.potency} onChange={(e) => change(line.key, "potency", e.target.value)} />
                    <Input aria-label="Dose" className="h-8" placeholder="Dose, e.g. 5 drops" value={line.dosage} onChange={(e) => change(line.key, "dosage", e.target.value)} />
                    <Input aria-label="How often" className="h-8" placeholder="How often" value={line.frequency} onChange={(e) => change(line.key, "frequency", e.target.value)} />
                    <Input aria-label="For how long" className="h-8" placeholder="For how long" value={line.duration} onChange={(e) => change(line.key, "duration", e.target.value)} />
                    <Input aria-label="Packs to buy" type="number" min="1" max="50" className="h-8" title="Packs to buy" value={line.quantity} onChange={(e) => change(line.key, "quantity", e.target.value)} />
                  </div>
                  <Input aria-label="Instructions" className="h-8" placeholder="Instructions (optional), e.g. before meals" value={line.instructions} onChange={(e) => change(line.key, "instructions", e.target.value)} />
                </div>
              ))}
              {issued ? null : <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => setLines((current) => [...current, newLine()])}><Plus /> Add a medicine by hand</Button>}
            </div>

            <div className="grid gap-1.5"><Label htmlFor="rx-advice">Advice</Label><Textarea id="rx-advice" rows={3} placeholder="Diet, rest, things to avoid" value={advice} onChange={(e) => setAdvice(e.target.value)} /></div>
            <div className="grid max-w-48 gap-1.5"><Label htmlFor="rx-follow">Follow up on</Label><Input id="rx-follow" type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} /></div>
          </fieldset>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={close}>{issued ? "Close" : "Cancel"}</Button>
          {issued ? null : (
            <>
              <Button variant="outline" disabled={save.isPending} onClick={() => save.mutate(false)}>Save as draft</Button>
              <Button disabled={save.isPending || lines.some((l) => !l.medicineName.trim())} onClick={() => save.mutate(true)}>
                {save.isPending ? <ButtonSpinner /> : null}Give to patient
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
