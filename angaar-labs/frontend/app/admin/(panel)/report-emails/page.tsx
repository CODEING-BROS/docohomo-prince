"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, CalendarRange, Plus, Send, Sun, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/parts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ButtonSpinner, Spinner } from "@/components/custom/loaders";

type Kind = "daily" | "weekly" | "monthly";
type Settings = { daily: boolean; weekly: boolean; monthly: boolean; weekday: number; hour: number; recipients: string[]; attachOrders: boolean };
type Info = { settings: Settings; goingTo: string[]; lastSent: Partial<Record<Kind, string>>; emailProblem: string | null };
type Preview = { kind: Kind; period: { from: string; to: string; label: string }; subject: string; body: string };

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const HOURS = Array.from({ length: 24 }, (_, hour) => ({ value: String(hour), label: `${hour % 12 === 0 ? 12 : hour % 12} ${hour < 12 ? "am" : "pm"}` }));
const KINDS: { kind: Kind; title: string; covers: string; icon: typeof Sun }[] = [
  { kind: "daily", title: "Every day", covers: "Yesterday's sales and consultations", icon: Sun },
  { kind: "weekly", title: "Every week", covers: "The seven days before", icon: CalendarDays },
  { kind: "monthly", title: "Every month", covers: "The month that just ended, sent on the 1st", icon: CalendarRange },
];

function SettingsForm({ info }: { info: Info }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(info.settings);
  const [adding, setAdding] = useState("");
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const save = useMutation({
    mutationFn: () => api<{ settings: Settings }>("/admin/reports/email", { method: "PUT", body: draft }),
    onSuccess: () => { toast.success("Report emails saved"); queryClient.invalidateQueries({ queryKey: ["report-emails"] }); },
    onError: (err) => toast.error(err.message),
  });
  const addPerson = () => {
    const email = adding.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast.error("That email address does not look right");
    if (!draft.recipients.includes(email)) set("recipients", [...draft.recipients, email]);
    setAdding("");
  };
  const changed = JSON.stringify(draft) !== JSON.stringify(info.settings);
  const anyOn = draft.daily || draft.weekly || draft.monthly;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Which reports to send</CardTitle>
        <CardDescription>Each one is a short email: sales, best sellers, consultations, and what is waiting for someone to act on.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-2">
          {KINDS.map(({ kind, title, covers, icon: Icon }) => (
            <label key={kind} className="flex items-center gap-3 rounded-lg border p-3 text-sm">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-4.5" /></span>
              <span className="min-w-0 flex-1">
                <span className="font-medium">{title}</span>
                <span className="block text-xs text-muted-foreground">
                  {covers}{info.lastSent[kind] ? ` · Last sent ${formatDate(info.lastSent[kind]!)}` : ""}
                </span>
              </span>
              {kind === "weekly" && draft.weekly ? (
                <Select value={String(draft.weekday)} onValueChange={(value) => set("weekday", Number(value))}>
                  <SelectTrigger className="h-8 w-32" aria-label="Day the weekly report is sent" onClick={(e) => e.stopPropagation()}><SelectValue /></SelectTrigger>
                  <SelectContent>{WEEKDAYS.map((day, index) => <SelectItem key={day} value={String(index)}>{day}</SelectItem>)}</SelectContent>
                </Select>
              ) : null}
              <Switch checked={draft[kind]} onCheckedChange={(on) => set(kind, on)} aria-label={`${title} report`} />
            </label>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid content-start gap-1.5">
            <Label>Time of day</Label>
            <Select value={String(draft.hour)} onValueChange={(value) => set("hour", Number(value))}>
              <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{HOURS.map((hour) => <SelectItem key={hour.value} value={hour.value}>{hour.label}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">India time. Reports go out within a few minutes of this hour.</p>
          </div>
          <label className="flex items-start justify-between gap-3 rounded-lg border p-3 text-sm">
            <span>
              Attach the orders as a spreadsheet
              <span className="block text-xs text-muted-foreground">Every order of the period, one per line, for your accountant.</span>
            </span>
            <Switch checked={draft.attachOrders} onCheckedChange={(on) => set("attachOrders", on)} />
          </label>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="report-person">Who gets them</Label>
          {draft.recipients.length ? (
            <ul className="flex flex-wrap gap-1.5">
              {draft.recipients.map((email) => (
                <li key={email} className="inline-flex items-center gap-1 rounded-full border bg-muted/40 py-0.5 pr-1 pl-3 text-sm">
                  {email}
                  <button type="button" aria-label={`Remove ${email}`} onClick={() => set("recipients", draft.recipients.filter((e) => e !== email))} className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nobody chosen, so they go to the people who get staff alerts{info.goingTo.length ? `: ${info.goingTo.join(", ")}` : " (none set yet)"}.
            </p>
          )}
          <div className="flex gap-2 sm:w-96">
            <Input id="report-person" type="email" className="h-9" maxLength={160} placeholder="owner@example.com" value={adding} onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPerson(); } }} />
            <Button type="button" variant="outline" className="h-9" disabled={!adding.trim() || draft.recipients.length >= 10} onClick={addPerson}><Plus /> Add</Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-sm text-muted-foreground">{anyOn ? "Reports are sent by themselves. Nobody has to press anything." : "All three are off, so no report is sent."}</p>
          <Button disabled={!changed || save.isPending} onClick={() => save.mutate()}>{save.isPending ? <ButtonSpinner /> : null}Save</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PreviewCard({ info }: { info: Info }) {
  const [kind, setKind] = useState<Kind>("weekly");
  const { data, isFetching, isError } = useQuery({ queryKey: ["report-emails", "preview", kind], queryFn: () => api<Preview>("/admin/reports/email/preview", { query: { kind } }), placeholderData: (previous) => previous });

  const send = useMutation({
    mutationFn: () => api<{ sent: number; recipients: string[]; emailProblem: string | null }>("/admin/reports/email/send", { method: "POST", body: { kind } }),
    onSuccess: (result) => {
      if (result.sent === 0) toast.error("There is nobody to send it to. Add an email address first.");
      else if (result.emailProblem) toast.error(`The report could not go out. ${result.emailProblem}`);
      else toast.success(`Sent to ${result.recipients.join(", ")}`);
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>What it looks like</CardTitle>
        <CardDescription>Made from the real numbers, as if it were sent now.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {KINDS.map((item) => (
            <button
              key={item.kind} type="button" onClick={() => setKind(item.kind)}
              className={cn("inline-flex h-8 items-center rounded-full border px-3 text-sm transition-colors", kind === item.kind ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-surface-2")}
            >
              {item.kind === "daily" ? "Daily" : item.kind === "weekly" ? "Weekly" : "Monthly"}
            </button>
          ))}
          <Button variant="outline" size="sm" className="ml-auto" disabled={send.isPending || !data} onClick={() => send.mutate()}>
            {send.isPending ? <Spinner size="sm" /> : <Send />} Send this one now
          </Button>
        </div>
        {isError ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Could not make the report. Check that the backend is running.</p>
        ) : !data ? (
          <Skeleton className="h-80" />
        ) : (
          <div className={cn("overflow-hidden rounded-lg border", isFetching && "opacity-60")}>
            <p className="border-b bg-muted/40 px-4 py-2.5 text-sm font-medium">{data.subject}</p>
            <div className="px-4 py-3 text-sm leading-relaxed break-words whitespace-pre-wrap">{data.body}</div>
            {info.settings.attachOrders ? <p className="border-t bg-muted/40 px-4 py-2 text-xs text-muted-foreground">Attached: orders-{data.period.from}-to-{data.period.to}.csv</p> : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ReportEmailsPage() {
  const { data, isPending, isError } = useQuery({ queryKey: ["report-emails", "settings"], queryFn: () => api<Info>("/admin/reports/email") });

  return (
    <>
      <PageHeader title="Report emails" description="A summary of the shop sent to you by email, so you do not have to open the panel to know how things are going">
        <Button asChild variant="outline" className="h-9"><Link href="/admin/reports">Open full reports</Link></Button>
      </PageHeader>

      {data?.emailProblem ? (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-warning/15 p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          <p>
            Reports cannot be delivered at the moment. {data.emailProblem} They start going out by themselves once this is fixed.{" "}
            <Link href="/admin/messages" className="font-medium underline">See Automatic messages</Link>
          </p>
        </div>
      ) : null}

      {isError ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Could not load the settings. Check that the backend is running.</p>
      ) : isPending || !data ? (
        <div className="grid gap-4 xl:grid-cols-2"><Skeleton className="h-96" /><Skeleton className="h-96" /></div>
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-2">
          <SettingsForm key={JSON.stringify(data.settings)} info={data} />
          <PreviewCard info={data} />
        </div>
      )}
    </>
  );
}
