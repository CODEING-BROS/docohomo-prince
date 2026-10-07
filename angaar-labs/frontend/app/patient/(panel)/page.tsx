"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CalendarPlus, ClipboardList, Package, Phone, Pill, Stethoscope, Video } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Thumb } from "@/components/admin/parts";
import { GradientAvatar } from "@/components/custom/avatar";
import { Callout } from "@/components/custom/callout";
import { EmptyState } from "@/components/custom/empty-state";
import { IconTile } from "@/components/custom/icon-tile";
import { StatSkeleton } from "@/components/custom/loaders";
import { PageHero } from "@/components/custom/page-hero";
import { SectionCard } from "@/components/custom/section-card";
import { StatCard } from "@/components/custom/stat-card";
import { StatusPill } from "@/components/custom/status-pill";
import { Eyebrow } from "@/components/custom/typography";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";
import { MODE_LABEL, type PatientOverview, startsIn } from "@/lib/care";
import { formatDate, formatDateTime, formatMoneyExact, titleCase } from "@/lib/format";

const TODO_LINK: Record<PatientOverview["toDo"][number]["kind"], { href: (id: number) => string; label: string }> = {
  "pay-consultation": { href: () => "/patient/consultations", label: "Pay now" },
  "pay-order": { href: (id) => `/patient/orders/${id}`, label: "Pay now" },
  "order-medicines": { href: (id) => `/patient/checkout?prescription=${id}`, label: "Order medicines" },
  "follow-up": { href: () => "/patient/book", label: "Book a slot" },
  rate: { href: (id) => `/patient/consultations?rate=${id}`, label: "Rate" },
};

const cta = "bg-terracotta text-terracotta-foreground not-disabled:hover:bg-terracotta/90";

const greeting = () => {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
};

/** Shown once, to someone who signed in with only a mobile number: we need a name to put on bookings and parcels. */
function NameCard() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const save = useMutation({
    mutationFn: () => {
      const [firstName, ...rest] = name.trim().split(/\s+/);
      return api("/me/profile", { method: "PATCH", body: { firstName, lastName: rest.join(" ") } });
    },
    onSuccess: () => { toast.success("Thank you. Your name is saved."); queryClient.invalidateQueries({ queryKey: ["session"] }); },
    onError: (err) => toast.error(err.message),
  });
  return (
    <Callout tone="terracotta" title="Welcome to DocHomoeo. What should we call you?" className="mb-5">
      <p>Your name goes on your bookings, prescriptions and parcels.</p>
      <form className="mt-3 flex w-full gap-2 sm:w-auto" onSubmit={(e) => { e.preventDefault(); if (name.trim().length >= 2 && !save.isPending) save.mutate(); }}>
        <Input required minLength={2} maxLength={120} autoComplete="name" placeholder="Your full name" className="h-10 sm:w-64" value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" size="lg" className={cta} loading={save.isPending} disabled={name.trim().length < 2}>Save</Button>
      </form>
    </Callout>
  );
}

export default function PatientOverviewPage() {
  const { user } = useSession();
  const { data, isPending, isError, refetch } = useQuery({ queryKey: ["patient-overview"], queryFn: () => api<PatientOverview>("/me/overview"), refetchInterval: 60_000 });

  if (isError) return <EmptyState variant="error" title="Your account could not be loaded" description="Please try again in a moment." onRetry={() => refetch()} bordered />;
  if (isPending || !data) {
    return (
      <>
        <Skeleton className="h-40 rounded-xl" />
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <StatSkeleton key={i} />)}</div>
      </>
    );
  }

  const next = data.upcoming[0];
  const later = data.upcoming.slice(1);
  // the call room opens a little before the slot
  const canJoin = next && next.meetingUrl && next.startsInMinutes <= 10;

  return (
    <>
      <PageHero
        eyebrow="My health"
        title={user?.firstName ? `${greeting()}, ${user.firstName}` : greeting()}
        description="Your consultations, prescriptions and orders in one place."
        actions={
          <>
            <Button asChild variant="outline" size="lg"><Link href="/patient/shop"><Pill data-icon="inline-start" /> Order medicines</Link></Button>
            <Button asChild size="lg" className={cta}><Link href="/patient/book"><CalendarPlus data-icon="inline-start" /> Book a consultation</Link></Button>
          </>
        }
      />

      {user && !user.firstName ? <NameCard /> : null}

      <SectionCard className="mb-4" tone={next ? "default" : "dashed"}>
        {next ? (
          <div className="flex flex-wrap items-center gap-4">
            <GradientAvatar name={next.doctor.displayName} src={next.doctor.photoUrl} size="xl" ring="terracotta" />
            <div className="min-w-0 flex-1">
              <Eyebrow className="text-terracotta">Your next consultation · {next.status === "IN_PROGRESS" ? "happening now" : startsIn(next.startsInMinutes)}</Eyebrow>
              <p className="font-display mt-1 text-2xl font-medium">{next.doctor.displayName}</p>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                {next.mode === "VIDEO" ? <Video className="size-4" /> : <Phone className="size-4" />}
                {formatDateTime(next.scheduledAt)} · {MODE_LABEL[next.mode]} · {next.durationMinutes} minutes · for {next.patientName}
              </p>
            </div>
            <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
              {next.meetingUrl ? (
                canJoin
                  ? <Button asChild size="lg" className={cta}><a href={next.meetingUrl} target="_blank" rel="noreferrer"><Video data-icon="inline-start" /> Join the call</a></Button>
                  : <Button size="lg" disabled><Video data-icon="inline-start" /> Join the call</Button>
              ) : null}
              <p className="text-xs text-muted-foreground">{canJoin ? "The doctor is expecting you." : next.meetingUrl ? "The button opens 10 minutes before your slot." : "The doctor will call you on your mobile number."}</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <IconTile icon={Stethoscope} tone="panel" size="lg" />
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-medium">No consultation booked</p>
              <p className="text-sm text-muted-foreground">Talk to a verified homeopathic doctor by video or phone. You get a prescription after the call.</p>
            </div>
            <Button asChild className={cta}><Link href="/patient/book">Find a doctor <ArrowRight data-icon="inline-end" /></Link></Button>
          </div>
        )}
        {later.length ? (
          <p className="mt-4 border-t border-foreground/18 pt-3 text-sm text-muted-foreground">
            Also booked: {later.map((a) => `${a.doctor.displayName} on ${formatDateTime(a.scheduledAt)}`).join("; ")}.{" "}
            <Link href="/patient/consultations" className="font-medium text-primary underline-offset-4 hover:underline">See all</Link>
          </p>
        ) : null}
      </SectionCard>

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Video} label="Upcoming consultations" value={data.counts.upcoming} hint={next ? `Next ${startsIn(next.startsInMinutes)}` : "Nothing booked"} href="/patient/consultations" />
        <StatCard icon={ClipboardList} label="Prescriptions" value={data.counts.prescriptions} hint={data.prescriptions[0]?.issuedAt ? `Latest on ${formatDate(data.prescriptions[0].issuedAt)}` : "After your first consultation"} href="/patient/prescriptions" />
        <StatCard icon={Package} label="Orders on the way" value={data.counts.ordersOnTheWay} hint={data.counts.ordersOnTheWay ? "Follow them under My orders" : "Nothing in transit"} href="/patient/orders" />
        <StatCard icon={Stethoscope} label="Consultations done" value={data.counts.consultationsDone} hint="With DocHomoeo doctors" />
      </div>

      {data.toDo.length ? (
        <SectionCard className="mb-4" title="Needs your attention" eyebrow="To do">
          <ul className="divide-y divide-foreground/10">
            {data.toDo.map((item) => (
              <li key={`${item.kind}-${item.id}`} className="flex flex-wrap items-center gap-3 py-3 text-sm first:pt-0 last:pb-0">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{item.title}</span>
                  <span className="block text-muted-foreground">{item.detail}</span>
                </span>
                <Button asChild size="sm" variant={item.kind.startsWith("pay") ? "default" : "outline"} className={item.kind.startsWith("pay") ? cta : undefined}>
                  <Link href={TODO_LINK[item.kind].href(item.id)}>{TODO_LINK[item.kind].label}{item.amount ? ` ${formatMoneyExact(item.amount)}` : ""}</Link>
                </Button>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <SectionCard title="Recent prescriptions" action={<Button asChild variant="ghost" size="sm"><Link href="/patient/prescriptions">See all <ArrowRight data-icon="inline-end" /></Link></Button>}>
          {data.prescriptions.length === 0 ? (
            <EmptyState size="sm" illustration="prescriptions" title="No prescriptions yet" description="After a consultation, the doctor's prescription appears here and you can order the medicines in one step." />
          ) : (
            <ul className="divide-y divide-foreground/10">
              {data.prescriptions.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 py-3 text-sm first:pt-0 last:pb-0">
                  <IconTile icon={ClipboardList} tone="panel" />
                  <span className="min-w-0 flex-1">
                    <Link href={`/patient/prescriptions#rx-${p.id}`} className="block font-medium hover:text-primary">{p.diagnosis ?? p.prescriptionNumber}</Link>
                    <span className="block text-muted-foreground">{p.doctor.displayName} · for {p.patientName}{p.issuedAt ? ` · ${formatDate(p.issuedAt)}` : ""}</span>
                  </span>
                  {p.ordered ? <StatusPill status="DELIVERED" label="Ordered" />
                    : p.available > 0 ? <Button asChild size="sm" variant="outline"><Link href={`/patient/checkout?prescription=${p.id}`}>Order medicines</Link></Button>
                    : null}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Recent orders" action={<Button asChild variant="ghost" size="sm"><Link href="/patient/orders">See all <ArrowRight data-icon="inline-end" /></Link></Button>}>
          {data.orders.length === 0 ? (
            <EmptyState size="sm" illustration="orders" title="No orders yet" description="Medicines you order are listed here with their delivery status." action={<Button asChild size="sm" variant="outline"><Link href="/patient/shop">Order medicines</Link></Button>} />
          ) : (
            <ul className="divide-y divide-foreground/10">
              {data.orders.map((o) => (
                <li key={o.id} className="flex items-center gap-3 py-3 text-sm first:pt-0 last:pb-0">
                  <Thumb src={o.firstItem?.imageUrl ?? null} name={o.firstItem?.productName ?? "Order"} className="size-10" />
                  <span className="min-w-0 flex-1">
                    <Link href={`/patient/orders/${o.id}`} className="block truncate font-medium hover:text-primary">
                      {o.firstItem ? titleCase(o.firstItem.productName) : o.orderNumber}{o.itemCount > 1 ? ` and ${o.itemCount - 1} more` : ""}
                    </Link>
                    <span className="ledger block text-muted-foreground">
                      {o.orderNumber} · {formatMoneyExact(o.grandTotal)}
                      {o.estimatedDelivery && !["DELIVERED", "CANCELLED"].includes(o.status) ? ` · expected by ${formatDate(o.estimatedDelivery)}` : ` · ${formatDate(o.placedAt)}`}
                    </span>
                  </span>
                  <StatusPill status={o.status} kind="order" />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </>
  );
}
