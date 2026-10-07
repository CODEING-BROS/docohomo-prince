"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarCheck, Phone, Star, Video } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Thumb } from "@/components/admin/parts";
import { AssignedTime, useAssignedTime } from "@/components/patient/assigned-time";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";
import type { PublicDoctor } from "@/lib/care";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/custom/loaders";

type Mode = "VIDEO" | "AUDIO";
type Doctor = PublicDoctor & { ratingAverage?: number; ratingCount?: number };

const indiaToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const ageFrom = (dateOfBirth: string | null) => {
  if (!dateOfBirth) return "";
  const today = indiaToday();
  const years = Number(today.slice(0, 4)) - Number(dateOfBirth.slice(0, 4)) - (today.slice(5) < dateOfBirth.slice(5) ? 1 : 0);
  return years >= 0 ? String(years) : "";
};

export default function BookDoctorPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { user } = useSession();
  const time = useAssignedTime(slug); // the system gives the doctor's earliest free slot; the patient can ask for the next
  const startsAt = time.slot?.startsAt ?? "";
  const [mode, setMode] = useState<Mode>("VIDEO");
  const [forMe, setForMe] = useState(true);
  const [other, setOther] = useState({ patientName: "", patientAge: "", patientGender: "" });
  const [mine, setMine] = useState<{ patientName?: string; patientAge?: string; patientGender?: string }>({});
  const [symptoms, setSymptoms] = useState("");

  // "for me" starts from what the account already knows; anything missing is asked for
  const me = {
    patientName: mine.patientName ?? [user?.firstName, user?.lastName].filter(Boolean).join(" "),
    patientAge: mine.patientAge ?? ageFrom(user?.dateOfBirth ?? null),
    patientGender: mine.patientGender ?? user?.gender ?? "",
  };
  const patient = forMe ? me : other;
  const setPatient = (field: "patientName" | "patientAge" | "patientGender", value: string) => (forMe ? setMine({ ...mine, [field]: value }) : setOther({ ...other, [field]: value }));

  const { data: doctor, isPending, isError } = useQuery({ queryKey: ["care-doctor", slug], queryFn: () => api<Doctor>(`/care/doctors/${slug}`) });

  const modes = doctor ? ([["VIDEO", doctor.videoFee], ["AUDIO", doctor.audioFee]] as [Mode, number | null][]).filter(([, fee]) => fee !== null) : [];
  const chosenMode = modes.some(([m]) => m === mode) ? mode : modes[0]?.[0];
  const fee = modes.find(([m]) => m === chosenMode)?.[1] ?? 0;

  const book = useMutation({
    mutationFn: async () => {
      const booked = await api<{ id: number }>("/me/appointments", {
        method: "POST",
        body: { doctorId: doctor!.id, startsAt, mode: chosenMode, patientName: patient.patientName, patientAge: Number(patient.patientAge), patientGender: patient.patientGender, symptoms },
      });
      return api<{ payUrl: string | null }>(`/me/appointments/${booked.id}/pay`, { method: "POST" });
    },
    onSuccess: ({ payUrl }) => {
      if (payUrl) return window.location.assign(payUrl); // on to the pay page; it sends the patient back afterwards
      router.push("/patient/consultations?booked=1");
    },
    onError: (err) => {
      toast.error(err.message);
      time.reload(); // most often the slot was taken meanwhile
    },
  });

  if (isError) {
    return (
      <div className="py-16 text-center">
        <p className="font-medium">This doctor is not taking consultations right now</p>
        <Button asChild variant="outline" className="mt-3"><Link href="/patient/book">Find another doctor</Link></Button>
      </div>
    );
  }
  if (isPending || !doctor) return <><Skeleton className="h-40 rounded-xl" /><Skeleton className="mt-4 h-72 rounded-xl" /></>;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!startsAt) return toast.error("This doctor has no free time in the next two weeks");
    if (!patient.patientGender) return toast.error("Choose the patient's gender");
    if (!book.isPending) book.mutate();
  };

  return (
    <>
      <Link href="/patient/consultations" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> My consultations</Link>

      <Card className="mb-4">
        <CardContent className="flex flex-wrap gap-4">
          <Thumb src={doctor.photoUrl} name={doctor.displayName.replace(/^dr\.?\s*/i, "")} className="size-24 rounded-full" />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight">{doctor.displayName}</h1>
            <p className="text-sm text-muted-foreground">{[doctor.qualification, doctor.experienceYears !== null ? `${doctor.experienceYears} years of experience` : null, doctor.clinicCity].filter(Boolean).join(" · ")}</p>
            {doctor.ratingCount ? <p className="mt-1 flex items-center gap-1 text-sm"><Star className="size-4 fill-warning text-warning" /> <span className="font-medium">{doctor.ratingAverage?.toFixed(1)}</span><span className="text-muted-foreground">from {doctor.ratingCount} {doctor.ratingCount === 1 ? "patient" : "patients"}</span></p> : null}
            {doctor.specialization ? <p className="mt-2 text-sm">{doctor.specialization}</p> : null}
            {doctor.languages.length ? <p className="mt-1 text-sm text-muted-foreground">Speaks {doctor.languages.join(", ")}</p> : null}
            {doctor.bio ? <p className="mt-2 line-clamp-4 text-sm whitespace-pre-line text-muted-foreground">{doctor.bio}</p> : null}
          </div>
        </CardContent>
      </Card>

      <form onSubmit={submit} className="grid items-start gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader><CardTitle>1. Your time</CardTitle><CardDescription>Each consultation lasts {doctor.slotMinutes} minutes.</CardDescription></CardHeader>
          <CardContent className="grid gap-4">
            <AssignedTime time={time} />
            <div className="grid gap-2 sm:grid-cols-2">
              {modes.map(([m, modeFee]) => (
                <button key={m} type="button" aria-pressed={m === chosenMode} onClick={() => setMode(m)}
                  className={cn("flex items-center gap-3 rounded-lg border p-3 text-left", m === chosenMode ? "border-primary bg-primary/5" : "hover:bg-surface-2")}>
                  {m === "VIDEO" ? <Video className="size-5 text-primary" /> : <Phone className="size-5 text-primary" />}
                  <span className="flex-1 text-sm font-medium">{m === "VIDEO" ? "Video call" : "Audio call"}</span>
                  <span className="text-sm font-semibold ledger">{formatMoney(modeFee!)}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>2. Who is the consultation for?</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid grid-cols-2 gap-2">
              {([[true, "Me"], [false, "Someone in my family"]] as const).map(([value, label]) => (
                <button key={label} type="button" aria-pressed={forMe === value} onClick={() => setForMe(value)}
                  className={cn("rounded-lg border px-3 py-2 text-sm font-medium", forMe === value ? "border-primary bg-primary/5 text-primary" : "hover:bg-surface-2")}>
                  {label}
                </button>
              ))}
            </div>
            <div className="grid gap-1.5"><Label htmlFor="p-name">Patient&apos;s name</Label><Input id="p-name" required minLength={2} value={patient.patientName} onChange={(e) => setPatient("patientName", e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5"><Label htmlFor="p-age">Age</Label><Input id="p-age" required type="number" min="0" max="120" inputMode="numeric" value={patient.patientAge} onChange={(e) => setPatient("patientAge", e.target.value)} /></div>
              <div className="grid gap-1.5">
                <Label>Gender</Label>
                <Select value={patient.patientGender} onValueChange={(v) => setPatient("patientGender", v)}>
                  <SelectTrigger className="h-9 w-full"><SelectValue placeholder="Choose" /></SelectTrigger>
                  <SelectContent><SelectItem value="FEMALE">Female</SelectItem><SelectItem value="MALE">Male</SelectItem><SelectItem value="OTHER">Other</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="p-problem">What is the problem?</Label>
              <Textarea id="p-problem" required minLength={5} rows={4} placeholder="Describe the symptoms and how long they have lasted" value={symptoms} onChange={(e) => setSymptoms(e.target.value)} />
            </div>
            <Button type="submit" className="h-10" disabled={book.isPending || !startsAt || !chosenMode}>
              {book.isPending ? <Spinner size="sm" /> : <CalendarCheck />}
              {startsAt ? `Pay ${formatMoney(fee)} and book` : "No free time"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">You can cancel up to 2 hours before the consultation and get your money back.</p>
          </CardContent>
        </Card>
      </form>
    </>
  );
}
