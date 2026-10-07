"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Baby, CalendarCheck, Check, Clock, Languages, Paperclip, Phone, Search, Sparkles, Star, UserRound, UsersRound, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { AssignedTime, type SlotTime, slotLabel, useAssignedTime } from "@/components/patient/assigned-time";
import { GradientAvatar } from "@/components/custom/avatar";
import { Callout } from "@/components/custom/callout";
import { ChipPicker } from "@/components/custom/chip-picker";
import { DetailList } from "@/components/custom/detail-list";
import { EmptyState } from "@/components/custom/empty-state";
import { type AttachedFile, FileChips } from "@/components/custom/file-chips";
import { FormField, OptionalMark } from "@/components/custom/form-field";
import { IconTile } from "@/components/custom/icon-tile";
import { LabelTag } from "@/components/custom/label-tag";
import { Reveal } from "@/components/custom/motion";
import { Money } from "@/components/custom/number";
import { PageHero } from "@/components/custom/page-hero";
import { SectionCard } from "@/components/custom/section-card";
import { Stepper } from "@/components/custom/stepper";
import { Eyebrow } from "@/components/custom/typography";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { uploadConsultationFile } from "@/lib/upload";
import { cn } from "@/lib/utils";

// Guided booking: who it is for, their details, the problem, the specialization the symptoms point at,
// a few preferences, then the two or three doctors that fit best. The choosing is done by the server
// (backend/src/lib/doctor-match.ts); this page only asks the questions and shows the answer.

type Relation = "SELF" | "FAMILY" | "CHILD";
type Mode = "VIDEO" | "AUDIO";
type Specialization = { id: number; name: string; description: string | null; isGeneral: boolean };
type Catalogue = { symptoms: string[]; specializations: (Specialization & { symptomCount: number })[] };
type Suggestion = { best: Specialization | null; all: (Specialization & { hits: number })[] };
type Match = {
  id: number; slug: string; displayName: string; photoUrl: string | null; qualification: string | null; specialization: string | null;
  experienceYears: number | null; languages: string[]; clinicCity: string | null; slotMinutes: number; videoFee: number | null; audioFee: number | null; fee: number;
  ratingAverage: number; ratingCount: number; tier: string | null; consultationsDone: number;
  nextSlot: { startsAt: string; time: string; day: string }; reason: "BEST_MATCH" | "BEST_VALUE" | "EXPERIENCED"; why: string[];
};
type MatchResult = { sessionId: number | null; typicalFee: number | null; newPatient: boolean; priceGuardRelaxed: boolean; fitRelaxed: boolean; considered: number; specialization: { id: number; name: string } | null; items: Match[] };

const STEPS = ["Who", "Details", "Concern", "Speciality", "Preferences", "Doctors", "Book"];
const LANGUAGES = ["Hindi", "English", "Bengali", "Marathi", "Gujarati", "Tamil", "Telugu", "Kannada", "Malayalam", "Punjabi", "Odia", "Urdu"];
const DURATIONS = ["A few days", "1 to 2 weeks", "About a month", "A few months", "More than a year"];
const REASON: Record<Match["reason"], { label: string; tone: "terracotta" | "primary" | "ink"; hint: string }> = {
  BEST_MATCH: { label: "Best match", tone: "terracotta", hint: "Fits what you told us most closely" },
  BEST_VALUE: { label: "Best value", tone: "primary", hint: "The most for what you pay" },
  EXPERIENCED: { label: "Most experienced", tone: "ink", hint: "The longest practice among your matches" },
};
const MAX_FILES = 5;
const cta = "bg-terracotta text-terracotta-foreground not-disabled:hover:bg-terracotta/90";

const indiaToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const ageFrom = (dateOfBirth: string | null | undefined) => {
  if (!dateOfBirth) return "";
  const today = indiaToday();
  const years = Number(today.slice(0, 4)) - Number(dateOfBirth.slice(0, 4)) - (today.slice(5) < dateOfBirth.slice(5, 10) ? 1 : 0);
  return years >= 0 ? String(years) : "";
};

/** A large tappable card for a one-of-a-few choice. */
function Choice({ selected, onSelect, icon, title, text, className }: { selected: boolean; onSelect: () => void; icon?: typeof UserRound; title: string; text?: string; className?: string }) {
  return (
    <button
      type="button" aria-pressed={selected} onClick={onSelect}
      className={cn(
        "flex items-center gap-3 rounded-xl border bg-card p-4 text-left transition-[border-color,background-color,box-shadow] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        selected ? "border-terracotta bg-terracotta-soft/50 shadow-[inset_3px_0_0_var(--terracotta)]" : "hover:border-foreground/30 hover:bg-surface-2",
        className,
      )}
    >
      {icon ? <IconTile icon={icon} tone={selected ? "terracotta" : "neutral"} size="lg" /> : null}
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        {text ? <span className="block text-sm text-muted-foreground">{text}</span> : null}
      </span>
      {selected ? <Check className="size-5 shrink-0 text-terracotta" /> : null}
    </button>
  );
}

/** One suggested doctor, with the time the system offers and a way to ask for the next one. */
function DoctorCard({ doctor, onBook }: { doctor: Match; onBook: (slot: SlotTime) => void }) {
  const reason = REASON[doctor.reason];
  const time = useAssignedTime(doctor.slug, doctor.nextSlot);
  return (
    <article className={cn("rounded-xl border bg-card p-4 transition-[border-color,box-shadow] hover:border-foreground/30", doctor.reason === "BEST_MATCH" && "border-terracotta/50 shadow-[inset_3px_0_0_var(--terracotta)]")}>
      <div className="flex flex-wrap items-start gap-4">
        <GradientAvatar name={doctor.displayName} src={doctor.photoUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <LabelTag tone={reason.tone} size="sm">{reason.label}</LabelTag>
            <span className="text-xs text-muted-foreground">{reason.hint}</span>
          </div>
          <h2 className="font-display mt-1.5 text-xl font-medium">{doctor.displayName}</h2>
          <p className="text-sm text-muted-foreground">{[doctor.qualification, doctor.experienceYears !== null ? `${doctor.experienceYears} ${doctor.experienceYears === 1 ? "year" : "years"}` : null, doctor.clinicCity].filter(Boolean).join(" · ")}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {doctor.ratingCount ? <span className="inline-flex items-center gap-1"><Star className="size-3.5 fill-warning text-warning" /> <span className="font-medium text-foreground">{doctor.ratingAverage.toFixed(1)}</span> from {doctor.ratingCount}</span> : <span>New on DocHomoeo</span>}
            {doctor.languages.length ? <span className="inline-flex items-center gap-1"><Languages className="size-3.5" /> {doctor.languages.slice(0, 3).join(", ")}</span> : null}
          </div>
          <ul className="mt-2 grid gap-1 text-sm">
            {doctor.why.filter((line) => !line.startsWith("Free today") || time.moved === 0).map((line) => <li key={line} className="flex items-center gap-2"><Check className="size-3.5 shrink-0 text-success" /> {line}</li>)}
          </ul>
        </div>
        <div className="flex w-full flex-col items-stretch gap-2 sm:w-56">
          <p className="font-display ledger text-3xl font-medium sm:text-right"><Money value={doctor.fee} /></p>
          <AssignedTime time={time} size="sm" />
          <Button className={cn("w-full", cta)} disabled={!time.slot} onClick={() => time.slot && onBook(time.slot)}>Book this time</Button>
        </div>
      </div>
    </article>
  );
}

/** The last step: the assigned time, video or phone, and paying. */
function BookStep({ doctor, first, mode, onMode, pending, onBook, onBack, summary }: {
  doctor: Match; first: SlotTime | null; mode: Mode; onMode: (mode: Mode) => void; pending: boolean;
  onBook: (time: ReturnType<typeof useAssignedTime>) => void; onBack: () => void; summary: { label: string; value: string }[];
}) {
  const time = useAssignedTime(doctor.slug, first ?? doctor.nextSlot);
  const fee = (mode === "VIDEO" ? doctor.videoFee : doctor.audioFee) ?? doctor.fee;
  return (
    <form className="grid items-start gap-4 lg:grid-cols-5" onSubmit={(e) => { e.preventDefault(); if (time.slot) onBook(time); }}>
      <SectionCard className="lg:col-span-3" title={doctor.displayName} description={`Each consultation lasts ${doctor.slotMinutes} minutes.`}>
        <div className="grid gap-4">
          <AssignedTime time={time} />
          <div className="grid gap-2 sm:grid-cols-2">
            {([["VIDEO", doctor.videoFee, Video, "Video call"], ["AUDIO", doctor.audioFee, Phone, "Phone call"]] as const).filter(([, modeFee]) => modeFee !== null).map(([m, modeFee, Icon, label]) => (
              <button key={m} type="button" aria-pressed={m === mode} onClick={() => onMode(m)}
                className={cn("flex items-center gap-3 rounded-lg border p-3 text-left transition-colors", m === mode ? "border-primary/40 bg-primary-soft/40 ring-1 ring-primary/30" : "bg-card hover:bg-surface-2")}>
                <IconTile icon={Icon} tone={m === mode ? "primary" : "neutral"} size="sm" />
                <span className="flex-1 text-sm font-medium">{label}</span>
                <span className="ledger text-sm font-semibold">{formatMoney(modeFee!)}</span>
              </button>
            ))}
          </div>
        </div>
      </SectionCard>

      <SectionCard className="lg:sticky lg:top-20 lg:col-span-2" title="Your booking">
        <div className="grid gap-4">
          <DetailList
            items={[
              ...summary,
              { label: "When", value: time.slot ? slotLabel(time.slot) : "No free time", tone: time.slot ? undefined : "warning" },
              { label: "How", value: mode === "VIDEO" ? "Video call" : "Phone call" },
            ]}
            total={{ label: "To pay", value: <Money value={fee} /> }}
          />
          <Button type="submit" size="lg" className={cn("h-11", cta)} loading={pending} disabled={!time.slot}>
            {!pending ? <CalendarCheck data-icon="inline-start" /> : null}Pay and book
          </Button>
          <Button type="button" variant="ghost" onClick={onBack}><ArrowLeft data-icon="inline-start" /> Choose another doctor</Button>
        </div>
      </SectionCard>
    </form>
  );
}

export default function GuidedBookingPage() {
  const router = useRouter();
  const { user } = useSession();
  const [step, setStep] = useState(0);

  // 1 and 2: who, and their details
  const [relation, setRelation] = useState<Relation | null>(null);
  const [person, setPerson] = useState({ name: "", age: "", gender: "", city: "", languages: [] as string[] });
  // 3: the concern
  const [problem, setProblem] = useState("");
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [symptomSearch, setSymptomSearch] = useState("");
  const [duration, setDuration] = useState("");
  const [severity, setSeverity] = useState("MODERATE");
  const [more, setMore] = useState({ conditions: "", diagnosis: "", medications: "" });
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const filePicker = useRef<HTMLInputElement>(null);
  // 4 and 5
  const [specializationId, setSpecializationId] = useState<number | null>(null);
  const [prefs, setPrefs] = useState({ price: "ANY", mode: "ANY", when: "ANY" });
  // 6 and 7
  const [chosen, setChosen] = useState<Match | null>(null);
  const [offered, setOffered] = useState<SlotTime | null>(null); // the time shown on the card the patient chose
  const [mode, setMode] = useState<Mode>("VIDEO");

  const { data: catalogue } = useQuery({ queryKey: ["care-symptoms"], queryFn: () => api<Catalogue>("/care/symptoms"), staleTime: 5 * 60_000 });
  const suggest = useMutation({ mutationFn: () => api<Suggestion>("/care/suggest-specialization", { method: "POST", body: { symptoms, problem } }) });
  const match = useMutation({
    mutationFn: () => api<MatchResult>("/me/match", { method: "POST", body: { specializationId: specializationId ?? undefined, symptoms, problem, severity, mode: prefs.mode, when: prefs.when, price: prefs.price, languages: person.languages, city: person.city } }),
    onError: (err) => toast.error(err.message),
  });

  const specializationName = catalogue?.specializations.find((s) => s.id === specializationId)?.name ?? match.data?.specialization?.name ?? "";

  const timeRef = useRef<ReturnType<typeof useAssignedTime> | null>(null);
  const time = { get slot() { return timeRef.current?.slot ?? null; }, reload: () => timeRef.current?.reload() };
  const book = useMutation({
    mutationFn: async () => {
      const booked = await api<{ id: number }>("/me/appointments", {
        method: "POST",
        body: {
          doctorId: chosen!.id, startsAt: time.slot!.startsAt, mode, patientName: person.name, patientAge: Number(person.age), patientGender: person.gender,
          symptoms: [problem, symptoms.length ? `Symptoms: ${symptoms.join(", ")}` : "", duration ? `For: ${duration.toLowerCase()}` : ""].filter(Boolean).join("\n"),
          matchSessionId: match.data?.sessionId ?? undefined,
          fileIds: files.map((file) => file.id),
          intake: { relation: relation ?? undefined, city: person.city || undefined, language: person.languages.join(", ") || undefined, symptoms, duration: duration || undefined, severity, conditions: more.conditions || undefined, diagnosis: more.diagnosis || undefined, medications: more.medications || undefined, specialization: specializationName || undefined },
        },
      });
      return api<{ payUrl: string | null }>(`/me/appointments/${booked.id}/pay`, { method: "POST" });
    },
    onSuccess: ({ payUrl }) => {
      if (payUrl) return window.location.assign(payUrl); // on to the pay page; it sends the patient back afterwards
      router.push("/patient/consultations?booked=1");
    },
    // most often the slot was taken meanwhile: offer the earliest one that is still free
    onError: (err) => { toast.error(err.message); time.reload(); },
  });

  // ── moving between steps
  const pickRelation = (value: Relation) => {
    setRelation(value);
    // "myself" starts from what the account already knows
    setPerson(value === "SELF"
      ? { ...person, name: [user?.firstName, user?.lastName].filter(Boolean).join(" ") || person.name, age: ageFrom(user?.dateOfBirth) || person.age, gender: user?.gender ?? person.gender }
      : { ...person, name: "", age: "", gender: "" });
    setStep(1);
  };
  const toSpeciality = async () => {
    if (problem.trim().length < 5 && symptoms.length === 0) return toast.error("Tell us the problem, or pick at least one symptom");
    const found = await suggest.mutateAsync();
    setSpecializationId((current) => current ?? found.best?.id ?? null);
    setStep(3);
  };
  const findDoctors = async () => {
    setChosen(null);
    setStep(5);
    await match.mutateAsync().catch(() => undefined);
  };
  const choose = (doctor: Match, slot: SlotTime) => {
    setChosen(doctor);
    setOffered(slot);
    setMode(prefs.mode === "AUDIO" && doctor.audioFee !== null ? "AUDIO" : doctor.videoFee !== null ? "VIDEO" : "AUDIO");
    if (match.data?.sessionId) api(`/me/match/${match.data.sessionId}/opened`, { method: "POST", body: { doctorId: doctor.id } }).catch(() => undefined);
    setStep(6);
  };

  const visibleSymptoms = (catalogue?.symptoms ?? []).filter((s) => !symptomSearch.trim() || s.toLowerCase().includes(symptomSearch.trim().toLowerCase()));
  const toggleSymptom = (symptom: string) => setSymptoms((current) => (current.includes(symptom) ? current.filter((s) => s !== symptom) : [...current, symptom]));
  // files go up one at a time, so one that is refused does not lose the others
  const addFiles = async (picked: FileList | null) => {
    if (!picked?.length) return;
    const room = MAX_FILES - files.length;
    if (picked.length > room) toast.error(`You can add up to ${MAX_FILES} files`);
    setUploading(true);
    for (const file of [...picked].slice(0, room)) {
      try {
        const saved = await uploadConsultationFile(file);
        setFiles((current) => [...current, saved]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
      }
    }
    setUploading(false);
    if (filePicker.current) filePicker.current.value = "";
  };
  const removeFile = (file: AttachedFile) => {
    setFiles((current) => current.filter((f) => f.id !== file.id));
    api(`/me/consultation-files/${file.id}`, { method: "DELETE" }).catch(() => undefined);
  };
  const back = (to: number) => <Button type="button" variant="ghost" onClick={() => setStep(to)}><ArrowLeft data-icon="inline-start" /> Back</Button>;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHero eyebrow="Book a consultation" title={["Who is this consultation for?", "Tell us about the patient", "What is the problem?", "The right kind of doctor", "A few preferences", "Doctors for you", "Confirm and book"][step]}
        description={["We ask a few questions, then show you the two or three doctors who fit best.", "So the doctor knows who they are speaking to.", "The more you tell us, the better the match. Only your doctor sees this.", "Chosen from your symptoms. You can change it.", "Optional, and you can skip all of them.", "Picked for what you told us, not the most expensive.", "We give you the doctor's earliest free time. You pay now; you can cancel up to 2 hours before and get your money back."][step]}>
        <Stepper compact steps={STEPS.map((label, index) => ({ id: label, label, state: index < step ? "done" : index === step ? "current" : "upcoming" }))} className="w-full" />
      </PageHero>

      <Reveal key={step}>
        {step === 0 ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Choice icon={UserRound} title="Myself" text="I am the patient" selected={relation === "SELF"} onSelect={() => pickRelation("SELF")} className="flex-col items-start sm:py-6" />
            <Choice icon={UsersRound} title="A family member" text="Parent, partner or relative" selected={relation === "FAMILY"} onSelect={() => pickRelation("FAMILY")} className="flex-col items-start sm:py-6" />
            <Choice icon={Baby} title="My child" text="Under 18 years" selected={relation === "CHILD"} onSelect={() => pickRelation("CHILD")} className="flex-col items-start sm:py-6" />
          </div>
        ) : null}

        {step === 1 ? (
          <form onSubmit={(e) => { e.preventDefault(); if (!person.gender) return toast.error("Choose the gender"); setStep(2); }}>
            <SectionCard>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label={relation === "SELF" ? "Your full name" : "Patient's full name"} className="sm:col-span-2">{(id) => <Input id={id} required minLength={2} maxLength={120} autoComplete={relation === "SELF" ? "name" : "off"} className="h-10" value={person.name} onChange={(e) => setPerson({ ...person, name: e.target.value })} />}</FormField>
                <FormField label="Age">{(id) => <Input id={id} required type="number" min="0" max={relation === "CHILD" ? 17 : 120} inputMode="numeric" className="ledger h-10" value={person.age} onChange={(e) => setPerson({ ...person, age: e.target.value })} />}</FormField>
                <FormField label={<>City <OptionalMark /></>}>{(id) => <Input id={id} maxLength={80} autoComplete="address-level2" className="h-10" placeholder="Pune" value={person.city} onChange={(e) => setPerson({ ...person, city: e.target.value })} />}</FormField>
                <div className="grid gap-2 sm:col-span-2">
                  <Eyebrow>Gender</Eyebrow>
                  <ChipPicker ariaLabel="Gender" value={person.gender} onChange={(gender) => setPerson({ ...person, gender })} options={[{ value: "FEMALE", label: "Female" }, { value: "MALE", label: "Male" }, { value: "OTHER", label: "Other" }]} />
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <Eyebrow>Languages you are comfortable in{person.languages.length ? ` · ${person.languages.length} chosen` : " · optional"}</Eyebrow>
                  <ChipPicker multiple max={6} size="sm" ariaLabel="Preferred languages" value={person.languages} onChange={(languages) => setPerson({ ...person, languages })} options={LANGUAGES} />
                  <p className="text-xs text-muted-foreground">Pick as many as you like. We look for a doctor who speaks at least one of them.</p>
                </div>
              </div>
            </SectionCard>
            <div className="mt-4 flex items-center justify-between">{back(0)}<Button type="submit" size="lg" className={cta}>Continue <ArrowRight data-icon="inline-end" /></Button></div>
          </form>
        ) : null}

        {step === 2 ? (
          <form onSubmit={(e) => { e.preventDefault(); toSpeciality(); }}>
            <SectionCard>
              <div className="grid gap-5">
                <FormField label="What problem are you experiencing?" hint="In your own words: what is wrong, and anything that makes it better or worse.">
                  {(id) => <Textarea id={id} rows={3} maxLength={2000} autoFocus placeholder="My hair has been falling a lot, with itching on the scalp" value={problem} onChange={(e) => setProblem(e.target.value)} />}
                </FormField>

                <div>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <Eyebrow>Symptoms{symptoms.length ? ` · ${symptoms.length} chosen` : ""}</Eyebrow>
                    <div className="relative w-full sm:w-64">
                      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input aria-label="Search symptoms" placeholder="Search symptoms" className="h-8 pl-8 text-sm" value={symptomSearch} onChange={(e) => setSymptomSearch(e.target.value)} />
                    </div>
                  </div>
                  {!catalogue ? <Skeleton className="h-24" /> : (
                    <div className="scroll-thin flex max-h-44 flex-wrap gap-1.5 overflow-y-auto">
                      {visibleSymptoms.map((symptom) => {
                        const on = symptoms.includes(symptom);
                        return (
                          <button key={symptom} type="button" aria-pressed={on} onClick={() => toggleSymptom(symptom)}
                            className={cn("inline-flex h-8 items-center gap-1 rounded-full border px-3 text-sm transition-colors", on ? "border-terracotta bg-terracotta text-terracotta-foreground" : "border-foreground/18 bg-card hover:bg-surface-2")}>
                            {on ? <Check className="size-3.5" /> : null}{symptom}
                          </button>
                        );
                      })}
                      {visibleSymptoms.length === 0 ? <p className="py-2 text-sm text-muted-foreground">Nothing matches. Describe it in the box above instead.</p> : null}
                    </div>
                  )}
                </div>

                <div className="grid gap-2">
                  <Eyebrow>How long have you had this?</Eyebrow>
                  <ChipPicker size="sm" ariaLabel="How long" value={duration} onChange={setDuration} options={DURATIONS} />
                </div>
                <div className="grid gap-2">
                  <Eyebrow>How bad is it?</Eyebrow>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {[["MILD", "Mild", "A nuisance, daily life goes on"], ["MODERATE", "Moderate", "It gets in the way most days"], ["SEVERE", "Severe", "Hard to work, eat or sleep"]].map(([value, title, text]) => (
                      <Choice key={value} title={title} text={text} selected={severity === value} onSelect={() => setSeverity(value)} className="p-3" />
                    ))}
                  </div>
                </div>
                {severity === "SEVERE" ? <Callout tone="warning" compact>For chest pain, trouble breathing, heavy bleeding or fainting, go to a hospital now. An online consultation is not for emergencies.</Callout> : null}

                <div className="grid gap-4 border-t border-foreground/18 pt-4 sm:grid-cols-3">
                  <FormField label={<>Existing conditions <OptionalMark /></>}>{(id) => <Input id={id} maxLength={500} placeholder="Diabetes, thyroid" value={more.conditions} onChange={(e) => setMore({ ...more, conditions: e.target.value })} />}</FormField>
                  <FormField label={<>Earlier diagnosis <OptionalMark /></>}>{(id) => <Input id={id} maxLength={500} placeholder="What a doctor has said before" value={more.diagnosis} onChange={(e) => setMore({ ...more, diagnosis: e.target.value })} />}</FormField>
                  <FormField label={<>Current medicines <OptionalMark /></>}>{(id) => <Input id={id} maxLength={500} placeholder="Names, if you know them" value={more.medications} onChange={(e) => setMore({ ...more, medications: e.target.value })} />}</FormField>
                </div>

                <div className="grid gap-2 border-t border-foreground/18 pt-4">
                  <Eyebrow>Reports or photos{files.length ? ` · ${files.length} added` : " · optional"}</Eyebrow>
                  <input ref={filePicker} type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" aria-label="Add reports or photos" onChange={(e) => addFiles(e.target.files)} />
                  <button
                    type="button" disabled={uploading || files.length >= MAX_FILES} onClick={() => filePicker.current?.click()}
                    onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
                    className="flex items-center gap-3 rounded-xl border border-dashed border-foreground/25 bg-surface-2/60 p-4 text-left transition-colors not-disabled:hover:border-terracotta not-disabled:hover:bg-terracotta-soft/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60"
                  >
                    <IconTile icon={Paperclip} tone="terracotta" size="lg" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{uploading ? "Uploading…" : files.length >= MAX_FILES ? "That is the most you can add" : "Add a test report, an old prescription or a photo"}</span>
                      <span className="block text-sm text-muted-foreground">PDF, JPG or PNG, up to 5 MB each, {MAX_FILES} files at most. Drop them here or tap to choose.</span>
                    </span>
                  </button>
                  <FileChips files={files} thumbnails hrefOf={(file) => `/api/me/consultation-files/${file.id}`} onRemove={removeFile} />
                  <p className="text-xs text-muted-foreground">Kept private: only you, the doctor you book and our care team can open them.</p>
                </div>
              </div>
            </SectionCard>
            <div className="mt-4 flex items-center justify-between">{back(1)}<Button type="submit" size="lg" className={cta} loading={suggest.isPending}>Continue <ArrowRight data-icon="inline-end" /></Button></div>
          </form>
        ) : null}

        {step === 3 ? (
          <>
            {suggest.data?.best && suggest.data.best.id === specializationId ? (
              <Callout tone="terracotta" icon={Sparkles} title={`We suggest: ${suggest.data.best.name}`} className="mb-4">
                {suggest.data.best.isGeneral && !suggest.data.all[0]?.hits ? "Your symptoms do not point at one speciality, so a general physician is the right place to start." : "Chosen from the symptoms you gave. Pick another below if you prefer."}
              </Callout>
            ) : null}
            <p className="mb-2 text-sm text-muted-foreground">Scroll and select the speciality of your choice.</p>
            <div className="scroll-thin grid max-h-[26rem] gap-3 overflow-y-auto rounded-xl border border-foreground/18 bg-surface-2/50 p-3 sm:grid-cols-2">
              {(catalogue?.specializations ?? []).map((s) => (
                <Choice key={s.id} icon={Sparkles} title={s.name} text={s.description ?? undefined} selected={specializationId === s.id} onSelect={() => setSpecializationId(s.id)} />
              ))}
            </div>
            {catalogue && catalogue.specializations.length === 0 ? <EmptyState bordered illustration="doctors" title="No specialities are set up yet" description="You can still continue; we will show the doctors available." /> : null}
            <div className="mt-4 flex items-center justify-between">{back(2)}<Button size="lg" className={cta} onClick={() => setStep(4)}>Continue <ArrowRight data-icon="inline-end" /></Button></div>
          </>
        ) : null}

        {step === 4 ? (
          <>
            <SectionCard>
              <div className="grid gap-5">
                <div>
                  <Eyebrow className="mb-2">What matters most on price?</Eyebrow>
                  <div className="grid gap-2 sm:grid-cols-4">
                    {[["ANY", "No preference", "Show me the best fit"], ["BUDGET", "Keep it low", "Lower fees first"], ["BALANCED", "Balanced", "Around the usual fee"], ["PREMIUM", "Most experienced", "Fee matters less"]].map(([value, title, text]) => (
                      <Choice key={value} title={title} text={text} selected={prefs.price === value} onSelect={() => setPrefs({ ...prefs, price: value })} className="p-3" />
                    ))}
                  </div>
                </div>
                <div>
                  <Eyebrow className="mb-2">How would you like to talk?</Eyebrow>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Choice icon={Sparkles} title="Either" text="Whichever is free first" selected={prefs.mode === "ANY"} onSelect={() => setPrefs({ ...prefs, mode: "ANY" })} className="p-3" />
                    <Choice icon={Video} title="Video call" text="See the doctor" selected={prefs.mode === "VIDEO"} onSelect={() => setPrefs({ ...prefs, mode: "VIDEO" })} className="p-3" />
                    <Choice icon={Phone} title="Phone call" text="Voice only" selected={prefs.mode === "AUDIO"} onSelect={() => setPrefs({ ...prefs, mode: "AUDIO" })} className="p-3" />
                  </div>
                </div>
                <div>
                  <Eyebrow className="mb-2">When?</Eyebrow>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Choice icon={Clock} title="Any time this week" text="More doctors to choose from" selected={prefs.when === "ANY"} onSelect={() => setPrefs({ ...prefs, when: "ANY" })} className="p-3" />
                    <Choice icon={CalendarCheck} title="Today" text="Only doctors free today" selected={prefs.when === "TODAY"} onSelect={() => setPrefs({ ...prefs, when: "TODAY" })} className="p-3" />
                  </div>
                </div>
              </div>
            </SectionCard>
            <div className="mt-4 flex items-center justify-between">{back(3)}<Button size="lg" className={cta} onClick={findDoctors}>Show my doctors <ArrowRight data-icon="inline-end" /></Button></div>
          </>
        ) : null}

        {step === 5 ? (
          <>
            {match.isPending ? (
              <div className="grid gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 rounded-xl" />)}</div>
            ) : !match.data || match.data.items.length === 0 ? (
              <EmptyState bordered size="lg" illustration="calendar" title="No doctor has a free slot for this right now"
                description={prefs.when === "TODAY" ? "Nobody is free today. Try any time this week." : "Please try again a little later, or change what you asked for."}
                action={<Button className={cta} onClick={() => { if (prefs.when === "TODAY") setPrefs({ ...prefs, when: "ANY" }); setStep(4); }}>Change preferences</Button>} />
            ) : (
              <div className="grid gap-3">
                {match.data.fitRelaxed ? <Callout tone="info" compact>No {match.data.specialization?.name.toLowerCase()} specialist is free this week, so these are the closest doctors available.</Callout> : null}
                {match.data.priceGuardRelaxed ? <Callout tone="info" compact>These are above the usual fee of {formatMoney(match.data.typicalFee ?? 0)}; nobody at a lower fee is free right now.</Callout> : null}
                {match.data.items.map((doctor) => <DoctorCard key={doctor.id} doctor={doctor} onBook={(slot) => choose(doctor, slot)} />)}
                <p className="text-center text-xs text-muted-foreground">
                  Chosen from {match.data.considered} available {match.data.considered === 1 ? "doctor" : "doctors"}{match.data.typicalFee ? `. The usual fee for this is ${formatMoney(match.data.typicalFee)}` : ""}.
                </p>
              </div>
            )}
            <div className="mt-4">{back(4)}</div>
          </>
        ) : null}

        {step === 6 && chosen ? (
          <BookStep key={chosen.id} doctor={chosen} first={offered} mode={mode} onMode={setMode} pending={book.isPending} onBack={() => setStep(5)}
            onBook={(usedTime) => { timeRef.current = usedTime; if (!book.isPending) book.mutate(); }}
            summary={[
              { label: "Patient", value: `${person.name}, ${person.age}` },
              { label: "For", value: specializationName || "General consultation" },
              { label: "Doctor", value: chosen.displayName },
              ...(files.length ? [{ label: "Files for the doctor", value: String(files.length) }] : []),
            ]}
          />
        ) : null}
      </Reveal>
    </div>
  );
}
