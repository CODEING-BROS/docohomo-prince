"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Camera, FileText, Lock } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { PageHeader, StatusBadge } from "@/components/admin/parts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Callout } from "@/components/custom/callout";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";
import { DOCUMENT_LABEL } from "@/lib/doctor";
import { humanize } from "@/lib/format";
import { uploadMyPhoto } from "@/lib/upload";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/custom/loaders";

type Profile = {
  displayName: string; photoUrl: string | null; qualification: string | null; stream: string | null; specializationId: number | null; specialization: string | null; experienceYears: number | null; languages: string[]; bio: string | null;
  registrationNumber: string | null; registrationCouncil: string | null; registrationYear: number | null;
  clinicName: string | null; clinicAddress: string | null; clinicCity: string | null; clinicState: string | null; clinicPincode: string | null;
  verificationStatus: string; rejectionReason: string | null; acceptsConsultations: boolean; videoFee: number | null; audioFee: number | null; commissionPercent: number;
  bankAccountName: string | null; bankIfsc: string | null; bankAccountEnding: string | null; phone: string | null; email: string | null;
  documents: { id: number; type: string; fileName: string | null; status: string; rejectionReason: string | null }[];
};

function Field({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

const text = (value: string | number | null) => (value === null ? "" : String(value));

/** One card of the profile that saves on its own. */
function Section({ title, description, fields, children }: { title: string; description?: string; fields: () => Record<string, unknown>; children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: () => api<{ testRequired?: boolean }>("/doctor/profile", { method: "PATCH", body: fields() }),
    onSuccess: (result) => {
      if (result.testRequired) toast.warning("Saved. Your new specialization has its own test: take it from your dashboard to keep consulting.", { duration: 10000 });
      else toast.success("Saved");
      ["doctor-profile", "doctor-overview", "doctor-onboarding", "session"].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
    },
    onError: (err) => toast.error(err.message),
  });
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle>{description ? <CardDescription>{description}</CardDescription> : null}</CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          {children}
          <Button type="submit" className="h-9 justify-self-start" loading={save.isPending}>Save</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ProfileForm({ profile }: { profile: Profile }) {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const photoInput = useRef<HTMLInputElement>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const { data: streams } = useQuery({ queryKey: ["care-streams"], queryFn: () => api<{ items: { name: string; specializations: { id: number; name: string }[] }[] }>("/care/streams") });
  const [practice, setPractice] = useState({ stream: profile.stream ?? "", specializationId: profile.specializationId ? String(profile.specializationId) : "" });
  const specializations = streams?.items.find((s) => s.name === practice.stream)?.specializations ?? [];
  const practiceChanged = practice.stream !== (profile.stream ?? "") || practice.specializationId !== (profile.specializationId ? String(profile.specializationId) : "");
  const [about, setAbout] = useState({ specialization: text(profile.specialization), experienceYears: text(profile.experienceYears), languages: profile.languages.join(", "), bio: text(profile.bio), email: text(profile.email) });
  const [fees, setFees] = useState({ videoFee: text(profile.videoFee), audioFee: text(profile.audioFee) });
  const [clinic, setClinic] = useState({ clinicName: text(profile.clinicName), clinicAddress: text(profile.clinicAddress), clinicCity: text(profile.clinicCity), clinicState: text(profile.clinicState), clinicPincode: text(profile.clinicPincode) });
  const [bank, setBank] = useState({ bankAccountName: text(profile.bankAccountName), bankAccountNumber: "", bankIfsc: text(profile.bankIfsc) });
  const [password, setPassword] = useState({ next: "", again: "" });

  const changePhoto = async (file: File | undefined) => {
    if (photoInput.current) photoInput.current.value = "";
    if (!file) return;
    setPhotoBusy(true);
    try {
      const photoUrl = await uploadMyPhoto(file);
      await api("/doctor/profile", { method: "PATCH", body: { photoUrl } });
      toast.success("Photo updated");
      ["doctor-profile", "doctor-overview"].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setPhotoBusy(false);
    }
  };
  const savePassword = useMutation({
    mutationFn: () => api("/auth/password", { method: "POST", body: { password: password.next } }),
    onSuccess: () => { toast.success("Password changed"); setPassword({ next: "", again: "" }); queryClient.invalidateQueries({ queryKey: ["session"] }); },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="grid items-start gap-4 xl:grid-cols-3">
      <div className="grid gap-4 xl:col-span-2">
        <Section title="What you practise" description="Patients are matched to you by your specialization, and your test questions are chosen for it." fields={() => ({ stream: practice.stream || undefined, specializationId: practice.specializationId || null })}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Consulting stream">
              <Select value={practice.stream} onValueChange={(stream) => setPractice({ stream, specializationId: "" })}>
                <SelectTrigger className="h-9 w-full"><SelectValue placeholder="Choose" /></SelectTrigger>
                <SelectContent>
                  {profile.stream && !streams?.items.some((s) => s.name === profile.stream) ? <SelectItem value={profile.stream}>{profile.stream}</SelectItem> : null}
                  {(streams?.items ?? []).map((s) => <SelectItem key={s.name} value={s.name}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Specialization">
              <Select value={practice.specializationId} onValueChange={(specializationId) => setPractice({ ...practice, specializationId })} disabled={specializations.length === 0}>
                <SelectTrigger className="h-9 w-full"><SelectValue placeholder={specializations.length ? "Choose what you mainly treat" : "None for this stream"} /></SelectTrigger>
                <SelectContent className="max-h-72">{specializations.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          {practiceChanged ? <Callout tone="warning" compact>If the new choice has test questions of its own, you take that test and consultations pause until you pass.</Callout> : null}
        </Section>

        <Section title="About you" description="Patients read this before they book." fields={() => ({ ...about, languages: about.languages.split(",").map((l) => l.trim()).filter(Boolean) })}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="What you treat, in your words" hint="Shown to patients under your name."><Input placeholder="Skin, hair, allergies" value={about.specialization} onChange={(e) => setAbout({ ...about, specialization: e.target.value })} /></Field>
            <Field label="Years of experience"><Input type="number" min="0" max="80" step="0.5" inputMode="decimal" value={about.experienceYears} onChange={(e) => setAbout({ ...about, experienceYears: e.target.value })} /></Field>
            <Field label="Languages you speak" hint="Separate with commas."><Input placeholder="Hindi, English" value={about.languages} onChange={(e) => setAbout({ ...about, languages: e.target.value })} /></Field>
            <Field label="Email"><Input type="email" value={about.email} onChange={(e) => setAbout({ ...about, email: e.target.value })} /></Field>
            <Field label="A few lines about you" className="sm:col-span-2"><Textarea rows={4} value={about.bio} onChange={(e) => setAbout({ ...about, bio: e.target.value })} /></Field>
          </div>
        </Section>

        <Section title="Consultation fees" description={`What a patient pays for one consultation. The platform keeps ${profile.commissionPercent}% and the rest is yours.`} fields={() => fees}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Video call (₹)"><Input type="number" min="0" step="1" inputMode="numeric" value={fees.videoFee} onChange={(e) => setFees({ ...fees, videoFee: e.target.value })} /></Field>
            <Field label="Phone call (₹)" hint="Leave one empty if you do not offer it."><Input type="number" min="0" step="1" inputMode="numeric" value={fees.audioFee} onChange={(e) => setFees({ ...fees, audioFee: e.target.value })} /></Field>
          </div>
        </Section>

        <Section title="Your clinic" fields={() => clinic}>
          <div className="grid gap-4 sm:grid-cols-6">
            <Field label="Clinic name" className="sm:col-span-6"><Input value={clinic.clinicName} onChange={(e) => setClinic({ ...clinic, clinicName: e.target.value })} /></Field>
            <Field label="Address" className="sm:col-span-6"><Textarea rows={2} value={clinic.clinicAddress} onChange={(e) => setClinic({ ...clinic, clinicAddress: e.target.value })} /></Field>
            <Field label="City" className="sm:col-span-2"><Input value={clinic.clinicCity} onChange={(e) => setClinic({ ...clinic, clinicCity: e.target.value })} /></Field>
            <Field label="State" className="sm:col-span-2"><Input value={clinic.clinicState} onChange={(e) => setClinic({ ...clinic, clinicState: e.target.value })} /></Field>
            <Field label="Pincode" className="sm:col-span-2"><Input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} title="A 6-digit pincode" value={clinic.clinicPincode} onChange={(e) => setClinic({ ...clinic, clinicPincode: e.target.value.replace(/\D/g, "") })} /></Field>
          </div>
        </Section>

        <Section title="Bank account for payouts" description="Your earnings from consultations are paid into this account." fields={() => bank}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Account holder's name"><Input value={bank.bankAccountName} onChange={(e) => setBank({ ...bank, bankAccountName: e.target.value })} /></Field>
            <Field label="Account number" hint={profile.bankAccountEnding ? `Saved: ending in ${profile.bankAccountEnding}. Type a number only to change it.` : undefined}>
              <Input inputMode="numeric" autoComplete="off" placeholder={profile.bankAccountEnding ? `•••• ${profile.bankAccountEnding}` : ""} value={bank.bankAccountNumber} onChange={(e) => setBank({ ...bank, bankAccountNumber: e.target.value.replace(/\D/g, "") })} />
            </Field>
            <Field label="IFSC code"><Input className="uppercase" maxLength={11} placeholder="HDFC0001234" value={bank.bankIfsc} onChange={(e) => setBank({ ...bank, bankIfsc: e.target.value.toUpperCase() })} /></Field>
          </div>
        </Section>
      </div>

      <div className="grid gap-4">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 text-center">
            <span className="relative">
              <span className="flex size-28 items-center justify-center overflow-hidden rounded-full border bg-muted text-3xl font-semibold text-muted-foreground">
                {photoBusy ? <Spinner size="md" />
                  // eslint-disable-next-line @next/next/no-img-element -- an uploaded photo of unknown size
                  : profile.photoUrl ? <img src={profile.photoUrl} alt="" className="size-full object-cover" /> : profile.displayName.replace(/^dr\.?\s*/i, "").charAt(0).toUpperCase()}
              </span>
              <button type="button" aria-label="Change your photo" disabled={photoBusy} onClick={() => photoInput.current?.click()}
                className="absolute right-0 bottom-0 flex size-9 items-center justify-center rounded-full border bg-background shadow-sm hover:bg-surface-2"><Camera className="size-4" /></button>
              <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => changePhoto(e.target.files?.[0])} />
            </span>
            <div>
              <p className="text-lg font-semibold">{profile.displayName}</p>
              <p className="text-sm text-muted-foreground">{[profile.qualification, profile.clinicCity].filter(Boolean).join(" · ")}</p>
            </div>
            <StatusBadge status={profile.verificationStatus} label={profile.verificationStatus === "APPROVED" ? "Verified doctor" : profile.verificationStatus === "PENDING" || profile.verificationStatus === "UNDER_REVIEW" ? "Verification in progress" : humanize(profile.verificationStatus)} />
            {profile.rejectionReason ? <p className="text-sm text-destructive">{profile.rejectionReason}</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><BadgeCheck className="size-4 text-primary" /> Verified details</CardTitle><CardDescription>These were checked against your documents. Contact us to change them.</CardDescription></CardHeader>
          <CardContent>
            <dl className="grid gap-2 text-sm">
              {[
                ["Name", profile.displayName], ["Mobile number", profile.phone ? `+91 ${profile.phone}` : null], ["Qualification", profile.qualification],
                ["Registration number", profile.registrationNumber], ["Registered with", profile.registrationCouncil],
              ].filter(([, value]) => value).map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3"><dt className="text-muted-foreground">{label}</dt><dd className="text-right font-medium">{value}</dd></div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Your documents</CardTitle></CardHeader>
          <CardContent>
            {profile.documents.length === 0 ? <p className="text-sm text-muted-foreground">No documents on file.</p> : (
              <ul className="grid gap-2">
                {profile.documents.map((doc) => (
                  <li key={doc.id} className="flex items-center gap-3 text-sm">
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1"><span className="block truncate">{DOCUMENT_LABEL[doc.type] ?? humanize(doc.type)}</span>{doc.rejectionReason ? <span className="block text-xs text-destructive">{doc.rejectionReason}</span> : null}</span>
                    <StatusBadge status={doc.status} label={doc.status === "PENDING" ? "Being checked" : doc.status === "APPROVED" ? "Accepted" : "Not accepted"} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Lock className="size-4 text-primary" /> {user?.hasPassword ? "Change password" : "Set a password"}</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); if (password.next !== password.again) return toast.error("The two passwords do not match"); savePassword.mutate(); }}>
              <Field label="New password"><Input required minLength={8} type="password" autoComplete="new-password" value={password.next} onChange={(e) => setPassword({ ...password, next: e.target.value })} /></Field>
              <Field label="Type it again"><Input required minLength={8} type="password" autoComplete="new-password" value={password.again} onChange={(e) => setPassword({ ...password, again: e.target.value })} /></Field>
              <Button type="submit" variant="outline" className="h-9 justify-self-start" loading={savePassword.isPending}>Save password</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function DoctorProfilePage() {
  const { data, isPending } = useQuery({ queryKey: ["doctor-profile"], queryFn: () => api<Profile>("/doctor/profile") });
  return (
    <>
      <PageHeader title="Profile" description="How patients see you, your fees, your clinic and where your earnings are paid." />
      {isPending || !data ? <Skeleton className="h-96 rounded-xl" /> : <ProfileForm key={data.displayName} profile={data} />}
    </>
  );
}
