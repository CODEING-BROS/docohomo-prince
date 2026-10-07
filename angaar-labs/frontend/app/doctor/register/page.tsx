"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Camera, Check, Eye, EyeOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { type DocumentDraft, DocumentsField } from "@/components/admin/documents-field";
import { Stepper } from "@/components/custom/stepper";
import { AuthFrame } from "@/components/doctor/auth-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";
import { goFresh } from "@/lib/navigate";
import { INDIAN_STATES } from "@/lib/india";
import { uploadMyDocument, uploadMyPhoto } from "@/lib/upload";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/custom/loaders";

const STEPS = ["Your proofs", "Password", "About you", "Check and submit"];
const TITLES = ["Dr.", "Mr.", "Mrs.", "Ms.", "Prof."];
const LANGUAGES = [
  "Hindi", "English", "Bengali", "Marathi", "Telugu", "Tamil", "Gujarati", "Urdu", "Kannada", "Odia", "Malayalam", "Punjabi", "Assamese", "Konkani", "Sindhi", "Kashmiri",
];
const GENDERS = [{ value: "MALE", label: "Male" }, { value: "FEMALE", label: "Female" }, { value: "OTHER", label: "Other" }];
// the professional proof can be any one of these
const PROOF_KINDS = [
  { value: "REGISTRATION_CERTIFICATE", label: "Registration certificate" },
  { value: "CLINIC_PROOF:Visiting card", label: "Visiting card" },
  { value: "CLINIC_PROOF:Letterhead", label: "Letterhead" },
  { value: "CLINIC_PROOF:Clinic signboard", label: "Photo of clinic signboard" },
  { value: "DEGREE_CERTIFICATE", label: "Degree certificate" },
];

type Stream = { name: string; specializations: { id: number; name: string; description: string | null }[] };

const blank = {
  password: "", confirmPassword: "",
  title: "Dr.", name: "", email: "", gender: "", dateOfBirth: "", city: "", location: "", state: "",
  languages: [] as string[], experienceYears: "", stream: "", specializationId: "",
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

function Section({ number, title, text, children }: { number: number; title: string; text?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{number}</span>
        <div><h3 className="font-medium">{title}</h3>{text ? <p className="text-sm text-muted-foreground">{text}</p> : null}</div>
      </div>
      {children}
    </section>
  );
}

function Summary({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex justify-between gap-4 border-b py-2 text-sm last:border-b-0"><dt className="text-muted-foreground">{label}</dt><dd className="text-right font-medium">{value}</dd></div>;
}

/** Step two for a new doctor: proofs, password and personal details, checked once before sending. */
export default function DoctorRegisterPage() {
  const queryClient = useQueryClient();
  const { user, loading } = useSession();
  const photoInput = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(blank);
  const [idProof, setIdProof] = useState<DocumentDraft[]>([]);
  const [proofKind, setProofKind] = useState(PROOF_KINDS[0].value);
  const [proof, setProof] = useState<DocumentDraft[]>([]);
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [latestBirthday] = useState(() => new Date(Date.now() - 18 * 365.25 * 86400000).toISOString().slice(0, 10)); // a doctor is at least 18
  const set = <K extends keyof typeof blank>(key: K, value: (typeof blank)[K]) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (user?.doctor) goFresh("/doctor"); // already registered
    else if (!loading && !user) goFresh("/doctor/signup"); // the account comes first
  }, [user, loading]);

  const { data: streams } = useQuery({ queryKey: ["care-streams"], queryFn: () => api<{ items: Stream[] }>("/care/streams") });

  const uploadPhoto = async (file: File | undefined) => {
    if (photoInput.current) photoInput.current.value = "";
    if (!file) return;
    setPhotoBusy(true);
    try {
      setPhotoUrl(await uploadMyPhoto(file));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setPhotoBusy(false);
    }
  };

  const specializations = streams?.items.find((s) => s.name === form.stream)?.specializations ?? [];
  const [proofType, proofLabel] = proofKind.split(":");
  const register = useMutation({
    mutationFn: () =>
      api<{ testRequired: boolean }>("/me/doctor-registration", {
        method: "POST",
        body: {
          ...form, photoUrl,
          documents: [
            ...idProof,
            ...proof.map((doc) => ({ ...doc, type: proofType, fileName: proofLabel ? `${proofLabel}: ${doc.fileName}` : doc.fileName })),
          ],
        },
      }),
    // straight into the dashboard: the registration also signs the doctor in as a doctor
    onSuccess: (result) => {
      queryClient.clear();
      goFresh(result.testRequired ? "/doctor/test?welcome=1" : "/doctor");
    },
    onError: (err) => toast.error(err.message),
  });

  const next = (event: React.FormEvent) => {
    event.preventDefault();
    if (step === 0) {
      if (idProof.length === 0) return toast.error("Upload your government ID proof");
      if (proof.length === 0) return toast.error("Upload your professional proof");
      if (!photoUrl) return toast.error("Upload your photo");
    }
    if (step === 1 && form.password !== form.confirmPassword) return toast.error("The two passwords do not match");
    if (step === 2) {
      if (!form.gender) return toast.error("Choose your gender");
      if (form.languages.length === 0) return toast.error("Choose at least one language");
      if (!form.stream) return toast.error("Choose your main consulting stream");
      if (specializations.length && !form.specializationId) return toast.error("Choose your specialization");
    }
    if (step === 3) return register.mutate();
    setStep(step + 1);
    window.scrollTo({ top: 0 });
  };

  if (loading || !user || user.doctor) return <AuthFrame title="Complete your registration" wide><Skeleton className="h-64 rounded-xl" /></AuthFrame>;

  return (
    <AuthFrame
      wide
      eyebrow="Step 2 of 2"
      title="Complete your registration"
      description="Your account is confirmed. Tell us who you are, then answer a few questions on your stream. Our team verifies every doctor before patients can book."
      header={<Stepper steps={STEPS.map((label, index) => ({ id: label, label, state: index < step ? "done" : index === step ? "current" : "upcoming" }))} compact />}
    >

      <form onSubmit={next} className="grid gap-4">
        {step === 0 ? (
          <>
            <Section number={1} title="Government ID proof" text="Any government-approved ID that shows your photo and address: Aadhaar, passport, driving licence or voter ID.">
              <DocumentsField kinds={[{ type: "GOVERNMENT_ID", label: "ID proof with photo and address", hint: "PDF or photo, up to 5 MB" }]} value={idProof} onChange={setIdProof} uploader={uploadMyDocument} />
            </Section>
            <Section number={2} title="Professional proof" text="One document that shows you practise: your registration certificate, visiting card, letterhead or a photo of your clinic signboard.">
              <div className="grid gap-1.5 sm:max-w-xs">
                <Label>What are you uploading?</Label>
                <Select value={proofKind} onValueChange={setProofKind}>
                  <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{PROOF_KINDS.map((kind) => <SelectItem key={kind.value} value={kind.value}>{kind.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <DocumentsField kinds={[{ type: "PROOF", label: PROOF_KINDS.find((k) => k.value === proofKind)?.label ?? "Professional proof", hint: "PDF or photo, up to 5 MB" }]} value={proof} onChange={setProof} uploader={uploadMyDocument} />
            </Section>
            <Section number={3} title="Your photo" text="A clear, recent photo of your face. Patients see it on your profile.">
              <div className="flex items-center gap-4">
                <span className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted text-muted-foreground">
                  {photoBusy ? <Spinner size="md" />
                    // eslint-disable-next-line @next/next/no-img-element -- an uploaded photo of unknown size
                    : photoUrl ? <img src={photoUrl} alt="Your photo" className="size-full object-cover" /> : <Camera className="size-7" />}
                </span>
                <div className="grid gap-1.5">
                  <Button type="button" variant="outline" disabled={photoBusy} onClick={() => photoInput.current?.click()}><Camera /> {photoUrl ? "Change photo" : "Upload photo"}</Button>
                  <p className="text-xs text-muted-foreground">JPG or PNG, up to 5 MB</p>
                </div>
                <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => uploadPhoto(e.target.files?.[0])} />
              </div>
            </Section>
          </>
        ) : null}

        {step === 1 ? (
          <Section number={4} title="Create your password" text={`You will sign in with your mobile number ${user.phone ? `(+91 ${user.phone}) ` : ""}or email and this password.`}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Password" hint="At least 8 characters.">
                <div className="relative">
                  <Input required autoFocus minLength={8} type={showPassword ? "text" : "password"} autoComplete="new-password" className="h-10 pr-10" value={form.password} onChange={(e) => set("password", e.target.value)} />
                  <button type="button" aria-label={showPassword ? "Hide the password" : "Show the password"} className="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </Field>
              <Field label="Confirm password">
                <Input required minLength={8} type={showPassword ? "text" : "password"} autoComplete="new-password" className="h-10" value={form.confirmPassword} onChange={(e) => set("confirmPassword", e.target.value)}
                  aria-invalid={form.confirmPassword !== "" && form.confirmPassword !== form.password} />
                {form.confirmPassword !== "" && form.confirmPassword !== form.password ? <p className="text-xs text-destructive">The two passwords do not match.</p> : null}
              </Field>
            </div>
          </Section>
        ) : null}

        {step === 2 ? (
          <>
            <Section number={5} title="Your details">
              <div className="grid gap-4 sm:grid-cols-6">
                <Field label="Title" className="sm:col-span-1">
                  <Select value={form.title} onValueChange={(v) => set("title", v)}>
                    <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{TITLES.map((title) => <SelectItem key={title} value={title}>{title}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Full name" className="sm:col-span-5"><Input required minLength={2} autoFocus autoComplete="name" className="h-10" placeholder="Asha Verma" value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
                {!user.email ? <Field label="Email address" className="sm:col-span-6"><Input required type="email" autoComplete="email" className="h-10" placeholder="you@example.com" value={form.email} onChange={(e) => set("email", e.target.value)} /></Field> : null}
                <Field label="Gender" className="sm:col-span-3">
                  <div role="radiogroup" aria-label="Gender" className="grid h-10 grid-cols-3 rounded-md border p-0.5">
                    {GENDERS.map((gender) => (
                      <button key={gender.value} type="button" role="radio" aria-checked={form.gender === gender.value} onClick={() => set("gender", gender.value)}
                        className={cn("rounded text-sm", form.gender === gender.value ? "bg-primary font-medium text-primary-foreground" : "text-muted-foreground hover:bg-surface-2")}>
                        {gender.label}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Date of birth" className="sm:col-span-3"><Input required type="date" className="h-10" max={latestBirthday} min="1930-01-01" value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} /></Field>
                <Field label="City or town" className="sm:col-span-3"><Input required minLength={2} autoComplete="address-level2" className="h-10" value={form.city} onChange={(e) => set("city", e.target.value)} /></Field>
                <Field label="State" className="sm:col-span-3">
                  <Select value={form.state} onValueChange={(v) => set("state", v)}>
                    <SelectTrigger className="h-10 w-full"><SelectValue placeholder="Choose" /></SelectTrigger>
                    <SelectContent className="max-h-72">{INDIAN_STATES.map((state) => <SelectItem key={state} value={state}>{state}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Location" hint="Area, locality or clinic address." className="sm:col-span-6"><Input className="h-10" placeholder="Sector 14, near City Hospital" value={form.location} onChange={(e) => set("location", e.target.value)} /></Field>
              </div>
            </Section>

            <Section number={6} title="Languages you consult in" text="Choose every language you are comfortable consulting in.">
              <div className="flex flex-wrap gap-2">
                {LANGUAGES.map((language) => {
                  const on = form.languages.includes(language);
                  return (
                    <button key={language} type="button" role="checkbox" aria-checked={on}
                      onClick={() => set("languages", on ? form.languages.filter((l) => l !== language) : [...form.languages, language])}
                      className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm", on ? "border-primary bg-primary/10 font-medium text-primary" : "hover:bg-surface-2")}>
                      <span className={cn("flex size-4 items-center justify-center rounded-sm border", on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40")}>{on ? <Check className="size-3" /> : null}</span>
                      {language}
                    </button>
                  );
                })}
              </div>
              {form.languages.length ? <p className="text-xs text-muted-foreground">{form.languages.length} chosen</p> : null}
            </Section>

            <Section number={7} title="Your practice">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Work experience (years)"><Input required type="number" min="0" max="80" step="0.5" inputMode="decimal" className="h-10" value={form.experienceYears} onChange={(e) => set("experienceYears", e.target.value)} /></Field>
                <Field label="Main consulting stream">
                  <Select value={form.stream} onValueChange={(v) => setForm({ ...form, stream: v, specializationId: "" })}>
                    <SelectTrigger className="h-10 w-full"><SelectValue placeholder="Choose" /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      {(streams?.items ?? []).map((stream) => (
                        <SelectItem key={stream.name} value={stream.name}>{stream.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                {specializations.length ? (
                  <Field label="Your specialization" hint="Patients are matched to you by it, and your test questions are chosen for it." className="sm:col-span-2">
                    <Select value={form.specializationId} onValueChange={(v) => set("specializationId", v)}>
                      <SelectTrigger className="h-10 w-full"><SelectValue placeholder="Choose what you mainly treat" /></SelectTrigger>
                      <SelectContent className="max-h-72">
                        {specializations.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}{s.description ? <span className="text-muted-foreground"> · {s.description}</span> : null}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                ) : null}
              </div>
            </Section>
          </>
        ) : null}

        {step === 3 ? (
          <section className="grid gap-4 rounded-xl border bg-card p-4 sm:p-5">
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- an uploaded photo of unknown size */}
              <img src={photoUrl} alt="" className="size-16 rounded-full border object-cover" />
              <div><p className="text-lg font-semibold">{form.title} {form.name}</p><p className="text-sm text-muted-foreground">{[form.stream, specializations.find((s) => String(s.id) === form.specializationId)?.name, `${form.experienceYears} years of experience`].filter(Boolean).join(" · ")}</p></div>
            </div>
            <dl>
              <Summary label="Email" value={user.email ?? form.email} />
              <Summary label="Mobile number" value={`+91 ${user.phone}`} />
              <Summary label="Gender" value={GENDERS.find((g) => g.value === form.gender)?.label} />
              <Summary label="Date of birth" value={form.dateOfBirth ? new Date(`${form.dateOfBirth}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : ""} />
              <Summary label="City" value={[form.location, form.city, form.state].filter(Boolean).join(", ")} />
              <Summary label="Languages" value={form.languages.join(", ")} />
              <Summary label="ID proof" value={idProof[0]?.fileName} />
              <Summary label={PROOF_KINDS.find((k) => k.value === proofKind)?.label ?? "Professional proof"} value={proof[0]?.fileName} />
            </dl>
            <label className="flex cursor-pointer items-start gap-2.5 text-sm">
              <input type="checkbox" required className="mt-0.5 size-4 accent-(--primary)" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              <span>I confirm that these details and documents are my own and are true.</span>
            </label>
          </section>
        ) : null}

        <div className="flex items-center justify-between gap-3 pt-2">
          {step > 0 ? <Button type="button" variant="ghost" className="h-10" onClick={() => setStep(step - 1)}><ArrowLeft /> Back</Button> : <span />}
          <Button type="submit" size="lg" className="px-6" loading={register.isPending} disabled={photoBusy}>
            {step === STEPS.length - 1 ? "Verify and submit" : <>Continue <ArrowRight data-icon="inline-end" /></>}
          </Button>
        </div>
      </form>
    </AuthFrame>
  );
}
