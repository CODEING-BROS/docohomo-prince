"use client";

import { useQuery } from "@tanstack/react-query";
import { Banknote, IndianRupee, Landmark, Stethoscope, Wallet } from "lucide-react";
import { useState } from "react";
import { PageHeader, StatCard, StatusBadge } from "@/components/admin/parts";
import { EarningsChart, useDoctorStats } from "@/components/doctor/earnings-chart";
import { type DayRange, PeriodFilter, lastDays, periodLabel } from "@/components/doctor/period-filter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { type DoctorOverview, MODE_LABEL } from "@/lib/care";
import { formatDate, formatMoney, formatMoneyExact } from "@/lib/format";
import { useTimeZone } from "@/lib/timezone";

type Earnings = {
  waitingForPayout: number; waitingConsultations: number; paidOut: number;
  payouts: { id: number; periodStart: string; periodEnd: string; amount: number; status: "PENDING" | "PAID" | "FAILED"; reference: string | null; paidAt: string | null; createdAt: string; consultations: number }[];
  consultations: { id: number; appointmentNumber: string; patientName: string; mode: string; completedAt: string | null; scheduledAt: string; fee: number; doctorEarning: number; payout: "WAITING" | "PROCESSING" | "PAID" }[];
};

const PAYOUT_LABEL = { WAITING: "Waiting for payout", PROCESSING: "Being paid", PAID: "Paid to you" };
const PAYOUT_TONE = { WAITING: "PENDING", PROCESSING: "CONFIRMED", PAID: "PAID" };
const PAYOUT_STATUS_LABEL = { PENDING: "Being sent", PAID: "Paid", FAILED: "Failed" };

export default function DoctorEarningsPage() {
  const { data: overview } = useQuery({ queryKey: ["doctor-overview"], queryFn: () => api<DoctorOverview>("/doctor/overview") });
  const tz = useTimeZone();
  const [range, setRange] = useState<DayRange>(() => lastDays(30));
  const { data: stats, isPlaceholderData: statsLoading } = useDoctorStats(range);
  const { data, isPending } = useQuery({
    queryKey: ["doctor-earnings", range, tz],
    queryFn: () => api<Earnings>("/doctor/earnings", { query: { ...range, tz } }),
    placeholderData: (previous) => previous,
  });
  const period = periodLabel(range);

  if (isPending || !data || !overview || !stats) {
    return (
      <>
        <PageHeader title="Earnings" description="What you have earned from consultations and what has been paid to your bank." />
        <div className="grid gap-4"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div><Skeleton className="h-72 rounded-xl" /></div>
      </>
    );
  }
  const { earnings, doctor } = overview;

  return (
    <>
      <PageHeader title="Earnings" description={`What you have earned from consultations, after the platform share of ${doctor.commissionPercent}%, and what has been paid to your bank.`}>
        <PeriodFilter value={range} onChange={setRange} firstDay={stats.range.firstDay} />
      </PageHeader>

      <div className={`grid gap-4 transition-opacity ${statsLoading ? "opacity-60" : ""}`}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={Wallet} label="Waiting for payout" value={formatMoney(data.waitingForPayout)} hint={`From ${data.waitingConsultations} consultation${data.waitingConsultations === 1 ? "" : "s"}`} />
          <StatCard icon={Landmark} label="Paid to your bank" value={formatMoney(data.paidOut)} hint="Since you joined" />
          <StatCard icon={IndianRupee} label="Earned" value={formatMoney(stats.totals.earned.value)} change={stats.totals.earned.change} hint={`${stats.totals.consultations.value} consultation${stats.totals.consultations.value === 1 ? "" : "s"} · ${period}`} />
          <StatCard icon={Stethoscope} label="Earned so far" value={formatMoney(earnings.allTime)} hint={`${earnings.allTimeConsultations} consultations done`} />
        </div>

        <div className="grid items-start gap-4 xl:grid-cols-5">
          <Card className="xl:col-span-3">
            <CardHeader><CardTitle>{stats.range.unit === "day" ? "Day by day" : "Month by month"}</CardTitle><CardDescription>{period}: your share from finished consultations</CardDescription></CardHeader>
            <CardContent>
              <EarningsChart stats={stats} />
            </CardContent>
          </Card>

          <Card className="xl:col-span-2">
            <CardHeader><CardTitle>Payouts</CardTitle><CardDescription>{period}: transfers to your bank account</CardDescription></CardHeader>
            <CardContent>
              {data.payouts.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground"><Banknote className="size-5" /></span>
                  <p className="text-sm text-muted-foreground">No payouts in this period. Your earnings are paid to your bank account in batches.</p>
                </div>
              ) : (
                <ul className="scroll-thin grid max-h-72 gap-1 overflow-x-hidden overflow-y-auto">
                  {data.payouts.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-2">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium ledger">{formatMoneyExact(p.amount)}</span>
                        <span className="block text-xs text-muted-foreground">{formatDate(p.periodStart)} to {formatDate(p.periodEnd)} · {p.consultations} consultation{p.consultations === 1 ? "" : "s"}{p.reference ? ` · Ref ${p.reference}` : ""}</span>
                      </span>
                      <StatusBadge status={p.status} label={PAYOUT_STATUS_LABEL[p.status]} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Finished consultations</CardTitle><CardDescription>{period}: the fee the patient paid and your share of it</CardDescription></CardHeader>
          <CardContent>
            {data.consultations.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No consultations were finished in this period. Pick a longer period above to see earlier ones.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead><TableHead>Patient</TableHead><TableHead>Type</TableHead>
                      <TableHead className="text-right">Fee</TableHead><TableHead className="text-right">Your share</TableHead><TableHead>Payout</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.consultations.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="whitespace-nowrap">{formatDate(c.completedAt ?? c.scheduledAt)}</TableCell>
                        <TableCell><span className="font-medium">{c.patientName}</span><span className="block text-xs text-muted-foreground">{c.appointmentNumber}</span></TableCell>
                        <TableCell>{MODE_LABEL[c.mode] ?? c.mode}</TableCell>
                        <TableCell className="text-right ledger">{formatMoneyExact(c.fee)}</TableCell>
                        <TableCell className="text-right font-medium ledger">{formatMoneyExact(c.doctorEarning)}</TableCell>
                        <TableCell><StatusBadge status={PAYOUT_TONE[c.payout]} label={PAYOUT_LABEL[c.payout]} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
