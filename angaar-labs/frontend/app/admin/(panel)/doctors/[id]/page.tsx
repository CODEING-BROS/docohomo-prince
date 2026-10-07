"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { DoctorOnboardingCard, useDoctorOnboarding } from "@/components/admin/doctor-onboarding";
import { StatusBadge, Thumb } from "@/components/admin/parts";
import { WorkingHours } from "@/components/admin/working-hours";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { DOCUMENT_LABEL, type DoctorDetail } from "@/lib/doctor";
import { formatDate, formatMoney, humanize } from "@/lib/format";
import { todayInZone } from "@/lib/timezone";
import { uploadDocument } from "@/lib/upload";
import { cn } from "@/lib/utils";
import { ButtonSpinner, Spinner } from "@/components/custom/loaders";

type Decision = "APPROVED" | "REJECTED" | "SUSPENDED" | "UNDER_REVIEW";

/** Whole years between two yyyy-MM-dd days. */
const ageOn = (born: string, today: string) => Number(today.slice(0, 4)) - Number(born.slice(0, 4)) - (today.slice(5) < born.slice(5) ? 1 : 0);

export default function DoctorPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState<"REJECTED" | "SUSPENDED" | null>(null);
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState<number | null>(null); // document being rejected
  const [remarks, setRemarks] = useState("");
  const [timeOff, setTimeOff] = useState({ from: "", to: "", reason: "" });

  const { data: doctor, isPending, isError } = useQuery({ queryKey: ["doctor", Number(id)], queryFn: () => api<DoctorDetail>(`/admin/doctors/${id}`) });
  // gender and date of birth come from the doctor's own registration, with the onboarding steps
  const { data: onboarding } = useDoctorOnboarding(Number(id));
  const refresh = () => ["doctor", "doctor-onboarding", "doctors", "b2b", "dashboard", "notifications", "doctor-slots"].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
  const done = (message: string) => () => { toast.success(message); refresh(); };
  const failed = (err: Error) => toast.error(err.message);

  const review = useMutation({
    mutationFn: (input: { decision: Decision; reason?: string }) => api(`/admin/doctors/${id}/verification`, { method: "PATCH", body: input }),
    onSuccess: () => { toast.success("Verification updated"); setAsking(null); setReason(""); refresh(); },
    onError: failed,
  });
  const flip = useMutation({
    mutationFn: (changes: { consulting?: boolean; wholesale?: boolean }) => api(`/admin/doctors/${id}/switches`, { method: "PATCH", body: changes }),
    onSuccess: done("Saved"), onError: failed,
  });
  const reviewDocument = useMutation({
    mutationFn: (input: { documentId: number; status: "APPROVED" | "REJECTED"; remarks?: string }) =>
      api(`/admin/doctors/${id}/documents/${input.documentId}`, { method: "PATCH", body: { status: input.status, remarks: input.remarks } }),
    onSuccess: () => { toast.success("Document updated"); setRejecting(null); setRemarks(""); refresh(); },
    onError: failed,
  });
  const addDocument = useMutation({
    mutationFn: async (input: { type: string; file: File }) => {
      const fileUrl = await uploadDocument(input.file);
      return api(`/admin/doctors/${id}/documents`, { method: "POST", body: { type: input.type, fileUrl, fileName: input.file.name } });
    },
    onSuccess: done("Document added"), onError: failed,
  });
  const addTimeOff = useMutation({
    mutationFn: () => api(`/admin/doctors/${id}/time-off`, { method: "POST", body: timeOff }),
    onSuccess: () => { toast.success("Time off added"); setTimeOff({ from: "", to: "", reason: "" }); refresh(); },
    onError: failed,
  });
  const removeTimeOff = useMutation({
    mutationFn: (timeOffId: number) => api(`/admin/doctors/${id}/time-off/${timeOffId}`, { method: "DELETE" }),
    onSuccess: done("Time off removed"), onError: failed,
  });

  if (isError) return <p className="py-16 text-center text-sm text-muted-foreground">This doctor could not be found.</p>;
  if (isPending || !doctor) return <div className="grid gap-4"><Skeleton className="h-16" /><Skeleton className="h-64" /><Skeleton className="h-64" /></div>;

  const verified = doctor.verificationStatus === "APPROVED";
  const wholesaleOn = doctor.wholesale?.status === "APPROVED";
  const [newDocType, pendingDocs] = ["REGISTRATION_CERTIFICATE", doctor.documents.filter((d) => d.status === "PENDING").length];

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Back to doctors"><Link href="/admin/doctors"><ArrowLeft /></Link></Button>
        <Thumb src={doctor.photoUrl} name={doctor.displayName.replace(/^dr\.?\s*/i, "")} className="size-12 rounded-full" />
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight">{doctor.displayName} <StatusBadge status={doctor.verificationStatus} /></h1>
          <p className="truncate text-sm text-muted-foreground">{[doctor.stream, doctor.qualification, doctor.specialization, doctor.phone].filter(Boolean).join(" · ") || "No details yet"}</p>
        </div>
        <Button asChild variant="outline" className="h-9"><Link href={`/admin/doctors/${doctor.id}/edit`}><Pencil /> Edit details</Link></Button>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-3">
        <div className="grid min-w-0 gap-4 xl:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Verification</CardTitle>
              <CardDescription>
                {verified ? `Verified${doctor.verifiedAt ? ` on ${formatDate(doctor.verifiedAt)}` : ""}.`
                  : doctor.verificationStatus === "REJECTED" || doctor.verificationStatus === "SUSPENDED" ? `${humanize(doctor.verificationStatus)}${doctor.rejectionReason ? `: ${doctor.rejectionReason}` : "."}`
                  : `Check the registration number against the certificate, then verify.${pendingDocs ? ` ${pendingDocs} document${pendingDocs === 1 ? "" : "s"} to look at.` : ""}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <dl className="grid gap-3 text-sm sm:grid-cols-3">
                <div><dt className="text-xs text-muted-foreground">Registration number</dt><dd className="mt-0.5 font-medium">{doctor.registrationNumber ?? "Not provided"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Registered with</dt><dd className="mt-0.5">{doctor.registrationCouncil ?? "—"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Year</dt><dd className="mt-0.5">{doctor.registrationYear ?? "—"}</dd></div>
                <div className="sm:col-span-3"><dt className="text-xs text-muted-foreground">Clinic</dt><dd className="mt-0.5">{[doctor.clinicName, doctor.clinicAddress, doctor.clinicCity, doctor.clinicState, doctor.clinicPincode].filter(Boolean).join(", ") || "—"}</dd></div>
              </dl>
              <div className="flex flex-wrap gap-2">
                {!verified ? <Button className="h-9" disabled={review.isPending} onClick={() => review.mutate({ decision: "APPROVED" })}><Check /> Verify doctor</Button> : null}
                {doctor.verificationStatus === "PENDING" ? <Button variant="outline" className="h-9" disabled={review.isPending} onClick={() => review.mutate({ decision: "UNDER_REVIEW" })}>Mark as under review</Button> : null}
                {verified ? <Button variant="outline" className="h-9" onClick={() => setAsking("SUSPENDED")}>Suspend…</Button>
                  : doctor.verificationStatus !== "REJECTED" ? <Button variant="outline" className="h-9" onClick={() => setAsking("REJECTED")}>Reject…</Button> : null}
              </div>
            </CardContent>
          </Card>

          <DoctorOnboardingCard doctorId={doctor.id} doctorName={doctor.displayName} />

          <Card>
            <CardHeader><CardTitle>Documents</CardTitle><CardDescription>Only staff can open these files.</CardDescription></CardHeader>
            <CardContent className="grid gap-2">
              {doctor.documents.length === 0 ? <p className="text-sm text-muted-foreground">No documents uploaded yet.</p> : null}
              {doctor.documents.map((doc) => (
                <div key={doc.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><FileText className="size-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{DOCUMENT_LABEL[doc.type] ?? humanize(doc.type)}</p>
                    <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="block truncate text-xs text-primary hover:underline">{doc.fileName ?? "Open file"}</a>
                    {doc.remarks ? <p className="text-xs text-destructive">{doc.remarks}</p> : null}
                  </div>
                  <StatusBadge status={doc.status} label={doc.status === "APPROVED" ? "Accepted" : doc.status === "REJECTED" ? "Not accepted" : "To check"} />
                  {doc.status !== "APPROVED" ? <Button size="sm" variant="outline" disabled={reviewDocument.isPending} onClick={() => reviewDocument.mutate({ documentId: doc.id, status: "APPROVED" })}><Check /> Accept</Button> : null}
                  {doc.status !== "REJECTED" ? <Button size="sm" variant="ghost" onClick={() => { setRejecting(doc.id); setRemarks(""); }}>Not acceptable…</Button> : null}
                </div>
              ))}
              <label className="mt-1 flex w-fit cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-surface-2">
                {addDocument.isPending ? <Spinner size="md" /> : <Plus className="size-4" />} Add a document
                <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" disabled={addDocument.isPending}
                  onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) addDocument.mutate({ type: doctor.documents.some((d) => d.type === newDocType) ? "OTHER" : newDocType, file }); }} />
              </label>
            </CardContent>
          </Card>

          <WorkingHours
            key={`${doctor.id}-${doctor.availability.map((a) => a.id).join("-")}-${doctor.slotMinutes}`}
            base={`/admin/doctors/${doctor.id}`} saved={doctor.availability} slotMinutes={doctor.slotMinutes} onSaved={refresh}
          />

          <Card>
            <CardHeader><CardTitle>Time off</CardTitle><CardDescription>Whole days when the doctor cannot be booked.</CardDescription></CardHeader>
            <CardContent className="grid gap-3">
              {doctor.timeOff.map((off) => (
                <div key={off.id} className="flex items-center gap-3 rounded-lg border p-2.5 text-sm">
                  <span className="flex-1">{formatDate(off.startsAt)} – {formatDate(off.endsAt)}{off.reason ? <span className="text-muted-foreground"> · {off.reason}</span> : null}</span>
                  <Button variant="ghost" size="icon-sm" aria-label="Remove this time off" disabled={removeTimeOff.isPending} onClick={() => removeTimeOff.mutate(off.id)}><Trash2 /></Button>
                </div>
              ))}
              <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); addTimeOff.mutate(); }}>
                <div className="grid gap-1.5"><Label htmlFor="off-from">From</Label><Input id="off-from" required type="date" className="h-9 w-40" min={todayInZone()} value={timeOff.from} onChange={(e) => setTimeOff({ ...timeOff, from: e.target.value, to: timeOff.to || e.target.value })} /></div>
                <div className="grid gap-1.5"><Label htmlFor="off-to">Until</Label><Input id="off-to" required type="date" className="h-9 w-40" min={timeOff.from || todayInZone()} value={timeOff.to} onChange={(e) => setTimeOff({ ...timeOff, to: e.target.value })} /></div>
                <div className="grid min-w-40 flex-1 gap-1.5"><Label htmlFor="off-reason">Reason <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="off-reason" className="h-9" value={timeOff.reason} onChange={(e) => setTimeOff({ ...timeOff, reason: e.target.value })} /></div>
                <Button type="submit" variant="outline" className="h-9" disabled={addTimeOff.isPending}>Add time off</Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="grid min-w-0 gap-4">
          <Card>
            <CardHeader><CardTitle>What this doctor can do</CardTitle><CardDescription>{verified ? "Switch on one or both." : "Verify the doctor first to switch these on."}</CardDescription></CardHeader>
            <CardContent className="grid gap-4">
              <label className={cn("flex items-start gap-2.5 text-sm", !verified && "opacity-60")}>
                <Checkbox className="mt-0.5" disabled={!verified || flip.isPending} checked={doctor.consulting} onCheckedChange={(checked) => flip.mutate({ consulting: checked === true })} />
                <span>Consult patients<span className="block text-xs text-muted-foreground">{doctor.consulting ? "Listed on the store and bookable." : "Not shown to patients."}</span></span>
              </label>
              <label className={cn("flex items-start gap-2.5 text-sm", !verified && "opacity-60")}>
                <Checkbox className="mt-0.5" disabled={!verified || flip.isPending} checked={wholesaleOn} onCheckedChange={(checked) => flip.mutate({ wholesale: checked === true })} />
                <span>
                  Buy at wholesale prices
                  <span className="block text-xs text-muted-foreground">
                    {wholesaleOn ? `On the ${doctor.wholesale?.tier ?? "default"} price tier.` : doctor.wholesale?.status === "PENDING" ? "Asked for; starts when verified." : "Pays retail prices."}
                  </span>
                </span>
              </label>
              {wholesaleOn ? <Link href="/admin/b2b" className="text-sm text-primary hover:underline">Open in B2B customers</Link> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Consultations</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-xs text-muted-foreground">Video call</dt><dd className="mt-0.5 font-medium ledger">{doctor.videoFee !== null ? formatMoney(doctor.videoFee) : "Not set"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Audio call</dt><dd className="mt-0.5 font-medium ledger">{doctor.audioFee !== null ? formatMoney(doctor.audioFee) : "Not set"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Platform share</dt><dd className="mt-0.5 ledger">{doctor.commissionPercent}%</dd></div>
                <div><dt className="text-xs text-muted-foreground">Slot length</dt><dd className="mt-0.5 ledger">{doctor.slotMinutes} min</dd></div>
                <div><dt className="text-xs text-muted-foreground">Appointments so far</dt><dd className="mt-0.5 ledger">{doctor.appointmentCount}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Prescriptions</dt><dd className="mt-0.5 ledger">{doctor.prescriptionCount}</dd></div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>About</CardTitle></CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {doctor.photoUrl ? (
                <a href={doctor.photoUrl} target="_blank" rel="noreferrer" aria-label="Open the doctor's photo" className="mb-1 w-fit">
                  {/* eslint-disable-next-line @next/next/no-img-element -- uploaded photo of unknown size */}
                  <img src={doctor.photoUrl} alt={`Photo of ${doctor.displayName}`} className="size-24 rounded-lg border object-cover" />
                </a>
              ) : null}
              {doctor.stream ? <p><span className="text-muted-foreground">Stream:</span> {doctor.stream}</p> : null}
              {onboarding?.gender ? <p><span className="text-muted-foreground">Gender:</span> {humanize(onboarding.gender)}</p> : null}
              {onboarding?.dateOfBirth ? <p><span className="text-muted-foreground">Date of birth:</span> {formatDate(`${onboarding.dateOfBirth}T12:00:00+05:30`)} ({ageOn(onboarding.dateOfBirth, todayInZone())} years)</p> : null}
              <p><span className="text-muted-foreground">Experience:</span> {doctor.experienceYears !== null ? `${doctor.experienceYears} years` : "—"}</p>
              <p><span className="text-muted-foreground">Languages:</span> {doctor.languages.join(", ") || "—"}</p>
              <p><span className="text-muted-foreground">Email:</span> {doctor.email ?? "—"}</p>
              {doctor.bio ? <p className="mt-1 whitespace-pre-line text-muted-foreground">{doctor.bio.slice(0, 600)}</p> : null}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={asking !== null} onOpenChange={(open) => { if (!open) { setAsking(null); setReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{asking === "SUSPENDED" ? "Suspend" : "Reject"} {doctor.displayName}?</DialogTitle>
            <DialogDescription>{asking === "SUSPENDED" ? "Consultations and wholesale buying both stop until the doctor is verified again." : "The doctor is told why, so they can fix it and apply again."}</DialogDescription>
          </DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" rows={3} autoFocus />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAsking(null)}>Cancel</Button>
            <Button variant="destructive" disabled={!reason.trim() || review.isPending} onClick={() => asking && review.mutate({ decision: asking, reason: reason.trim() })}>
              {review.isPending ? <ButtonSpinner /> : null}{asking === "SUSPENDED" ? "Suspend" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejecting !== null} onOpenChange={(open) => !open && setRejecting(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>What is wrong with this document?</DialogTitle><DialogDescription>The doctor sees this and can upload a better copy.</DialogDescription></DialogHeader>
          <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="For example: the photo is blurred, or the name does not match" rows={3} autoFocus />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button variant="destructive" disabled={!remarks.trim() || reviewDocument.isPending} onClick={() => rejecting && reviewDocument.mutate({ documentId: rejecting, status: "REJECTED", remarks: remarks.trim() })}>Mark as not acceptable</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
