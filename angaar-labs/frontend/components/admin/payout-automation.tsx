"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, FileSpreadsheet, Settings2, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { formatMoney, formatMoneyExact, formatNumber } from "@/lib/format";
import { Spinner } from "@/components/custom/loaders";

type Settings = { automatic: boolean; frequency: "weekly" | "monthly"; weekday: number; dayOfMonth: number; minimumAmount: number; holdDays: number };
type Info = { settings: Settings; lastRun: string | null; waiting: { count: number; amount: number } };
type Batch = {
  created: { payoutId: number; doctor: string; amount: number; consultations: number }[];
  skipped: { doctor: string; amount: number; why: string }[];
  total: number;
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WHY: Record<string, string> = { "no bank details": "no bank details on file" };
/** 1 -> "1st", 22 -> "22nd" */
const ordinal = (day: number) => `${day}${day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th"}`;
const dayWord = (count: number) => `${formatNumber(count)} ${count === 1 ? "day" : "days"}`;

const downloadBankSheet = () => {
  const link = document.createElement("a");
  link.href = "/api/admin/payouts/bank-file";
  link.download = "";
  document.body.appendChild(link);
  link.click();
  link.remove();
};

/** When payouts are gathered by themselves, plus the two things staff do around the bank transfer. */
export function PayoutAutomation({ onChanged }: { onChanged: () => void }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Record<keyof Omit<Settings, "automatic" | "frequency">, string> & Pick<Settings, "automatic" | "frequency"> | null>(null);
  const [result, setResult] = useState<Batch | null>(null);

  const { data, isError } = useQuery({ queryKey: ["payouts", "automation"], queryFn: () => api<Info>("/admin/payouts/settings") });

  const save = useMutation({
    mutationFn: (settings: Settings) => api<Settings>("/admin/payouts/settings", { method: "PUT", body: settings }),
    onSuccess: () => {
      toast.success("Payout days saved");
      setDraft(null);
      queryClient.invalidateQueries({ queryKey: ["payouts", "automation"] });
    },
    onError: (err) => toast.error(err.message),
  });

  const gather = useMutation({
    mutationFn: () => api<Batch>("/admin/payouts/run-now", { method: "POST", body: {} }),
    onSuccess: (batch) => {
      if (batch.created.length === 0 && batch.skipped.length === 0) toast.info("Nothing is ready to be paid yet");
      else setResult(batch);
      onChanged();
    },
    onError: (err) => toast.error(err.message),
  });

  if (isError) return null;
  if (!data) return <Skeleton className="mb-8 h-24" />;
  const { settings, waiting } = data;

  const edit = () =>
    setDraft({
      automatic: settings.automatic, frequency: settings.frequency, weekday: String(settings.weekday), dayOfMonth: String(settings.dayOfMonth),
      minimumAmount: String(settings.minimumAmount), holdDays: String(settings.holdDays),
    });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft || save.isPending) return;
    save.mutate({
      automatic: draft.automatic, frequency: draft.frequency, weekday: Number(draft.weekday), dayOfMonth: Number(draft.dayOfMonth),
      minimumAmount: Number(draft.minimumAmount || 0), holdDays: Number(draft.holdDays || 0),
    });
  };

  const when = settings.frequency === "weekly" ? `Every ${WEEKDAYS[settings.weekday]}` : `On the ${ordinal(settings.dayOfMonth)} of every month`;

  return (
    <>
      <Card className="mb-8">
        <CardContent className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex max-w-2xl items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><CalendarClock className="size-4.5" /></span>
            <div>
              <p className="font-medium">{settings.automatic ? `${when}, payouts are prepared for you` : "Payouts are prepared by hand"}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {settings.automatic
                  ? `What each doctor has earned is gathered into one payout and you get an alert. A consultation waits ${dayWord(settings.holdDays)} first, in case it is refunded${settings.minimumAmount > 0 ? `, and amounts under ${formatMoney(settings.minimumAmount)} wait for the next round` : ""}.`
                  : "Nothing is gathered by itself. Use \"Prepare payouts now\", or create a payout for one doctor from the list below."}{" "}
                The money itself is still sent from your bank: download the bank sheet, upload it to your bank, then mark the payouts as paid.
              </p>
              {waiting.count > 0 ? (
                <p className="mt-2 text-sm">
                  <span className="font-medium ledger">{formatMoneyExact(waiting.amount)}</span>
                  <span className="text-muted-foreground"> in {formatNumber(waiting.count)} {waiting.count === 1 ? "payout is" : "payouts are"} waiting to be paid</span>
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="h-9" onClick={edit}><Settings2 /> Payout days</Button>
            <Button variant="outline" className="h-9" disabled={waiting.count === 0} title={waiting.count === 0 ? "No payouts are waiting to be paid" : undefined} onClick={downloadBankSheet}>
              <FileSpreadsheet /> Bank sheet
            </Button>
            <Button className="h-9" disabled={gather.isPending} onClick={() => gather.mutate()}>
              {gather.isPending ? <Spinner size="sm" /> : <Sparkles />}
              Prepare payouts now
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* when and how payouts are gathered */}
      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Payout days</DialogTitle>
            <DialogDescription>When each doctor&apos;s earnings are gathered into a payout, ready for you to pay.</DialogDescription>
          </DialogHeader>
          {draft ? (
            <form id="payout-days" className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
              <label className="flex items-start justify-between gap-3 rounded-lg border p-3 text-sm sm:col-span-2">
                <span>
                  Prepare payouts automatically
                  <span className="block text-xs text-muted-foreground">Switched off, payouts are only made when you press the button.</span>
                </span>
                <Switch checked={draft.automatic} onCheckedChange={(automatic) => setDraft({ ...draft, automatic })} />
              </label>
              <div className="grid content-start gap-1.5">
                <Label>How often</Label>
                <Select value={draft.frequency} onValueChange={(frequency) => setDraft({ ...draft, frequency: frequency as Settings["frequency"] })}>
                  <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Every week</SelectItem>
                    <SelectItem value="monthly">Every month</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {draft.frequency === "weekly" ? (
                <div className="grid content-start gap-1.5">
                  <Label>On</Label>
                  <Select value={draft.weekday} onValueChange={(weekday) => setDraft({ ...draft, weekday })}>
                    <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{WEEKDAYS.map((day, index) => <SelectItem key={day} value={String(index)}>{day}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="grid content-start gap-1.5">
                  <Label htmlFor="payout-day">Day of the month</Label>
                  <Input id="payout-day" required type="number" inputMode="numeric" min={1} max={28} step={1} className="h-9" value={draft.dayOfMonth} onChange={(e) => setDraft({ ...draft, dayOfMonth: e.target.value })} />
                  <p className="text-xs text-muted-foreground">1 to 28, so every month has it.</p>
                </div>
              )}
              <div className="grid content-start gap-1.5">
                <Label htmlFor="payout-hold">Days to wait after a consultation</Label>
                <Input id="payout-hold" type="number" inputMode="numeric" min={0} max={30} step={1} className="h-9" value={draft.holdDays} onChange={(e) => setDraft({ ...draft, holdDays: e.target.value })} />
                <p className="text-xs text-muted-foreground">Leaves time for a refund before the doctor is paid.</p>
              </div>
              <div className="grid content-start gap-1.5">
                <Label htmlFor="payout-minimum">Smallest payout (₹)</Label>
                <Input id="payout-minimum" type="number" inputMode="numeric" min={0} max={100000} step={1} className="h-9" value={draft.minimumAmount} onChange={(e) => setDraft({ ...draft, minimumAmount: e.target.value })} />
                <p className="text-xs text-muted-foreground">Smaller amounts wait for the next round.</p>
              </div>
            </form>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
            <Button type="submit" form="payout-days" loading={save.isPending}>Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* what "Prepare payouts now" did */}
      <Dialog open={result !== null} onOpenChange={(open) => !open && setResult(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {result?.created.length ? `${formatNumber(result.created.length)} ${result.created.length === 1 ? "payout" : "payouts"} prepared` : "No payouts prepared"}
            </DialogTitle>
            <DialogDescription>
              {result?.created.length
                ? `${formatMoneyExact(result.total)} in total. No money has moved yet: download the bank sheet, pay from your bank, then mark them as paid.`
                : "Nobody could be paid this time. The reasons are below."}
            </DialogDescription>
          </DialogHeader>
          {result?.created.length ? (
            <ul className="divide-y rounded-lg border text-sm">
              {result.created.map((payout) => (
                <li key={payout.payoutId} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0 truncate">{payout.doctor}<span className="ml-2 text-xs text-muted-foreground">{formatNumber(payout.consultations)} {payout.consultations === 1 ? "consultation" : "consultations"}</span></span>
                  <span className="shrink-0 font-medium ledger">{formatMoneyExact(payout.amount)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {result?.skipped.length ? (
            <div>
              <p className="mb-1.5 text-sm font-medium">Left for next time</p>
              <ul className="divide-y rounded-lg border text-sm">
                {result.skipped.map((row) => (
                  <li key={row.doctor} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="min-w-0 truncate">{row.doctor}<span className="ml-2 text-xs text-muted-foreground">{WHY[row.why] ?? row.why}</span></span>
                    <span className="shrink-0 ledger text-muted-foreground">{formatMoneyExact(row.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setResult(null)}>Close</Button>
            {result?.created.length ? <Button onClick={() => { downloadBankSheet(); setResult(null); }}><FileSpreadsheet /> Download bank sheet</Button> : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
