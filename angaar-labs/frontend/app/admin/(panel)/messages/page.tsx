"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown, ArrowUp, CheckCircle2, CircleAlert, Loader2, Mail, MessageCircle, MessagesSquare, Plus, RotateCcw, Send, Smartphone, X,
} from "lucide-react";
import Link from "next/link";
import { Suspense, useRef, useState } from "react";
import { toast } from "sonner";
import { BulkActions, SelectPage, SelectRow, useSelection } from "@/components/admin/bulk";
import { Combobox } from "@/components/admin/combobox";
import { EmptyState, PageHeader, PaginationBar, SearchInput, StatusBadge } from "@/components/admin/parts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useUrlState } from "@/hooks/use-url-state";
import { api } from "@/lib/api";
import { formatDateTime, formatNumber, humanize } from "@/lib/format";
import type { Paged } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SectionCard } from "@/components/custom/section-card";
import { DataTableRow } from "@/components/custom/data-table";
import { ButtonSpinner, Spinner } from "@/components/custom/loaders";

// ─────────────────────────────────────────────────────────── Types and wording

type Audience = "CUSTOMER" | "PATIENT" | "DOCTOR" | "STAFF";
type Channel = "EMAIL" | "SMS" | "WHATSAPP";
type Channels = { email: boolean; sms: boolean; whatsapp: boolean };
type SendStatus = "QUEUED" | "SENT" | "FAILED" | "SKIPPED";

type Template = {
  event: string; audience: Audience; description: string | null; isActive: boolean;
  emailEnabled: boolean; emailSubject: string | null; emailBody: string | null;
  smsEnabled: boolean; smsTemplateId: string | null; smsText: string | null;
  whatsappEnabled: boolean; whatsappTemplate: string | null; whatsappLanguage: string; whatsappParams: string[];
  updatedAt: string; placeholders: string[]; last30Days: { sent: number; failed: number; skipped: number };
};
type Problems = { email?: string; sms?: string; whatsapp?: string }; // connected, but not working
type TemplateList = { channels: Channels; problems?: Problems; lastSmsSentAt?: string | null; items: Template[] };

type LogRow = {
  id: number; event: string; channel: Channel; recipient: string | null; subject: string | null; body: string | null;
  status: SendStatus; error: string | null; attempts: number; relatedType: string | null; relatedId: number | null;
  createdAt: string; sentAt: string | null;
};
type LogList = Paged<LogRow> & { last7Days: Partial<Record<SendStatus, number>> };

type StaffSettings = { channels: Channels; emails: string[]; phones: string[]; fallbackEmails: string[] };

/** A short name for each message, as a shop owner would say it. */
const EVENT_NAME: Record<string, string> = {
  "order.placed": "Order placed",
  "order.paid": "Order payment received",
  "order.shipped": "Order shipped",
  "order.delivered": "Order delivered",
  "order.cancelled": "Order cancelled",
  "appointment.booked": "Consultation booked",
  "appointment.new": "New appointment (to the doctor)",
  "appointment.reminder": "Consultation reminder",
  "appointment.cancelled": "Consultation cancelled",
  "prescription.issued": "Prescription ready",
  "doctor.registered": "Registration received",
  "doctor.verified": "Doctor verified",
  "doctor.rejected": "Registration not accepted",
  "doctor.test_passed": "Doctor passed the test",
  "payout.paid": "Earnings paid",
  "staff.order_placed": "New order",
  "staff.doctor_registered": "New doctor to verify",
  "staff.refund_due": "Refund to make",
  "staff.shipping_problem": "Delivery problem",
  "staff.low_stock": "Daily stock check",
};
// a message added later still gets a readable name: "staff.some_thing" -> "Some thing"
const eventName = (event: string) => EVENT_NAME[event] ?? humanize(event.split(".").pop() ?? event);

const GROUPS: { audience: Audience; title: string; description: string }[] = [
  { audience: "CUSTOMER", title: "Customers", description: "People who buy from the shop" },
  { audience: "PATIENT", title: "Patients", description: "People who book a consultation" },
  { audience: "DOCTOR", title: "Doctors", description: "Doctors who register and consult on DocHomoeo" },
  { audience: "STAFF", title: "Staff", description: "Alerts for your own team" },
];

const CHANNELS: { key: keyof Channels; channel: Channel; label: string; icon: typeof Mail }[] = [
  { key: "email", channel: "EMAIL", label: "Email", icon: Mail },
  { key: "sms", channel: "SMS", label: "SMS", icon: Smartphone },
  { key: "whatsapp", channel: "WHATSAPP", label: "WhatsApp", icon: MessageCircle },
];
const CHANNEL_LABEL: Record<Channel, string> = { EMAIL: "Email", SMS: "SMS", WHATSAPP: "WhatsApp" };

const CONNECTION_HELP: Record<keyof Channels, { on: string; off: string }> = {
  email: {
    on: "Emails go out from the shop's email account.",
    off: "Needs an email login (SMTP) in the backend settings, for example a Gmail address with an app password.",
  },
  sms: {
    on: "Each message also needs its approved SMS text before SMS can be switched on for it.",
    off: "Needs an MSG91 key in the backend settings, and an approved SMS text for each message.",
  },
  whatsapp: {
    on: "Each message also needs its approved WhatsApp template before WhatsApp can be switched on for it.",
    off: "Needs a WhatsApp Business number connected through Meta, with an approved template for each message.",
  },
};

// the badge colours are shared with other pages, so each sending state borrows the closest one
const STATUS: Record<SendStatus, { label: string; tone: string }> = {
  SENT: { label: "Sent", tone: "SUCCESS" },
  FAILED: { label: "Failed", tone: "FAILED" },
  SKIPPED: { label: "Skipped", tone: "ARCHIVED" },
  QUEUED: { label: "Waiting", tone: "PENDING" },
};

/** Made-up values that show how a message will read. */
const EXAMPLES: Record<string, string> = {
  orderNumber: "DH261005-48213",
  total: "₹1,250",
  paymentMethod: "pay on delivery",
  items: "• Arnica Montana 30C (30 ml) × 2\n• Calendula Cream (25 g) × 1",
  address: "12 MG Road, Pune, Maharashtra, 411001",
  link: "https://dochomoeo.com/patient",
  courier: "Delhivery",
  trackingNumber: "1490 2210 5521",
  trackingLink: "https://www.delhivery.com/track/package/149022105521",
  reason: "Asked for by the customer",
  refundNote: "The ₹1,250 you paid will be refunded to your original payment method within 5 to 7 working days.",
  doctor: "Dr. Anjali Mehta",
  when: "Tue, 6 Oct, 11:30 am IST",
  mode: "Video call",
  appointmentNumber: "APT261006-4821",
  callLink: "https://meet.jit.si/dochomoeo-4821",
  fee: "₹500",
  patient: "Rahul Verma",
  problem: "Headaches that keep coming back",
  with: "Dr. Anjali Mehta",
  prescriptionNumber: "RX-10234",
  stream: "Homeopathy",
  nextStep: "Set your consultation fee and working hours to start taking patients.",
  decision: "We could not accept your registration as it stands.",
  score: "8 out of 10",
  level: "Silver",
  amount: "₹12,400",
  period: "1 Sep 2026 to 30 Sep 2026",
  reference: "UTR 3301 2245 9987",
  customer: "Priya Sharma",
  kind: "retail",
  city: "Pune",
  phone: "9876543210",
  what: "order",
  number: "DH261005-48213",
  outCount: "3",
  lowCount: "12",
  list: "• Arnica Montana 30C (30 ml): none left\n• Calendula Cream (25 g): 2 left",
};
const exampleName: Record<Audience, string> = { CUSTOMER: "Priya Sharma", PATIENT: "Priya Sharma", DOCTOR: "Dr. Anjali Mehta", STAFF: "team" };
/** Example values for just the placeholders a message has, so one it does not have stays visible in the preview. */
const examplesFor = (template: Template): Record<string, string> =>
  Object.fromEntries(template.placeholders.map((key) => [key, key === "name" ? exampleName[template.audience] : (EXAMPLES[key] ?? `[${key}]`)]));

const PLACEHOLDER = /{{\s*(\w+)\s*}}/g;
/** Fills the placeholders the way the server does; ones the message does not have are left showing. */
const fill = (text: string, values: Record<string, string>) =>
  text.replace(PLACEHOLDER, (whole, key: string) => values[key] ?? whole).replace(/\n{3,}/g, "\n\n").trim();
/** The placeholders of a text in the order they first appear. */
const placeholdersOf = (text: string) => [...new Set([...text.matchAll(PLACEHOLDER)].map((m) => m[1]))];

/** Shows web addresses in a preview the way the email shows them: as links. */
function WithLinks({ text }: { text: string }) {
  return (
    <>
      {text.split(/(https?:\/\/[^\s]+)/g).map((part, index) =>
        index % 2 === 1 ? <span key={index} className="break-all text-primary underline">{part}</span> : part,
      )}
    </>
  );
}

/** A plainer reason for the errors staff are most likely to meet. */
const friendlyReason = (error: string | null) => {
  if (!error) return null;
  if (/invalid login|username and password not accepted|535|534/i.test(error)) return "The email account refused the login. Check the email password in the backend settings (for Gmail, an app password).";
  if (/getaddrinfo|ECONNREFUSED|ETIMEDOUT|timeout/i.test(error)) return "Could not reach the sending service. It will be tried again.";
  return error;
};

/** Where in the admin the thing a message was about can be opened. */
const relatedOf = (row: LogRow): { label: string; href?: string } | null => {
  if (!row.relatedType) return null;
  const text = `${row.subject ?? ""}\n${row.body ?? ""}`;
  if (row.relatedType === "Order") {
    const number = text.match(/\bDH\d+-\d+\b/)?.[0];
    return { label: number ?? `Order #${row.relatedId}`, href: number ? `/admin/orders?q=${encodeURIComponent(number)}` : "/admin/orders" };
  }
  if (row.relatedType === "Appointment") {
    const number = text.match(/\bAPT\d+-\d+\b/)?.[0];
    return { label: number ?? `Appointment #${row.relatedId}`, href: number ? `/admin/appointments?q=${encodeURIComponent(number)}` : "/admin/appointments" };
  }
  if (row.relatedType === "DoctorProfile") return { label: "Doctor", href: row.relatedId ? `/admin/doctors/${row.relatedId}` : "/admin/doctors" };
  if (row.relatedType === "Prescription") return { label: "Prescription", href: "/admin/prescriptions" };
  if (row.relatedType === "DoctorPayout") return { label: "Doctor payout", href: "/admin/payouts" };
  if (row.relatedType === "Test") return { label: "Test message" };
  return { label: humanize(row.relatedType) };
};

const optional = <span className="font-normal text-muted-foreground">(optional)</span>;

// ─────────────────────────────────────────────────────────── Connection strip

function ConnectionStrip({ channels, problems = {}, lastSmsSentAt }: { channels: Channels | undefined; problems?: Problems; lastSmsSentAt?: string | null }) {
  return (
    <div className="mb-5 grid gap-3 md:grid-cols-3">
      {CHANNELS.map(({ key, label, icon: Icon }) => {
        const on = channels?.[key];
        const problem = on ? problems[key] : undefined;
        return (
          <Card key={key} className="py-4">
            <CardContent className="flex items-start gap-3 px-4">
              <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", on ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                <Icon className="size-4.5" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{label}</p>
                  {channels === undefined ? <Skeleton className="h-5 w-20" /> : <StatusBadge status={problem ? "FAILED" : on ? "SUCCESS" : "ARCHIVED"} label={problem ? "Not working" : on ? "Connected" : "Not connected"} />}
                </div>
                <p className={cn("mt-1 text-xs", problem ? "text-destructive" : "text-muted-foreground")}>{channels === undefined ? " " : problem ?? CONNECTION_HELP[key][on ? "on" : "off"]}</p>
                {key === "sms" && on && !problem && lastSmsSentAt ? <p className="mt-1 text-xs text-success">Last text message went out {formatDateTime(lastSmsSentAt)}.</p> : null}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────── Messages tab

function ChannelChips({ template, channels }: { template: Template; channels: Channels }) {
  return (
    <div className="flex flex-wrap gap-1">
      {CHANNELS.map(({ key, label, icon: Icon }) => {
        const on = template[`${key}Enabled`];
        const blocked = on && !channels[key];
        return (
          <span
            key={key}
            title={blocked ? `${label} is on, but not connected yet, so it is skipped` : `${label} is ${on ? "on" : "off"}`}
            className={cn(
              "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs",
              blocked ? "border-warning/40 bg-warning/10 text-warning" : on ? "border-primary/30 bg-primary/10 text-primary" : "border-transparent bg-muted text-muted-foreground/70",
            )}
          >
            <Icon className="size-3" />
            {label}
            <span className="sr-only">{on ? " on" : " off"}</span>
          </span>
        );
      })}
    </div>
  );
}

function Counts({ counts }: { counts: Template["last30Days"] }) {
  const part = (value: number, word: string, tone: string) => (
    <span className={value ? tone : "text-muted-foreground/70"}>{formatNumber(value)} {word}</span>
  );
  return (
    <div className="flex flex-wrap justify-end gap-x-2 text-xs ledger whitespace-nowrap">
      {part(counts.sent, "sent", "text-success")}
      {part(counts.failed, "failed", "text-destructive")}
      {part(counts.skipped, "skipped", "text-foreground")}
    </div>
  );
}

function MessagesTab({ data, onOpen, onStaffTab }: { data: TemplateList; onOpen: (event: string) => void; onStaffTab: () => void }) {
  const queryClient = useQueryClient();
  const toggle = useMutation({
    mutationFn: (input: { event: string; isActive: boolean }) =>
      api<Template>(`/admin/messages/templates/${encodeURIComponent(input.event)}`, { method: "PATCH", body: { isActive: input.isActive } }),
    onSuccess: (_saved, input) => {
      toast.success(`"${eventName(input.event)}" is ${input.isActive ? "switched on" : "switched off"}`);
      queryClient.invalidateQueries({ queryKey: ["message-templates"] });
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="grid gap-5">
      <p className="text-sm text-muted-foreground">
        Click a message to change its wording or the ways it is sent. Switch a message off to stop sending it altogether.
      </p>
      {GROUPS.map((group) => {
        const items = data.items.filter((t) => t.audience === group.audience);
        if (items.length === 0) return null;
        return (
          <Card key={group.audience} className="gap-0 overflow-hidden py-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3">
              <div>
                <h2 className="font-medium">{group.title}</h2>
                <p className="text-xs text-muted-foreground">{group.description}</p>
              </div>
              {group.audience === "STAFF" ? (
                <button type="button" onClick={onStaffTab} className="text-xs text-primary hover:underline">Choose who receives these</button>
              ) : null}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Message</TableHead>
                  <TableHead>Sent by</TableHead>
                  <TableHead className="text-right">Last 30 days</TableHead>
                  <TableHead className="w-20 pr-4 text-right">On</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((template) => {
                  const busy = toggle.isPending && toggle.variables?.event === template.event;
                  return (
                    <TableRow key={template.event} className={cn("cursor-pointer", !template.isActive && "text-muted-foreground")} onClick={() => onOpen(template.event)}>
                      <TableCell className="min-w-56 pl-4 whitespace-normal">
                        <div className="font-medium">{eventName(template.event)}</div>
                        {template.description ? <div className="max-w-xl text-xs text-muted-foreground">{template.description}</div> : null}
                      </TableCell>
                      <TableCell><ChannelChips template={template} channels={data.channels} /></TableCell>
                      <TableCell className="text-right"><Counts counts={template.last30Days} /></TableCell>
                      <TableCell className="pr-4 text-right" onClick={(event) => event.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          {busy ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
                          <Switch
                            checked={template.isActive}
                            disabled={busy}
                            aria-label={`Send "${eventName(template.event)}"`}
                            onCheckedChange={(isActive) => toggle.mutate({ event: template.event, isActive })}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────── Message editor

type Draft = {
  isActive: boolean;
  emailEnabled: boolean; emailSubject: string; emailBody: string;
  smsEnabled: boolean; smsTemplateId: string; smsText: string;
  whatsappEnabled: boolean; whatsappTemplate: string; whatsappLanguage: string; whatsappParams: string[];
};
type TextField = "emailSubject" | "emailBody" | "smsText";

const toDraft = (t: Template): Draft => ({
  isActive: t.isActive,
  emailEnabled: t.emailEnabled, emailSubject: t.emailSubject ?? "", emailBody: t.emailBody ?? "",
  smsEnabled: t.smsEnabled, smsTemplateId: t.smsTemplateId ?? "", smsText: t.smsText ?? "",
  whatsappEnabled: t.whatsappEnabled, whatsappTemplate: t.whatsappTemplate ?? "", whatsappLanguage: t.whatsappLanguage || "en", whatsappParams: t.whatsappParams,
});
const sameDraft = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b);

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "en_US", label: "English (US)" },
  { value: "en_GB", label: "English (UK)" },
  { value: "hi", label: "Hindi" },
];

function Section({ icon: Icon, title, hint, checked, onChecked, children }: {
  icon: typeof Mail; title: string; hint?: React.ReactNode; checked: boolean; onChecked: (on: boolean) => void; children: React.ReactNode;
}) {
  const id = `switch-${title.toLowerCase()}`;
  return (
    <section className="grid gap-3 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Icon className="mt-0.5 size-4 text-muted-foreground" />
          <div>
            <Label htmlFor={id} className="font-medium">Send by {title}</Label>
            {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
          </div>
        </div>
        <Switch id={id} checked={checked} onCheckedChange={onChecked} />
      </div>
      {children}
    </section>
  );
}

function PlaceholderChips({ placeholders, onPick, target }: { placeholders: string[]; onPick: (key: string) => void; target: string }) {
  return (
    <div className="grid gap-1.5">
      <p className="text-xs text-muted-foreground">Click a placeholder to add it to the {target} where the cursor is. It is replaced with the real value when the message is sent.</p>
      <div className="flex flex-wrap gap-1">
        {placeholders.map((key) => (
          <button
            key={key}
            type="button"
            // keeps the cursor where it is in the text box
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(key)}
            className="inline-flex h-6 items-center rounded-md border bg-muted/50 px-1.5 font-mono text-xs hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
          >
            {`{{${key}}}`}
          </button>
        ))}
      </div>
    </div>
  );
}

function TestDialog({ template, open, onOpenChange, dirty }: { template: Template; open: boolean; onOpenChange: (open: boolean) => void; dirty: boolean }) {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const send = useMutation({
    mutationFn: () => api<{ results: { channel: Channel; status: SendStatus; error: string | null }[] }>(
      `/admin/messages/templates/${encodeURIComponent(template.event)}/test`,
      { method: "POST", body: { email: email.trim() || undefined, phone: phone.replace(/\D/g, "").slice(-10) || undefined } },
    ),
    onError: (err) => toast.error(err.message),
  });
  const results = send.data?.results;
  const close = () => {
    onOpenChange(false);
    send.reset();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send a test</DialogTitle>
          <DialogDescription>
            Sends &ldquo;{eventName(template.event)}&rdquo; to you, filled with made-up values such as [name], on every way it is switched on for.
          </DialogDescription>
        </DialogHeader>
        <form id="test-form" className="grid gap-3" onSubmit={(e) => { e.preventDefault(); send.mutate(); }}>
          {dirty ? <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">You have changes that are not saved yet. The test uses the saved version.</p> : null}
          <div className="grid gap-1.5">
            <Label htmlFor="test-email">Email address {optional}</Label>
            <Input id="test-email" type="email" className="h-9" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="test-phone">Mobile number {optional}</Label>
            <Input id="test-phone" type="tel" inputMode="numeric" className="h-9" placeholder="10-digit mobile number" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <p className="text-xs text-muted-foreground">Used for SMS and WhatsApp, when they are on for this message.</p>
          </div>
        </form>
        {results ? (
          results.length === 0 ? (
            <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">Nothing was sent: this message is switched off, or none of its ways of sending are on.</p>
          ) : (
            <ul className="grid gap-2 rounded-md border p-3 text-sm">
              {results.map((result) => (
                <li key={result.channel} className="grid gap-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{CHANNEL_LABEL[result.channel]}</span>
                    <StatusBadge status={STATUS[result.status].tone} label={STATUS[result.status].label} />
                  </div>
                  {result.error ? <p className="text-xs text-muted-foreground">{friendlyReason(result.error)}</p> : null}
                </li>
              ))}
            </ul>
          )
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={close}>Close</Button>
          <Button type="submit" form="test-form" disabled={send.isPending || (!email.trim() && !phone.trim())}>
            {send.isPending ? <Spinner size="sm" /> : <Send />}
            Send test
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MessageEditor({ template, channels, onClose }: { template: Template; channels: Channels; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => toDraft(template));
  const [emailTarget, setEmailTarget] = useState<"emailSubject" | "emailBody">("emailBody");
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [testing, setTesting] = useState(false);
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const smsRef = useRef<HTMLTextAreaElement>(null);

  const dirty = !sameDraft(draft, toDraft(template));
  const set = (changes: Partial<Draft>) => setDraft((current) => ({ ...current, ...changes }));
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["message-templates"] });
  };

  /** Puts {{key}} where the cursor is in one of the text boxes, and keeps the cursor after it. */
  const insert = (field: TextField, key: string) => {
    const element = field === "emailSubject" ? subjectRef.current : field === "emailBody" ? bodyRef.current : smsRef.current;
    const token = `{{${key}}}`;
    const value = draft[field];
    const start = element?.selectionStart ?? value.length;
    const end = element?.selectionEnd ?? value.length;
    set({ [field]: value.slice(0, start) + token + value.slice(end) });
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const save = useMutation({
    mutationFn: () => api<Template>(`/admin/messages/templates/${encodeURIComponent(template.event)}`, { method: "PATCH", body: draft }),
    onSuccess: () => {
      toast.success(`"${eventName(template.event)}" saved`);
      refresh();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const reset = useMutation({
    mutationFn: () => api<Template>(`/admin/messages/templates/${encodeURIComponent(template.event)}/reset`, { method: "POST" }),
    onSuccess: (saved) => {
      toast.success("Wording put back to how it started");
      set({ emailSubject: saved.emailSubject ?? "", emailBody: saved.emailBody ?? "", smsText: saved.smsText ?? "" });
      setConfirmReset(false);
      refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  const known = new Set(template.placeholders);
  const unknown = [...new Set([...placeholdersOf(`${draft.emailSubject}\n${draft.emailBody}\n${draft.smsText}`), ...draft.whatsappParams])].filter((key) => !known.has(key));
  const examples = examplesFor(template);
  const smsVars = placeholdersOf(draft.smsText);
  const smsPreview = fill(draft.smsText, examples);
  const unusedForWhatsapp = template.placeholders.filter((key) => !draft.whatsappParams.includes(key));

  const moveParam = (index: number, by: number) => {
    const next = [...draft.whatsappParams];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item);
    set({ whatsappParams: next });
  };

  const close = () => (dirty ? setConfirmClose(true) : onClose());

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && close()}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-x-hidden overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{eventName(template.event)}</DialogTitle>
            <DialogDescription>{template.description}</DialogDescription>
          </DialogHeader>

          <form id="message-form" className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
            <div className="grid min-w-0 content-start gap-4">
              <label className="flex items-start justify-between gap-3 rounded-lg bg-muted/50 p-4 text-sm">
                <span>
                  <span className="font-medium">Send this message</span>
                  <span className="block text-xs text-muted-foreground">
                    {draft.isActive ? "Sent automatically on every way that is switched on below." : "Switched off: nothing is sent for it, on any channel."}
                  </span>
                </span>
                <Switch checked={draft.isActive} onCheckedChange={(isActive) => set({ isActive })} />
              </label>

              <Section
                icon={Mail} title="email" checked={draft.emailEnabled} onChecked={(emailEnabled) => set({ emailEnabled })}
                hint={channels.email ? "Write the email in plain words. Web addresses become links by themselves." : "Email is not connected yet, so emails are skipped until it is."}
              >
                <div className="grid gap-1.5">
                  <Label htmlFor="email-subject">Subject</Label>
                  <Input
                    id="email-subject" ref={subjectRef} className="h-9" maxLength={200} value={draft.emailSubject}
                    onFocus={() => setEmailTarget("emailSubject")} onChange={(e) => set({ emailSubject: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="email-body">Message</Label>
                  <Textarea
                    id="email-body" ref={bodyRef} rows={12} maxLength={5000} className="min-h-56 font-mono text-[13px] leading-relaxed" value={draft.emailBody}
                    onFocus={() => setEmailTarget("emailBody")} onChange={(e) => set({ emailBody: e.target.value })}
                  />
                </div>
                <PlaceholderChips placeholders={template.placeholders} target={emailTarget === "emailSubject" ? "subject" : "message"} onPick={(key) => insert(emailTarget, key)} />
              </Section>

              <Section
                icon={Smartphone} title="SMS" checked={draft.smsEnabled} onChecked={(smsEnabled) => set({ smsEnabled })}
                hint={
                  channels.sms
                    ? "In India every SMS text must be approved before it can be sent. Get the text below approved in MSG91, then paste the template id MSG91 gives it."
                    : "SMS is not connected yet, so SMS messages are skipped until it is."
                }
              >
                <div className="grid gap-1.5">
                  <Label htmlFor="sms-id">MSG91 template id</Label>
                  <Input id="sms-id" className="h-9 font-mono" maxLength={80} placeholder="For example 64f1c2a9d6fc0539a2b1e3f4" value={draft.smsTemplateId} onChange={(e) => set({ smsTemplateId: e.target.value })} />
                  {draft.smsEnabled && !draft.smsTemplateId.trim() ? <p className="text-xs text-destructive">Enter the template id before switching SMS on.</p> : null}
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="sms-text">Approved SMS text</Label>
                  <Textarea id="sms-text" ref={smsRef} rows={3} maxLength={500} className="font-mono text-[13px]" value={draft.smsText} onChange={(e) => set({ smsText: e.target.value })} />
                  <p className="text-xs text-muted-foreground">
                    Keep this exactly as approved. Its placeholders are sent in the order they appear
                    {smsVars.length ? <>: {smsVars.map((key, index) => <span key={key} className="font-mono">{index ? ", " : ""}var{index + 1} = {key}</span>)}</> : null}.
                  </p>
                </div>
                <PlaceholderChips placeholders={template.placeholders} target="SMS text" onPick={(key) => insert("smsText", key)} />
              </Section>

              <Section
                icon={MessageCircle} title="WhatsApp" checked={draft.whatsappEnabled} onChecked={(whatsappEnabled) => set({ whatsappEnabled })}
                hint={
                  channels.whatsapp
                    ? "WhatsApp only sends messages from templates it has approved. Enter the template name, and which values fill its {{1}}, {{2}} and so on."
                    : "WhatsApp is not connected yet, so WhatsApp messages are skipped until it is."
                }
              >
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
                  <div className="grid gap-1.5">
                    <Label htmlFor="wa-template">Template name</Label>
                    <Input
                      id="wa-template" className="h-9 font-mono" maxLength={120} placeholder="order_placed" value={draft.whatsappTemplate}
                      onChange={(e) => set({ whatsappTemplate: e.target.value.toLowerCase().replace(/[\s-]+/g, "_") })}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Language</Label>
                    <Select value={draft.whatsappLanguage} onValueChange={(whatsappLanguage) => set({ whatsappLanguage })}>
                      <SelectTrigger className="h-9 w-full" aria-label="Template language"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {LANGUAGES.some((l) => l.value === draft.whatsappLanguage) ? null : <SelectItem value={draft.whatsappLanguage}>{draft.whatsappLanguage}</SelectItem>}
                        {LANGUAGES.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {draft.whatsappEnabled && !draft.whatsappTemplate.trim() ? <p className="text-xs text-destructive">Enter the template name before switching WhatsApp on.</p> : null}
                <div className="grid gap-1.5">
                  <Label>Values for the template, in order</Label>
                  {draft.whatsappParams.length === 0 ? <p className="text-xs text-muted-foreground">None. Add one for each {"{{1}}"}, {"{{2}}"}… in the approved template.</p> : null}
                  <ol className="grid gap-1.5">
                    {draft.whatsappParams.map((key, index) => (
                      <li key={`${key}-${index}`} className="flex items-center gap-2">
                        <span className="w-10 shrink-0 font-mono text-xs text-muted-foreground">{`{{${index + 1}}}`}</span>
                        <Select value={key} onValueChange={(value) => set({ whatsappParams: draft.whatsappParams.map((k, i) => (i === index ? value : k)) })}>
                          <SelectTrigger size="sm" className="min-w-0 flex-1 font-mono" aria-label={`Value for {{${index + 1}}}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {known.has(key) ? null : <SelectItem value={key}>{key}</SelectItem>}
                            {template.placeholders.map((p) => <SelectItem key={p} value={p} className="font-mono">{p}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Button type="button" variant="ghost" size="icon-sm" aria-label="Move up" disabled={index === 0} onClick={() => moveParam(index, -1)}><ArrowUp /></Button>
                        <Button type="button" variant="ghost" size="icon-sm" aria-label="Move down" disabled={index === draft.whatsappParams.length - 1} onClick={() => moveParam(index, 1)}><ArrowDown /></Button>
                        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove {{${index + 1}}}`} onClick={() => set({ whatsappParams: draft.whatsappParams.filter((_k, i) => i !== index) })}><X /></Button>
                      </li>
                    ))}
                  </ol>
                  {draft.whatsappParams.length < 10 ? (
                    <Select value="" onValueChange={(value) => set({ whatsappParams: [...draft.whatsappParams, value] })}>
                      <SelectTrigger size="sm" className="w-fit" aria-label="Add a value"><Plus /> <span>Add a value</span></SelectTrigger>
                      <SelectContent>
                        {[...unusedForWhatsapp, ...template.placeholders.filter((key) => !unusedForWhatsapp.includes(key))].map((p) => (
                          <SelectItem key={p} value={p} className="font-mono">{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}
                </div>
              </Section>
            </div>

            <aside className="grid min-w-0 content-start gap-4 lg:sticky lg:top-0 lg:self-start">
              {unknown.length ? (
                <p className="flex gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <CircleAlert className="size-4 shrink-0" />
                  <span>This message has no {unknown.map((key) => `{{${key}}}`).join(", ")}. Use only the placeholders listed under the text.</span>
                </p>
              ) : null}
              <div className="grid gap-1.5">
                <h3 className="text-[0.6875rem]/none font-semibold tracking-[0.12em] text-muted-foreground uppercase">Email preview</h3>
                <div className={cn("overflow-hidden rounded-lg border bg-background", !draft.emailEnabled && "opacity-60")}>
                  <div className="border-b px-4 py-2.5">
                    <p className="text-xs text-muted-foreground">Subject</p>
                    <p className="font-medium wrap-anywhere">{fill(draft.emailSubject, examples) || <span className="text-muted-foreground">No subject</span>}</p>
                  </div>
                  <div className="px-4 py-2.5 text-base font-bold text-primary">DocHomoeo</div>
                  <div className="max-h-96 overflow-y-auto px-4 pb-4 text-sm leading-relaxed wrap-anywhere whitespace-pre-wrap">
                    {draft.emailBody.trim() ? <WithLinks text={fill(draft.emailBody, examples)} /> : <span className="text-muted-foreground">No message</span>}
                  </div>
                  <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">This is an automatic message from DocHomoeo. Please do not share any code or password with anyone.</p>
                </div>
                <p className="text-xs text-muted-foreground">Filled with made-up example values.{draft.emailEnabled ? "" : " Email is off for this message."}</p>
              </div>
              <div className="grid gap-1.5">
                <h3 className="text-[0.6875rem]/none font-semibold tracking-[0.12em] text-muted-foreground uppercase">SMS preview</h3>
                <div className={cn("rounded-lg border bg-muted/40 px-3 py-2.5 text-sm wrap-anywhere whitespace-pre-wrap", !draft.smsEnabled && "opacity-60")}>
                  {smsPreview || <span className="text-muted-foreground">No SMS text</span>}
                </div>
                <p className="text-xs text-muted-foreground">{formatNumber(smsPreview.length)} characters{draft.smsEnabled ? "" : ". SMS is off for this message."}</p>
              </div>
              {draft.whatsappParams.length ? (
                <div className="grid gap-1.5">
                  <h3 className="text-[0.6875rem]/none font-semibold tracking-[0.12em] text-muted-foreground uppercase">WhatsApp values</h3>
                  <dl className={cn("grid gap-1 rounded-lg border px-3 py-2.5 text-xs", !draft.whatsappEnabled && "opacity-60")}>
                    {draft.whatsappParams.map((key, index) => (
                      <div key={`${key}-${index}`} className="flex gap-2">
                        <dt className="w-10 shrink-0 font-mono text-muted-foreground">{`{{${index + 1}}}`}</dt>
                        <dd className="min-w-0 wrap-anywhere">{examples[key] ?? key}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null}
            </aside>
          </form>

          {/* stays in view while the long form scrolls; -bottom-4 makes up for the dialog's padding */}
          <DialogFooter className="sticky -bottom-4 z-10 bg-muted sm:justify-between">
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={() => setConfirmReset(true)}><RotateCcw /> Reset wording</Button>
              <Button type="button" variant="outline" onClick={() => setTesting(true)}><Send /> Send a test</Button>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={close}>Cancel</Button>
              <Button type="submit" form="message-form" loading={save.isPending} disabled={!dirty}>Save changes
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset the wording?</DialogTitle>
            <DialogDescription>
              The email subject, the email message and the SMS text go back to how they were at the start, straight away. Which ways it is sent by, the SMS template id and the WhatsApp settings stay as they are.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmReset(false)}>Cancel</Button>
            <Button disabled={reset.isPending} onClick={() => reset.mutate()}>
              {reset.isPending ? <ButtonSpinner /> : null}Reset wording
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmClose} onOpenChange={setConfirmClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close without saving?</DialogTitle>
            <DialogDescription>The changes you made to this message will be lost.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmClose(false)}>Keep editing</Button>
            <Button variant="destructive" onClick={onClose}>Close without saving</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TestDialog template={template} open={testing} onOpenChange={setTesting} dirty={dirty} />
    </>
  );
}

// ─────────────────────────────────────────────────────────── Sent log tab

function LogDetails({ row, onClose, onResend, resending }: { row: LogRow | null; onClose: () => void; onResend: (row: LogRow) => void; resending: boolean }) {
  const related = row ? relatedOf(row) : null;
  return (
    <Sheet open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-xl">
        {row ? (
          <>
            <SheetHeader className="border-b">
              <SheetTitle className="flex flex-wrap items-center gap-2">
                {eventName(row.event)}
                <StatusBadge status={STATUS[row.status].tone} label={STATUS[row.status].label} />
              </SheetTitle>
              <SheetDescription>{CHANNEL_LABEL[row.channel]} to {row.recipient ?? "nobody (no address)"} · {formatDateTime(row.createdAt)}</SheetDescription>
            </SheetHeader>
            <div className="grid gap-5 p-4 text-sm">
              {row.error ? (
                <section className="grid gap-1 rounded-lg bg-muted/60 p-3">
                  <h3 className="text-[0.6875rem]/none font-semibold tracking-[0.12em] text-muted-foreground uppercase">{row.status === "SKIPPED" ? "Why it was skipped" : "Why it failed"}</h3>
                  <p>{friendlyReason(row.error)}</p>
                  {friendlyReason(row.error) !== row.error ? <p className="text-xs wrap-anywhere whitespace-pre-wrap text-muted-foreground">{row.error}</p> : null}
                </section>
              ) : null}
              <dl className="grid grid-cols-2 gap-3">
                <div><dt className="text-xs text-muted-foreground">Tries</dt><dd className="mt-0.5 ledger">{formatNumber(row.attempts)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Sent at</dt><dd className="mt-0.5">{row.sentAt ? formatDateTime(row.sentAt) : "—"}</dd></div>
                {related ? (
                  <div className="col-span-2">
                    <dt className="text-xs text-muted-foreground">About</dt>
                    <dd className="mt-0.5">{related.href ? <Link href={related.href} className="text-primary hover:underline">{related.label}</Link> : related.label}</dd>
                  </div>
                ) : null}
              </dl>
              {row.subject ? (
                <section>
                  <h3 className="mb-1 text-[0.6875rem]/none font-semibold tracking-[0.12em] text-muted-foreground uppercase">Subject</h3>
                  <p className="font-medium wrap-anywhere">{row.subject}</p>
                </section>
              ) : null}
              <section>
                <h3 className="mb-1 text-[0.6875rem]/none font-semibold tracking-[0.12em] text-muted-foreground uppercase">{row.channel === "EMAIL" ? "Message" : "Text"}</h3>
                <div className="rounded-lg border p-3 leading-relaxed wrap-anywhere whitespace-pre-wrap">{row.body ? <WithLinks text={row.body} /> : <span className="text-muted-foreground">Empty</span>}</div>
                {row.channel === "WHATSAPP" ? <p className="mt-1 text-xs text-muted-foreground">WhatsApp sends its own approved template; this is the SMS wording, for reference.</p> : null}
              </section>
              {(row.status === "FAILED" || row.status === "SKIPPED") && row.recipient ? (
                <Button className="w-fit" disabled={resending} onClick={() => onResend(row)}>
                  {resending ? <Spinner size="sm" /> : <Send />}
                  Send again
                </Button>
              ) : null}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function LogTab({ templates }: { templates: Template[] }) {
  const url = useUrlState();
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<number | null>(null);

  const filters = {
    q: url.get("q"), status: url.get("status"), channel: url.get("channel"), event: url.get("event"),
    page: url.get("page") || "1", pageSize: url.get("pageSize") || "20",
  };
  const hasFilters = Boolean(filters.q || filters.status || filters.channel || filters.event);
  const { data, isPending, isError } = useQuery({
    queryKey: ["message-log", filters],
    queryFn: () => api<LogList>("/admin/messages/log", { query: filters }),
    placeholderData: (previous) => previous,
  });

  const resend = useMutation({
    mutationFn: (row: LogRow) => api<LogRow>(`/admin/messages/log/${row.id}/resend`, { method: "POST" }),
    onSuccess: (message) => {
      if (message.status === "SENT") toast.success("Sent");
      else toast.error(`Not sent: ${friendlyReason(message.error) ?? STATUS[message.status].label}`);
      queryClient.invalidateQueries({ queryKey: ["message-log"] });
      queryClient.invalidateQueries({ queryKey: ["message-templates"] });
    },
    onError: (err) => toast.error(err.message),
  });

  const open = data?.items.find((row) => row.id === openId) ?? null;
  const selection = useSelection((data?.items ?? []).map((row) => row.id));
  const week = data?.last7Days ?? {};
  const eventOptions = templates.map((t) => ({ value: t.event, label: eventName(t.event), hint: GROUPS.find((g) => g.audience === t.audience)?.title }));

  return (
    <>
      <p className="mb-3 text-sm text-muted-foreground">
        In the last 7 days:{" "}
        {(["SENT", "FAILED", "SKIPPED", "QUEUED"] as SendStatus[]).map((status, index) => (
          <span key={status}>
            {index ? " · " : ""}
            <button type="button" className="ledger hover:text-foreground hover:underline" onClick={() => url.set({ status })}>
              {formatNumber(week[status] ?? 0)} {STATUS[status].label.toLowerCase()}
            </button>
          </span>
        ))}
      </p>

      <SectionCard flush>
        <div className="flex flex-wrap items-center gap-2 border-b border-foreground/18 bg-surface-2 px-3 py-2">
          <SearchInput value={filters.q} onChange={(q) => url.set({ q })} placeholder="Email, mobile number or words in the message" className="w-full sm:w-80" />
          <Select value={filters.status || "all"} onValueChange={(v) => url.set({ status: v === "all" ? "" : v })}>
            <SelectTrigger className="h-9 w-36" aria-label="Status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any status</SelectItem>
              {(["SENT", "FAILED", "SKIPPED", "QUEUED"] as SendStatus[]).map((s) => <SelectItem key={s} value={s}>{STATUS[s].label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.channel || "all"} onValueChange={(v) => url.set({ channel: v === "all" ? "" : v })}>
            <SelectTrigger className="h-9 w-36" aria-label="Sent by"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All channels</SelectItem>
              {CHANNELS.map((c) => <SelectItem key={c.channel} value={c.channel}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Combobox value={filters.event} onChange={(event) => url.set({ event })} options={eventOptions} allLabel="All messages" searchPlaceholder="Find a message…" className="w-56" />
          {hasFilters ? <Button variant="ghost" className="h-9" onClick={() => url.set({ q: "", status: "", channel: "", event: "" })}>Clear filters</Button> : null}
          <BulkActions table="messages/log" noun="messages" selection={selection} exportable={false} refresh={["message-log", "message-templates"]} deleteNote="This only clears them from this list; nothing is unsent. Messages still waiting to be sent are kept." />
        </div>

        {isError ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Could not load the sent messages. Check that the backend is running.</p>
        ) : isPending || !data ? (
          <div className="grid gap-2 p-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : data.items.length === 0 ? (
          <EmptyState
            icon={MessagesSquare}
            title={hasFilters ? "No messages match" : "Nothing sent yet"}
            description={hasFilters ? "Try a different search, or clear the filters." : "Every automatic message the shop sends, or could not send, will be listed here."}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 pl-4"><SelectPage selection={selection} noun="messages" /></TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>About</TableHead>
                <TableHead className="w-24 pr-4"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((row) => {
                const related = relatedOf(row);
                const reason = friendlyReason(row.error);
                const busy = resend.isPending && resend.variables?.id === row.id;
                return (
                  <DataTableRow key={row.id} selected={selection.has(row.id)} onOpen={() => setOpenId(row.id)}>
                    <TableCell className="pl-4"><SelectRow selection={selection} id={row.id} label={`${eventName(row.event)} to ${row.recipient ?? "no address"}`} /></TableCell>
                    <TableCell className="text-muted-foreground">{formatDateTime(row.createdAt)}</TableCell>
                    <TableCell>
                      <div className="font-medium">{eventName(row.event)}</div>
                      <div className="text-xs text-muted-foreground">{CHANNEL_LABEL[row.channel]}</div>
                    </TableCell>
                    <TableCell className="max-w-56 truncate">{row.recipient ?? <span className="text-muted-foreground">No address</span>}</TableCell>
                    <TableCell className="min-w-56 whitespace-normal">
                      <StatusBadge status={STATUS[row.status].tone} label={STATUS[row.status].label} />
                      {reason && row.status !== "SENT" ? <div className="mt-1 line-clamp-2 max-w-72 text-xs text-muted-foreground" title={row.error ?? undefined}>{reason}</div> : null}
                    </TableCell>
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      {related ? (related.href ? <Link href={related.href} className="text-primary hover:underline">{related.label}</Link> : <span className="text-muted-foreground">{related.label}</span>) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="pr-4 text-right" onClick={(event) => event.stopPropagation()}>
                      {(row.status === "FAILED" || row.status === "SKIPPED") && row.recipient ? (
                        <Button variant="outline" size="sm" disabled={busy} onClick={() => resend.mutate(row)}>
                          {busy ? <Spinner size="sm" /> : null}
                          Resend
                        </Button>
                      ) : null}
                    </TableCell>
                  </DataTableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {data ? (
          <PaginationBar
            page={data.page} pageCount={data.pageCount} pageSize={data.pageSize} total={data.total} noun="messages"
            onPage={(page) => url.set({ page })} onPageSize={(pageSize) => url.set({ pageSize })}
          />
        ) : null}
      </SectionCard>
      <p className="mt-3 text-xs text-muted-foreground">Messages that fail are tried again by themselves a few times. Skipped ones were not sent on purpose, for example because that way of sending is not connected or the person has no email address.</p>

      <LogDetails row={open} onClose={() => setOpenId(null)} onResend={(row) => resend.mutate(row)} resending={resend.isPending} />
    </>
  );
}

// ─────────────────────────────────────────────────────────── Staff alerts tab

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cleanPhone = (value: string) => value.replace(/\D/g, "").replace(/^(91|0)(?=\d{10}$)/, "");

function ChipList({ id, label, hint, items, onChange, placeholder, inputMode, check }: {
  id: string; label: string; hint: string; items: string[]; onChange: (items: string[]) => void; placeholder: string;
  inputMode: "email" | "tel"; check: (value: string) => { value: string } | { error: string };
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const add = () => {
    if (!text.trim()) return;
    const result = check(text);
    if ("error" in result) return setError(result.error);
    if (items.includes(result.value)) return setError("This is already in the list.");
    if (items.length >= 10) return setError("You can add up to 10.");
    onChange([...items, result.value]);
    setText("");
    setError("");
  };
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <p className="-mt-1 text-xs text-muted-foreground">{hint}</p>
      {items.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <li key={item} className="inline-flex h-7 items-center gap-1 rounded-full border bg-muted/50 pr-1 pl-3 text-sm">
              {item}
              <button type="button" aria-label={`Remove ${item}`} onClick={() => onChange(items.filter((i) => i !== item))} className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex max-w-md gap-2">
        <Input
          id={id} className="h-9" type={inputMode === "email" ? "email" : "tel"} inputMode={inputMode} placeholder={placeholder} value={text} aria-invalid={error ? true : undefined}
          onChange={(e) => { setText(e.target.value); setError(""); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }}
        />
        <Button type="button" variant="outline" className="h-9" onClick={add}><Plus /> Add</Button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function StaffForm({ settings }: { settings: StaffSettings }) {
  const queryClient = useQueryClient();
  const [emails, setEmails] = useState(settings.emails);
  const [phones, setPhones] = useState(settings.phones);
  const dirty = JSON.stringify(emails) !== JSON.stringify(settings.emails) || JSON.stringify(phones) !== JSON.stringify(settings.phones);

  const save = useMutation({
    mutationFn: () => api("/admin/messages/settings", { method: "PUT", body: { emails, phones } }),
    onSuccess: () => {
      toast.success("Staff alert list saved");
      queryClient.invalidateQueries({ queryKey: ["message-settings"] });
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Who receives staff alerts</CardTitle>
        <CardDescription>New orders, doctors waiting to be verified, refunds to make, delivery problems and the daily stock check. Which of these are sent, and how, is set in the Messages tab.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <div className="grid gap-3">
          <ChipList
            id="staff-email" label="Email addresses" hint="Up to 10." placeholder="name@example.com" inputMode="email" items={emails} onChange={setEmails}
            check={(value) => (EMAIL.test(value.trim()) ? { value: value.trim().toLowerCase() } : { error: "Enter a valid email address." })}
          />
          {emails.length === 0 ? (
            <div className="flex max-w-2xl gap-2 rounded-lg bg-info/10 p-3 text-sm">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-info" />
              <div>
                <p>No addresses chosen, so staff alerts go to the admins who have signed in here:</p>
                {settings.fallbackEmails.length ? (
                  <p className="mt-1 text-muted-foreground">{settings.fallbackEmails.join(", ")}</p>
                ) : (
                  <p className="mt-1 text-muted-foreground">There are no admins with an email address yet, so no staff emails are sent.</p>
                )}
              </div>
            </div>
          ) : null}
        </div>

        <ChipList
          id="staff-phone" label="Mobile numbers" placeholder="10-digit mobile number" inputMode="tel" items={phones} onChange={setPhones}
          hint={`They get the SMS or WhatsApp version, when it is switched on for a staff message.${settings.channels.sms || settings.channels.whatsapp ? "" : " SMS and WhatsApp are not connected yet."}`}
          check={(value) => (/^[6-9]\d{9}$/.test(cleanPhone(value)) ? { value: cleanPhone(value) } : { error: "Enter a 10-digit Indian mobile number." })}
        />

        <div className="flex gap-2">
          <Button disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <ButtonSpinner /> : null}Save
          </Button>
          {dirty ? <Button variant="ghost" onClick={() => { setEmails(settings.emails); setPhones(settings.phones); }}>Undo changes</Button> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function StaffTab() {
  const { data, isPending, isError } = useQuery({ queryKey: ["message-settings"], queryFn: () => api<StaffSettings>("/admin/messages/settings") });
  if (isError) return <p className="py-16 text-center text-sm text-muted-foreground">Could not load the staff alert list. Check that the backend is running.</p>;
  if (isPending) return <Skeleton className="h-72" />;
  // a fresh form whenever the saved list changes
  return <StaffForm key={JSON.stringify([data.emails, data.phones])} settings={data} />;
}

// ─────────────────────────────────────────────────────────── Page

const TABS = [
  { value: "messages", label: "Messages" },
  { value: "log", label: "Sent log" },
  { value: "staff", label: "Staff alerts" },
];

function MessagesView() {
  const url = useUrlState();
  const tab = TABS.some((t) => t.value === url.get("tab")) ? url.get("tab") : "messages";
  const [editing, setEditing] = useState<string | null>(null);

  const { data, isPending, isError } = useQuery({ queryKey: ["message-templates"], queryFn: () => api<TemplateList>("/admin/messages/templates") });
  const editingTemplate = data?.items.find((t) => t.event === editing);

  const switchTab = (next: string) => url.set({ tab: next === "messages" ? "" : next });

  return (
    <>
      <PageHeader title="Automatic messages" description="Emails, SMS and WhatsApp messages sent by themselves when something happens, like an order being placed" />

      <ConnectionStrip channels={data?.channels} problems={data?.problems} lastSmsSentAt={data?.lastSmsSentAt} />

      <Tabs value={tab} onValueChange={switchTab} className="gap-4">
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList className="w-max">
            {TABS.map((item) => <TabsTrigger key={item.value} value={item.value} className="px-3">{item.label}</TabsTrigger>)}
          </TabsList>
        </div>

        <TabsContent value="messages">
          {isError ? (
            <p className="py-16 text-center text-sm text-muted-foreground">Could not load the messages. Check that the backend is running.</p>
          ) : isPending ? (
            <div className="grid gap-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-14" />)}</div>
          ) : (
            <MessagesTab data={data} onOpen={setEditing} onStaffTab={() => switchTab("staff")} />
          )}
        </TabsContent>
        <TabsContent value="log">
          <LogTab templates={data?.items ?? []} />
        </TabsContent>
        <TabsContent value="staff">
          <StaffTab />
        </TabsContent>
      </Tabs>

      {editingTemplate && data ? (
        <MessageEditor key={editingTemplate.event} template={editingTemplate} channels={data.channels} onClose={() => setEditing(null)} />
      ) : null}
    </>
  );
}

export default function MessagesPage() {
  return (
    <Suspense>
      <MessagesView />
    </Suspense>
  );
}
