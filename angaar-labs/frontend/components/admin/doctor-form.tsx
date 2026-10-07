"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Combobox } from "@/components/admin/combobox";
import { type DocumentDraft, DocumentsField } from "@/components/admin/documents-field";
import { ImageField } from "@/components/admin/image-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { STATE_OPTIONS } from "@/lib/india";
import { cn } from "@/lib/utils";

export const DOCTOR_DOCUMENT_KINDS = [
  { type: "REGISTRATION_CERTIFICATE", label: "Medical registration certificate", hint: "From the state council or NCH. PDF or photo, up to 5 MB", required: true },
  { type: "DEGREE_CERTIFICATE", label: "Degree certificate", hint: "BHMS, MD (Hom) or equivalent", required: true },
  { type: "GOVERNMENT_ID", label: "Government photo ID", hint: "Aadhaar, PAN card, passport or driving licence" },
  { type: "CLINIC_PROOF", label: "Clinic proof", hint: "Clinic registration, letterhead or a photo of the board" },
];

export type DoctorDraft = {
  displayName: string; phone: string; email: string; photoUrl: string; stream: string; qualification: string; specialization: string; specializationId: string;
  experienceYears: string; languages: string; bio: string;
  registrationNumber: string; registrationCouncil: string; registrationYear: string;
  clinicName: string; clinicAddress: string; clinicCity: string; clinicState: string; clinicPincode: string;
  videoFee: string; audioFee: string; slotMinutes: string; commissionPercent: string;
  consulting: boolean; wholesale: boolean;
};

export const emptyDoctor: DoctorDraft = {
  displayName: "", phone: "", email: "", photoUrl: "", stream: "Homeopathy", qualification: "", specialization: "", specializationId: "", experienceYears: "", languages: "", bio: "",
  registrationNumber: "", registrationCouncil: "", registrationYear: "", clinicName: "", clinicAddress: "", clinicCity: "", clinicState: "", clinicPincode: "",
  videoFee: "", audioFee: "", slotMinutes: "15", commissionPercent: "20", consulting: true, wholesale: false,
};

function Field({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Register a doctor by hand, or edit one. `verified` says whether the switches can be turned on yet when editing. */
export function DoctorForm({ doctorId, initial, verified = false }: { doctorId?: number; initial: DoctorDraft; verified?: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(initial);
  const [documents, setDocuments] = useState<DocumentDraft[]>([]);
  const [approveNow, setApproveNow] = useState(false);
  const set = <K extends keyof DoctorDraft>(key: K, value: DoctorDraft[K]) => setForm((current) => ({ ...current, [key]: value }));
  // the streams doctors can be in, each with its specializations (those staff keep under Consulting streams)
  const { data: streams } = useQuery({ queryKey: ["care-streams"], queryFn: () => api<{ items: { name: string; specializations: { id: number; name: string }[] }[] }>("/care/streams") });
  const streamNames = [...new Set([...(streams?.items.map((s) => s.name) ?? []), ...(form.stream ? [form.stream] : [])])];
  const specializations = streams?.items.find((s) => s.name === form.stream)?.specializations ?? [];

  const isNew = !doctorId;
  const canSwitchOn = isNew ? approveNow : verified;
  const back = isNew ? "/admin/doctors" : `/admin/doctors/${doctorId}`;

  const save = useMutation({
    mutationFn: () =>
      api<{ id: number }>(isNew ? "/admin/doctors" : `/admin/doctors/${doctorId}`, {
        method: isNew ? "POST" : "PATCH",
        body: {
          ...form,
          languages: form.languages.split(",").map((l) => l.trim()).filter(Boolean),
          slotMinutes: Number(form.slotMinutes || 15), commissionPercent: Number(form.commissionPercent || 0),
          // a doctor who is not verified yet cannot be switched on; the wish is kept for wholesale only
          consulting: form.consulting && canSwitchOn,
          ...(isNew ? { approveNow, documents } : {}),
        },
      }),
    onSuccess: (result) => {
      toast.success(isNew ? (approveNow ? "Doctor added and verified" : "Doctor added. Their registration is waiting to be verified.") : "Doctor saved");
      ["doctors", "doctor", "b2b", "dashboard", "notifications"].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
      router.push(`/admin/doctors/${result.id}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (isNew && approveNow && !documents.some((d) => d.type === "REGISTRATION_CERTIFICATE")) {
      return toast.error("Upload the registration certificate before verifying, or untick “Verify now”");
    }
    save.mutate();
  };

  return (
    <form onSubmit={submit}>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Back"><Link href={back}><ArrowLeft /></Link></Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold tracking-tight">{isNew ? "Add doctor" : "Edit doctor"}</h1>
          <p className="text-sm text-muted-foreground">One account per doctor. Once verified, they can consult patients, buy wholesale, or both.</p>
        </div>
        <Button asChild variant="outline" className="h-9"><Link href={back}>Cancel</Link></Button>
        <Button type="submit" className="h-9" loading={save.isPending}>{isNew ? "Add doctor" : "Save changes"}</Button>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-3">
        <div className="grid min-w-0 gap-4 xl:col-span-2">
          <Card>
            <CardHeader><CardTitle>Doctor</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name"><Input required value={form.displayName} placeholder="Dr. Asha Verma" onChange={(e) => set("displayName", e.target.value)} /></Field>
              <Field label="Qualification"><Input value={form.qualification} placeholder="BHMS, MD (Hom)" onChange={(e) => set("qualification", e.target.value)} /></Field>
              <Field label="Mobile number" hint="They sign in with this number.">
                <Input required={isNew} type="tel" inputMode="numeric" pattern="[6-9][0-9]{9}" maxLength={10} title="A 10-digit mobile number" value={form.phone} onChange={(e) => set("phone", e.target.value.replace(/\D/g, ""))} />
              </Field>
              <Field label="Email"><Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></Field>
              <Field label="Consulting stream">
                <Select value={form.stream || "Homeopathy"} onValueChange={(v) => setForm((current) => ({ ...current, stream: v, specializationId: "" }))}>
                  <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{streamNames.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Specialization" hint={specializations.length ? "Patients are matched to the doctor by this, and their test is built for it." : "This stream has no specializations yet. Add them under Consulting streams."}>
                <Select value={form.specializationId || "none"} onValueChange={(v) => set("specializationId", v === "none" ? "" : v)} disabled={specializations.length === 0}>
                  <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="none">Not chosen</SelectItem>
                    {specializations.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="What they treat, in words" hint="Shown to patients under the doctor's name. Left empty, the specialization is shown."><Input value={form.specialization} placeholder="Skin, hair, allergies" onChange={(e) => set("specialization", e.target.value)} /></Field>
              <Field label="Years of experience"><Input type="number" min="0" max="80" step="0.5" inputMode="decimal" value={form.experienceYears} onChange={(e) => set("experienceYears", e.target.value)} /></Field>
              <Field label="Languages" hint="Separate with commas."><Input value={form.languages} placeholder="Hindi, English" onChange={(e) => set("languages", e.target.value)} /></Field>
              <Field label="About the doctor" className="sm:col-span-2"><Textarea rows={4} value={form.bio} onChange={(e) => set("bio", e.target.value)} /></Field>
              <div className="sm:col-span-2"><ImageField label="Photo" folder="doctors" value={form.photoUrl} onChange={(photoUrl) => set("photoUrl", photoUrl)} /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Medical registration</CardTitle><CardDescription>Checked against the certificate when the doctor is verified.</CardDescription></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <Field label="Registration number"><Input required={isNew} value={form.registrationNumber} onChange={(e) => set("registrationNumber", e.target.value)} /></Field>
              <Field label="Registered with"><Input value={form.registrationCouncil} placeholder="State council, CCH or NCH" onChange={(e) => set("registrationCouncil", e.target.value)} /></Field>
              <Field label="Year registered"><Input type="number" min="1950" max="2100" step="1" inputMode="numeric" value={form.registrationYear} onChange={(e) => set("registrationYear", e.target.value)} /></Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Clinic</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Clinic name" className="sm:col-span-2"><Input value={form.clinicName} onChange={(e) => set("clinicName", e.target.value)} /></Field>
              <Field label="Address" className="sm:col-span-2"><Textarea rows={2} value={form.clinicAddress} onChange={(e) => set("clinicAddress", e.target.value)} /></Field>
              <Field label="City"><Input value={form.clinicCity} onChange={(e) => set("clinicCity", e.target.value)} /></Field>
              <Field label="State"><Combobox value={form.clinicState} onChange={(v) => set("clinicState", v)} options={STATE_OPTIONS} allLabel="Choose a state" searchPlaceholder="Search states…" className="w-full" /></Field>
              <Field label="Pincode"><Input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} title="A 6-digit pincode" value={form.clinicPincode} onChange={(e) => set("clinicPincode", e.target.value.replace(/\D/g, ""))} /></Field>
            </CardContent>
          </Card>

          {isNew ? (
            <Card>
              <CardHeader><CardTitle>Documents</CardTitle><CardDescription>Only staff can open these files. More can be added later.</CardDescription></CardHeader>
              <CardContent><DocumentsField kinds={DOCTOR_DOCUMENT_KINDS} value={documents} onChange={setDocuments} /></CardContent>
            </Card>
          ) : null}
        </div>

        <div className="grid min-w-0 gap-4">
          {isNew ? (
            <Card>
              <CardHeader><CardTitle>Verification</CardTitle></CardHeader>
              <CardContent>
                <label className="flex items-start gap-2.5 text-sm">
                  <Checkbox className="mt-0.5" checked={approveNow} onCheckedChange={(checked) => setApproveNow(checked === true)} />
                  <span>Verify now<span className="block text-xs text-muted-foreground">{approveNow ? "You have checked the certificate yourself." : "Left unticked, the doctor waits under “Pending” until someone verifies them."}</span></span>
                </label>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader><CardTitle>What this doctor can do</CardTitle><CardDescription>{canSwitchOn ? "Switch on one or both." : "These take effect once the doctor is verified."}</CardDescription></CardHeader>
            <CardContent className="grid gap-4">
              <label className="flex items-start gap-2.5 text-sm">
                <Checkbox className="mt-0.5" checked={form.consulting} onCheckedChange={(checked) => set("consulting", checked === true)} />
                <span>Consult patients<span className="block text-xs text-muted-foreground">Listed on the store; patients can book a paid slot.</span></span>
              </label>
              <label className="flex items-start gap-2.5 text-sm">
                <Checkbox className="mt-0.5" checked={form.wholesale} onCheckedChange={(checked) => set("wholesale", checked === true)} />
                <span>Buy at wholesale prices<span className="block text-xs text-muted-foreground">Appears under B2B customers on the Doctor price tier.</span></span>
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Consultation fees</CardTitle><CardDescription>Used when “Consult patients” is on.</CardDescription></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <Field label="Video call fee (₹)"><Input type="number" min="0" step="1" inputMode="numeric" value={form.videoFee} onChange={(e) => set("videoFee", e.target.value)} /></Field>
              <Field label="Audio call fee (₹)"><Input type="number" min="0" step="1" inputMode="numeric" value={form.audioFee} onChange={(e) => set("audioFee", e.target.value)} /></Field>
              <Field label="Slot length">
                <Select value={form.slotMinutes} onValueChange={(v) => set("slotMinutes", v)}>
                  <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{["10", "15", "20", "30", "45", "60"].map((m) => <SelectItem key={m} value={m}>{m} minutes</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Platform share (%)" hint="Kept from each consultation fee; the rest is the doctor's earning.">
                <Input type="number" min="0" max="90" step="0.5" inputMode="decimal" value={form.commissionPercent} onChange={(e) => set("commissionPercent", e.target.value)} />
              </Field>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}
