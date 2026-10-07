"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, CircleAlert, CircleCheckBig, ClipboardList, Clock, CreditCard, Phone, Star, Stethoscope, Video } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { PageHeader, StatusBadge, Thumb } from "@/components/admin/parts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { APPOINTMENT_LABEL, APPOINTMENT_TONE, MODE_LABEL, type MyAppointment } from "@/lib/care";
import { formatDateTime, formatMoney, formatMoneyExact } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ButtonSpinner, Spinner } from "@/components/custom/loaders";
import { FileChips } from "@/components/custom/file-chips";

const RATING_WORD = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

function ConsultationCard({ a, onCancel, onRate, onPay, paying }: { a: MyAppointment; onCancel: () => void; onRate: () => void; onPay: () => void; paying: boolean }) {
  const live = a.status === "CONFIRMED" || a.status === "IN_PROGRESS";
  // eslint-disable-next-line react-hooks/purity -- the join button depends on the time; the list is refetched every minute
  const minutesAway = Math.round((new Date(a.scheduledAt).getTime() - Date.now()) / 60_000);
  const canJoin = live && a.meetingUrl && minutesAway <= 10;
  const status = a.status === "PENDING_PAYMENT" && !a.canPay ? "Not paid in time" : a.status === "NO_SHOW" ? "You did not join" : APPOINTMENT_LABEL[a.status];

  return (
    <Card>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap items-start gap-4">
          <Thumb src={a.doctor.photoUrl} name={a.doctor.displayName.replace(/^dr\.?\s*/i, "")} className="size-14 rounded-full" />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 font-medium">{a.doctor.displayName} <StatusBadge status={APPOINTMENT_TONE[a.status]} label={status} /></p>
            <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
              {a.mode === "VIDEO" ? <Video className="size-4" /> : <Phone className="size-4" />}
              {formatDateTime(a.scheduledAt)} · {MODE_LABEL[a.mode]} · {a.durationMinutes} minutes
            </p>
            <p className="mt-1 text-sm">For {a.patientName} · {formatMoney(a.fee)} · <span className="text-muted-foreground">{a.appointmentNumber}</span></p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {live && a.meetingUrl ? (
              canJoin ? <Button asChild><a href={a.meetingUrl} target="_blank" rel="noreferrer"><Video /> Join the call</a></Button> : <Button disabled title="Opens 10 minutes before your slot"><Video /> Join the call</Button>
            ) : null}
            {a.canPay ? <Button disabled={paying} onClick={onPay}>{paying ? <Spinner size="sm" /> : <CreditCard />} Pay {formatMoney(a.fee)}</Button> : null}
            {a.prescription ? <Button asChild variant="outline"><Link href={`/patient/prescriptions#rx-${a.prescription.id}`}><ClipboardList /> Prescription</Link></Button> : null}
            {a.canRate ? <Button variant="outline" onClick={onRate}><Star /> Rate the doctor</Button> : null}
            {["COMPLETED", "CANCELLED", "NO_SHOW"].includes(a.status) ? <Button asChild variant="ghost"><Link href={`/patient/doctors/${a.doctor.slug}`}>Book again</Link></Button> : null}
            {a.canCancel ? <Button variant="ghost" onClick={onCancel}>Cancel</Button> : null}
          </div>
        </div>
        {a.symptoms ? <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm whitespace-pre-line text-muted-foreground"><span className="font-medium text-foreground">You wrote:</span> {a.symptoms}</p> : null}
        {a.files?.length ? <FileChips files={a.files} hrefOf={(file) => `/api/me/consultation-files/${file.id}`} /> : null}
        {live && !canJoin ? <p className="text-xs text-muted-foreground">{a.meetingUrl ? "The Join button opens 10 minutes before your slot." : "The doctor will call you on your mobile number at this time."}{a.canCancel ? " You can cancel up to 2 hours before." : ""}</p> : null}
        {a.status === "CANCELLED" ? (
          <p className="text-sm text-muted-foreground">
            {a.cancelledBy === "DOCTOR" ? "The doctor could not take this consultation." : a.cancelledBy === "PATIENT" ? "You cancelled this consultation." : a.cancelReason ?? "This consultation was cancelled."}{" "}
            {a.paid ? (a.refunded > 0 ? `${formatMoneyExact(a.refunded)} has been refunded to you.` : "Your payment is being refunded. Banks usually show it within 5 to 7 working days.") : ""}
          </p>
        ) : null}
        {a.review ? <p className="flex items-center gap-1 text-sm text-muted-foreground">You rated this {Array.from({ length: 5 }, (_, i) => <Star key={i} className={cn("size-3.5", i < a.review!.rating ? "fill-warning text-warning" : "text-muted-foreground/40")} />)}</p> : null}
      </CardContent>
    </Card>
  );
}

function ConsultationsView() {
  const router = useRouter();
  const search = useSearchParams();
  const payment = search.get("payment"); // set when coming back from the pay page
  const booked = search.get("booked") === "1";
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [cancelling, setCancelling] = useState<MyAppointment | null>(null);
  const [rating, setRating] = useState<MyAppointment | null>(null);
  const [asked, setAsked] = useState(false); // the "?rate=" link from the overview opens the rating once
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");

  const { data, isPending, isError } = useQuery({ queryKey: ["my-appointments"], queryFn: () => api<{ items: MyAppointment[] }>("/me/appointments"), refetchInterval: 60_000 });
  const items = data?.items ?? [];
  const refresh = () => ["my-appointments", "patient-overview"].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));

  const rateId = Number(search.get("rate"));
  if (!asked && rateId && items.length) {
    setAsked(true);
    const target = items.find((a) => a.id === rateId && a.canRate);
    if (target) { setTab("past"); setRating(target); }
  }

  const cancel = useMutation({
    mutationFn: (a: MyAppointment) => api<{ refundDue: boolean }>(`/me/appointments/${a.id}/cancel`, { method: "POST" }),
    onSuccess: (result) => { toast.success(result.refundDue ? "Cancelled. Your payment will be refunded." : "Cancelled"); setCancelling(null); refresh(); },
    onError: (err) => toast.error(err.message),
  });
  const pay = useMutation({
    mutationFn: (a: MyAppointment) => api<{ payUrl: string | null }>(`/me/appointments/${a.id}/pay`, { method: "POST" }),
    onSuccess: ({ payUrl }) => { if (payUrl) return window.location.assign(payUrl); toast.success("Paid. Your consultation is booked."); refresh(); },
    onError: (err) => { toast.error(err.message); refresh(); },
  });
  const review = useMutation({
    mutationFn: () => api(`/me/appointments/${rating!.id}/review`, { method: "POST", body: { rating: stars, comment } }),
    onSuccess: () => { toast.success("Thank you for your rating"); setRating(null); setStars(0); setComment(""); refresh(); if (rateId) router.replace("/patient/consultations"); },
    onError: (err) => toast.error(err.message),
  });

  const isUpcoming = (a: MyAppointment) => ["CONFIRMED", "IN_PROGRESS"].includes(a.status) || a.canPay;
  const upcoming = items.filter(isUpcoming).reverse(); // soonest first
  const past = items.filter((a) => !isUpcoming(a));
  const shown = tab === "upcoming" ? upcoming : past;

  return (
    <>
      <PageHeader title="Consultations" description="Join your call, see what the doctor prescribed, or book again">
        <Button asChild className="h-9"><Link href="/patient/book"><CalendarPlus /> Book a consultation</Link></Button>
      </PageHeader>

      {booked || payment === "success" ? (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-success/40 bg-success/10 px-4 py-3">
          <CircleCheckBig className="size-7 shrink-0 text-success" />
          <div><p className="font-semibold">Your consultation is booked</p><p className="text-sm text-muted-foreground">You will get a reminder shortly before it starts. Join the call from this page.</p></div>
        </div>
      ) : payment === "pending" ? (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3">
          <Clock className="size-7 shrink-0 text-warning" />
          <div><p className="font-semibold">Your payment is still being confirmed</p><p className="text-sm text-muted-foreground">This can take a few minutes. Reload this page shortly. Do not pay again unless it fails.</p></div>
        </div>
      ) : payment === "failed" ? (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3">
          <CircleAlert className="size-7 shrink-0 text-destructive" />
          <div><p className="font-semibold">The payment did not go through</p><p className="text-sm text-muted-foreground">No money was taken. The slot is held for 15 minutes: use Pay below to try again.</p></div>
        </div>
      ) : null}

      <div className="mb-4 flex gap-1.5">
        {([["upcoming", "Upcoming", upcoming.length], ["past", "Past", past.length]] as const).map(([value, label, count]) => (
          <button
            key={value} type="button" onClick={() => setTab(value)}
            className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors", tab === value ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-surface-2")}
          >
            {label}<span className={cn("text-xs ledger", tab === value ? "opacity-80" : "text-muted-foreground")}>{count}</span>
          </button>
        ))}
      </div>

      {isError ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Your consultations could not be loaded. Please try again in a moment.</p>
      ) : isPending ? (
        <div className="grid gap-3">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-14 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground"><Stethoscope className="size-5" /></span>
          <p className="font-medium">{tab === "upcoming" ? "Nothing booked" : "No past consultations"}</p>
          <p className="max-w-sm text-sm text-muted-foreground">{tab === "upcoming" ? "Book a video or phone consultation with one of our doctors. It will show up here with the button to join." : "Consultations you have finished or cancelled are kept here."}</p>
          {tab === "upcoming" ? <Button asChild className="mt-2"><Link href="/patient/book"><CalendarPlus /> Book a consultation</Link></Button> : null}
        </div>
      ) : (
        <div className="grid gap-3">
          {shown.map((a) => (
            <ConsultationCard key={a.id} a={a} onCancel={() => setCancelling(a)} onRate={() => { setStars(0); setComment(""); setRating(a); }} onPay={() => pay.mutate(a)} paying={pay.isPending && pay.variables?.id === a.id} />
          ))}
        </div>
      )}

      <Dialog open={cancelling !== null} onOpenChange={(open) => !open && setCancelling(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this consultation?</DialogTitle>
            <DialogDescription>
              {cancelling ? `${cancelling.doctor.displayName} on ${formatDateTime(cancelling.scheduledAt)}.` : ""}{" "}
              {cancelling?.status === "CONFIRMED" ? `The ${formatMoney(cancelling.fee)} you paid will be refunded to the way you paid.` : "Nothing has been paid for it yet."} The slot becomes free for other patients.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelling(null)}>Keep it</Button>
            <Button variant="destructive" disabled={cancel.isPending} onClick={() => cancelling && cancel.mutate(cancelling)}>{cancel.isPending ? <ButtonSpinner /> : null}Cancel consultation</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rating !== null} onOpenChange={(open) => !open && setRating(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>How was your consultation?</DialogTitle>
            <DialogDescription>{rating ? `With ${rating.doctor.displayName} on ${formatDateTime(rating.scheduledAt)}. Other patients see your rating.` : ""}</DialogDescription>
          </DialogHeader>
          <form id="rate-form" className="grid gap-4" onSubmit={(e) => { e.preventDefault(); if (stars && !review.isPending) review.mutate(); }}>
            <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Your rating">
              {[1, 2, 3, 4, 5].map((value) => (
                <button key={value} type="button" role="radio" aria-checked={stars === value} aria-label={`${value} ${value === 1 ? "star" : "stars"}: ${RATING_WORD[value]}`} onClick={() => setStars(value)} className="rounded-md p-1 hover:bg-surface-2">
                  <Star className={cn("size-8", value <= stars ? "fill-warning text-warning" : "text-muted-foreground/40")} />
                </button>
              ))}
              <span className="ml-2 text-sm font-medium">{RATING_WORD[stars]}</span>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rate-comment">Anything to add? <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Textarea id="rate-comment" rows={3} maxLength={1000} placeholder="What went well, or what could be better" value={comment} onChange={(e) => setComment(e.target.value)} />
            </div>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRating(null)}>Not now</Button>
            <Button type="submit" form="rate-form" loading={review.isPending} disabled={!stars}>Send rating</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function ConsultationsPage() {
  return (
    <Suspense>
      <ConsultationsView />
    </Suspense>
  );
}
