"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Award, BadgePercent, CalendarClock, CalendarDays, Clock, IndianRupee, Landmark, Phone, Star, Stethoscope, UserX, Video, Wallet } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { GradientAvatar } from "@/components/custom/avatar";
import { Callout } from "@/components/custom/callout";
import { DetailList } from "@/components/custom/detail-list";
import { EmptyState } from "@/components/custom/empty-state";
import { IconTile } from "@/components/custom/icon-tile";
import { StatSkeleton } from "@/components/custom/loaders";
import { Money } from "@/components/custom/number";
import { PageHero } from "@/components/custom/page-hero";
import { SectionCard } from "@/components/custom/section-card";
import { StatCard } from "@/components/custom/stat-card";
import { StatusPill } from "@/components/custom/status-pill";
import { AppointmentCard, useAppointments } from "@/components/doctor/appointments";
import { EarningsChart, useDoctorStats } from "@/components/doctor/earnings-chart";
import { OnboardingSteps, useOnboarding } from "@/components/doctor/onboarding-steps";
import { type DayRange, PeriodFilter, lastDays, periodLabel } from "@/components/doctor/period-filter";
import { PrescriptionEditor } from "@/components/site/prescription-editor";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { APPOINTMENT_LABEL, type DoctorAppointment, type DoctorOverview } from "@/lib/care";
import { cn } from "@/lib/utils";

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
const clock = (value: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(value)).toUpperCase();

const greeting = () => {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: false }).format(new Date()));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
};
const today = () => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());

export default function DoctorOverviewPage() {
  const [prescribing, setPrescribing] = useState<DoctorAppointment | null>(null);
  const { data, isPending, isError, refetch } = useQuery({ queryKey: ["doctor-overview"], queryFn: () => api<DoctorOverview>("/doctor/overview") });
  const { data: profile } = useQuery({ queryKey: ["doctor-profile"], queryFn: () => api<{ bankAccountEnding: string | null; photoUrl: string | null }>("/doctor/profile") });
  const { data: upcoming } = useAppointments("upcoming");
  const { data: onboarding } = useOnboarding();
  const [range, setRange] = useState<DayRange>(() => lastDays(30));
  const { data: stats, isPlaceholderData: statsLoading } = useDoctorStats(range);

  if (isError) return <EmptyState variant="error" title="Your dashboard could not be loaded" description="Check the connection and try again." onRetry={() => refetch()} bordered />;
  if (isPending) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-44 rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <StatSkeleton key={i} />)}</div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  const { doctor, earnings } = data;
  const verified = doctor.verificationStatus === "APPROVED";
  const period = periodLabel(range);
  const next = (upcoming?.items ?? []).find((a) => a.status === "CONFIRMED" || a.status === "IN_PROGRESS") ?? null;
  const fullById = new Map((upcoming?.items ?? []).map((a) => [a.id, a]));
  const faded = statsLoading ? "opacity-60 transition-opacity" : "transition-opacity";

  return (
    <div className="grid gap-5">
      <PageHero
        tone="ink"
        overlap
        className="mb-0"
        eyebrow={today()}
        title={`${greeting()}, ${doctor.displayName}`}
        avatar={<GradientAvatar name={doctor.displayName} src={profile?.photoUrl} size="xl" ring={verified ? "terracotta" : null} />}
        meta={
          <>
            {doctor.stream ? <StatusPill status="OPEN" label={doctor.stream} tone="primary" dot={false} className="bg-paper/15 text-paper" /> : null}
            {doctor.tier ? <span className="inline-flex h-5 items-center gap-1 rounded-full bg-paper/15 px-2 text-[11px] font-medium tracking-[0.06em] text-paper uppercase"><Award className="size-3" /> {doctor.tier.name} · up to {doctor.tier.maxPatientsPerDay} a day</span> : null}
            {doctor.ratingCount > 0 ? <Link href="/doctor/reviews" className="inline-flex h-5 items-center gap-1 rounded-full bg-paper/15 px-2 text-[11px] font-medium text-paper hover:bg-paper/25"><Star className="size-3 fill-current" /> {doctor.rating.toFixed(1)} ({doctor.ratingCount})</Link> : null}
          </>
        }
        actions={
          <>
            <Button asChild variant="outline" size="lg" className="border-paper/30 bg-paper/10 text-paper not-disabled:hover:bg-paper/20 not-disabled:hover:text-paper"><Link href="/doctor/schedule"><CalendarDays data-icon="inline-start" /> Working hours</Link></Button>
            <Button asChild size="lg" className="bg-terracotta text-terracotta-foreground not-disabled:hover:bg-terracotta/90"><Link href="/doctor/appointments"><CalendarClock data-icon="inline-start" /> Appointments</Link></Button>
          </>
        }
      />

      <div className="relative grid gap-5">
        {onboarding && (!onboarding.consulting || (onboarding.testRequired && !onboarding.testPassed)) ? <OnboardingSteps data={onboarding} /> : null}
        {verified && doctor.consulting && !doctor.hasWorkingHours ? (
          <Callout tone="warning" icon={Clock} title="Set your working hours." action={<Button asChild size="sm" variant="outline"><Link href="/doctor/schedule">Add hours <ArrowRight data-icon="inline-end" /></Link></Button>}>Patients cannot book you until you add them.</Callout>
        ) : null}
        {profile && !profile.bankAccountEnding ? (
          <Callout tone="warning" icon={Landmark} title="Add your bank account." action={<Button asChild size="sm" variant="outline"><Link href="/doctor/profile">Add bank details <ArrowRight data-icon="inline-end" /></Link></Button>}>We need it to pay out what you earn from consultations.</Callout>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-medium">Your practice in numbers</h2>
          <PeriodFilter value={range} onChange={setRange} firstDay={stats?.range.firstDay} />
        </div>

        {!stats ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <StatSkeleton key={i} />)}</div>
        ) : (
          <div className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-4", faded)}>
            <StatCard icon={IndianRupee} label="Earned" value={stats.totals.earned.value} format="currency" change={stats.totals.earned.change} note={period} sparkline={stats.series.slice(-12).map((s) => s.earned)} />
            <StatCard icon={Stethoscope} label="Consultations done" value={stats.totals.consultations.value} change={stats.totals.consultations.change} note={`${plural(stats.totals.patients.value, "patient")} · ${period}`} />
            <StatCard icon={CalendarClock} label="Appointments booked" value={stats.totals.booked.value} change={stats.totals.booked.change} note={period} />
            {stats.totals.missed.value ? (
              <StatCard icon={UserX} label="Cancelled or missed" value={stats.totals.missed.value} tone="danger" hint={period} />
            ) : (
              <StatCard icon={Wallet} label="Waiting for payout" value={earnings.waitingForPayout} format="currency" tone="terracotta" hint="Not yet paid to your bank" />
            )}
          </div>
        )}

        <div className="grid items-start gap-4 xl:grid-cols-5">
          <SectionCard
            className="xl:col-span-3" title="Earnings" description={`${period}, after the platform share of ${doctor.commissionPercent}%`}
            action={<Button asChild variant="ghost" size="sm"><Link href="/doctor/earnings">Details <ArrowRight data-icon="inline-end" /></Link></Button>}
          >
            {stats ? <div className={faded}><EarningsChart stats={stats} /></div> : <Skeleton className="h-64" />}
            <div className="mt-4 border-t border-foreground/18 pt-4">
              <DetailList
                columns={3}
                items={[
                  { label: "Average per consultation", value: <Money value={stats?.averagePerConsultation ?? 0} /> },
                  { label: "Waiting for payout", value: <Money value={earnings.waitingForPayout} />, tone: "terracotta" },
                  { label: "Earned so far", value: <Money value={earnings.allTime} /> },
                ]}
              />
            </div>
          </SectionCard>

          <SectionCard className="xl:col-span-2" title="Today" description={data.today.length ? plural(data.today.length, "appointment") : "Nothing booked for today"}>
            {data.today.length === 0 ? (
              <EmptyState size="sm" illustration="calendar" title="A clear day" description={next ? "Your next appointment is shown below." : "Appointments for today appear here in time order."} />
            ) : (
              <ol className="grid gap-1">
                {data.today.map((a) => {
                  const full = fullById.get(a.id);
                  const live = a.status === "CONFIRMED" || a.status === "IN_PROGRESS";
                  return (
                    <li key={a.id} className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-2">
                      <span className="ledger w-18 shrink-0 text-sm font-medium">{clock(a.scheduledAt)}</span>
                      <IconTile icon={a.mode === "AUDIO" ? Phone : Video} tone={live ? "terracotta" : "neutral"} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{a.patientName}</span>
                        <span className="block truncate text-xs text-muted-foreground">{a.symptoms ?? "No note from the patient"}</span>
                      </span>
                      {live && a.meetingUrl ? <Button asChild size="sm" className="bg-terracotta text-terracotta-foreground not-disabled:hover:bg-terracotta/90"><a href={a.meetingUrl} target="_blank" rel="noreferrer">Join</a></Button>
                        : full && a.status === "COMPLETED" ? <Button size="sm" variant="outline" onClick={() => setPrescribing(full)}>Prescription</Button>
                        : <StatusPill status={a.status} kind="appointment" label={APPOINTMENT_LABEL[a.status]} />}
                    </li>
                  );
                })}
              </ol>
            )}
          </SectionCard>
        </div>

        <div className="grid items-start gap-4 xl:grid-cols-5">
          <div className="grid gap-3 xl:col-span-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-medium">Next appointment</h2>
              <Button asChild variant="ghost" size="sm"><Link href="/doctor/appointments">All appointments <ArrowRight data-icon="inline-end" /></Link></Button>
            </div>
            {next ? <AppointmentCard appointment={next} onPrescribe={setPrescribing} /> : (
              <EmptyState bordered illustration="calendar" title="Nobody is booked yet" description={doctor.consulting ? "New bookings appear here straight away." : "Bookings open when you finish the steps above."} />
            )}
          </div>

          <SectionCard className="xl:col-span-2" tone="plum" title="Wholesale buying" description="Medicines for your practice at doctor prices">
            <div className="grid gap-3">
              {doctor.wholesale?.status === "APPROVED" ? (
                <Callout tone="plum" icon={BadgePercent} title={doctor.wholesale.tier ? `${doctor.wholesale.tier} pricing is on` : "Wholesale pricing is on"}>
                  {doctor.wholesale.discountPercent ? `${doctor.wholesale.discountPercent}% off retail on most products, more on bulk slabs.` : "Your prices show on every product."}
                </Callout>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {doctor.wholesale ? "Your wholesale account will be switched on when your registration is verified." : "Not switched on for your account yet. You can ask for it in one step."}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button asChild><Link href="/doctor/wholesale">Order medicines <ArrowRight data-icon="inline-end" /></Link></Button>
                <Button asChild variant="outline"><Link href="/doctor/orders">My orders</Link></Button>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>

      <PrescriptionEditor appointment={prescribing} onClose={() => setPrescribing(null)} />
    </div>
  );
}
