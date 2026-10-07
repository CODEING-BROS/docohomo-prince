"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Combobox } from "@/components/admin/combobox";
import { type DocumentDraft, DocumentsField } from "@/components/admin/documents-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { STATE_OPTIONS } from "@/lib/india";
import { uploadMyDocument } from "@/lib/upload";
import { cn } from "@/lib/utils";

const KINDS = [
  { type: "REGISTRATION_CERTIFICATE", label: "Medical registration certificate", hint: "From your state council or NCH. PDF or photo, up to 5 MB", required: true },
  { type: "DEGREE_CERTIFICATE", label: "Degree certificate", hint: "BHMS, MD (Hom) or equivalent", required: true },
  { type: "GOVERNMENT_ID", label: "Government photo ID", hint: "Aadhaar, PAN card, passport or driving licence" },
  { type: "CLINIC_PROOF", label: "Clinic proof", hint: "Clinic registration, letterhead or a photo of your board" },
];

const blank = {
  displayName: "", email: "", qualification: "", specialization: "", experienceYears: "", languages: "", bio: "",
  registrationNumber: "", registrationCouncil: "", registrationYear: "",
  clinicName: "", clinicAddress: "", clinicCity: "", clinicState: "", clinicPincode: "",
  wantsConsulting: true, videoFee: "", audioFee: "", wantsWholesale: false,
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

/** A doctor's own registration: details, certificates, and what they want to do on the platform. */
export function DoctorRegister() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(blank);
  const [documents, setDocuments] = useState<DocumentDraft[]>([]);
  const set = <K extends keyof typeof blank>(key: K, value: (typeof blank)[K]) => setForm((current) => ({ ...current, [key]: value }));

  const register = useMutation({
    mutationFn: () => api("/me/doctor-registration", { method: "POST", body: { ...form, languages: form.languages.split(",").map((l) => l.trim()).filter(Boolean), documents } }),
    onSuccess: () => { toast.success("Registration sent. We will verify your documents and let you know."); queryClient.invalidateQueries(); },
    onError: (err) => toast.error(err.message),
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.clinicState) return toast.error("Choose your state");
    if (!form.wantsConsulting && !form.wantsWholesale) return toast.error("Choose at least one: consult patients, or buy at wholesale prices");
    for (const kind of KINDS.filter((k) => k.required)) {
      if (!documents.some((d) => d.type === kind.type)) return toast.error(`Upload your ${kind.label.toLowerCase()}`);
    }
    register.mutate();
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Register as a doctor</h1>
        <p className="mt-1 text-sm text-muted-foreground">Tell us about your practice and upload your certificates. We check them, usually within two working days, and then switch your account on.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>What would you like to do?</CardTitle><CardDescription>You can choose both.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <label className={cn("flex items-start gap-2.5 rounded-lg border p-3 text-sm", form.wantsConsulting && "border-primary bg-primary/5")}>
            <Checkbox className="mt-0.5" checked={form.wantsConsulting} onCheckedChange={(c) => set("wantsConsulting", c === true)} />
            <span><span className="font-medium">Consult patients online</span><span className="block text-xs text-muted-foreground">Patients book paid video or phone slots with you. You set your hours and fees.</span></span>
          </label>
          <label className={cn("flex items-start gap-2.5 rounded-lg border p-3 text-sm", form.wantsWholesale && "border-primary bg-primary/5")}>
            <Checkbox className="mt-0.5" checked={form.wantsWholesale} onCheckedChange={(c) => set("wantsWholesale", c === true)} />
            <span><span className="font-medium">Buy medicines at wholesale prices</span><span className="block text-xs text-muted-foreground">Doctor pricing on everything in the store, for your own practice.</span></span>
          </label>
          {form.wantsConsulting ? (
            <>
              <Field label="Your fee for a video call (₹)"><Input type="number" min="0" step="1" inputMode="numeric" value={form.videoFee} onChange={(e) => set("videoFee", e.target.value)} /></Field>
              <Field label="Your fee for a phone call (₹)" hint="Leave one empty if you do not offer it."><Input type="number" min="0" step="1" inputMode="numeric" value={form.audioFee} onChange={(e) => set("audioFee", e.target.value)} /></Field>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>About you</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name"><Input required placeholder="Dr. Asha Verma" value={form.displayName} onChange={(e) => set("displayName", e.target.value)} /></Field>
          <Field label="Qualification"><Input required placeholder="BHMS, MD (Hom)" value={form.qualification} onChange={(e) => set("qualification", e.target.value)} /></Field>
          <Field label="Email"><Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label="Years of experience"><Input type="number" min="0" max="80" step="0.5" inputMode="decimal" value={form.experienceYears} onChange={(e) => set("experienceYears", e.target.value)} /></Field>
          <Field label="What you treat"><Input placeholder="Skin, hair, allergies" value={form.specialization} onChange={(e) => set("specialization", e.target.value)} /></Field>
          <Field label="Languages you speak" hint="Separate with commas."><Input placeholder="Hindi, English" value={form.languages} onChange={(e) => set("languages", e.target.value)} /></Field>
          <Field label="A few lines about you" className="sm:col-span-2"><Textarea rows={3} value={form.bio} onChange={(e) => set("bio", e.target.value)} /></Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Medical registration</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field label="Registration number"><Input required value={form.registrationNumber} onChange={(e) => set("registrationNumber", e.target.value)} /></Field>
          <Field label="Registered with"><Input required placeholder="State council, CCH or NCH" value={form.registrationCouncil} onChange={(e) => set("registrationCouncil", e.target.value)} /></Field>
          <Field label="Year registered"><Input type="number" min="1950" max="2100" step="1" inputMode="numeric" value={form.registrationYear} onChange={(e) => set("registrationYear", e.target.value)} /></Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Your clinic</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Clinic name" className="sm:col-span-2"><Input value={form.clinicName} onChange={(e) => set("clinicName", e.target.value)} /></Field>
          <Field label="Address" className="sm:col-span-2"><Textarea required rows={2} value={form.clinicAddress} onChange={(e) => set("clinicAddress", e.target.value)} /></Field>
          <Field label="City"><Input required value={form.clinicCity} onChange={(e) => set("clinicCity", e.target.value)} /></Field>
          <Field label="State"><Combobox value={form.clinicState} onChange={(v) => set("clinicState", v)} options={STATE_OPTIONS} allLabel="Choose a state" searchPlaceholder="Search states…" className="w-full" /></Field>
          <Field label="Pincode"><Input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} title="A 6-digit pincode" value={form.clinicPincode} onChange={(e) => set("clinicPincode", e.target.value.replace(/\D/g, ""))} /></Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Certificates</CardTitle><CardDescription>Only our verification team can see these files.</CardDescription></CardHeader>
        <CardContent><DocumentsField kinds={KINDS} value={documents} onChange={setDocuments} uploader={uploadMyDocument} /></CardContent>
      </Card>

      <Button type="submit" className="h-10 justify-self-start px-6" loading={register.isPending}>Send for verification</Button>
    </form>
  );
}
