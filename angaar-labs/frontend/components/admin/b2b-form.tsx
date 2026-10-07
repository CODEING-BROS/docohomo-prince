"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileText } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Combobox } from "@/components/admin/combobox";
import { type DocumentDraft, DocumentsField } from "@/components/admin/documents-field";
import { StatusBadge } from "@/components/admin/parts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { DOCUMENT_LABEL } from "@/lib/doctor";
import { humanize } from "@/lib/format";
import { STATE_OPTIONS } from "@/lib/india";
import type { PriceTier, VerificationStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const DOCUMENT_KINDS = [
  { type: "REGISTRATION_CERTIFICATE", label: "Medical registration certificate", hint: "From the state council or NCH. PDF or photo, up to 5 MB", required: true },
  { type: "DEGREE_CERTIFICATE", label: "Degree certificate", hint: "BHMS, MD (Hom) or equivalent" },
  { type: "GOVERNMENT_ID", label: "Government photo ID", hint: "Aadhaar, PAN card, passport or driving licence" },
  { type: "CLINIC_PROOF", label: "Clinic proof", hint: "Clinic registration, letterhead or a photo of the board" },
  { type: "GST_CERTIFICATE", label: "GST certificate", hint: "Only if the practice is GST registered" },
  { type: "DRUG_LICENSE", label: "Drug licence", hint: "Only if they hold one" },
];

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export type B2BBusinessType = "DOCTOR" | "CLINIC" | "RETAILER" | "WHOLESALER" | "DISTRIBUTOR";

const BUSINESS_TYPES: { value: B2BBusinessType; label: string }[] = [
  { value: "DOCTOR", label: "Doctor" },
  { value: "CLINIC", label: "Clinic" },
  { value: "RETAILER", label: "Pharmacy or medical store" },
  { value: "WHOLESALER", label: "Wholesaler" },
  { value: "DISTRIBUTOR", label: "Distributor" },
];

export const B2B_STATUS_LABEL: Partial<Record<VerificationStatus, string>> = {
  PENDING: "New application", UNDER_REVIEW: "Under review", APPROVED: "Active", SUSPENDED: "Paused", REJECTED: "Rejected",
};

type Decision = "UNDER_REVIEW" | "APPROVED" | "SUSPENDED" | "REJECTED";

// what choosing each status does, in the words used on the B2B customers page
const DECISIONS: { value: Decision; hint: string }[] = [
  { value: "UNDER_REVIEW", hint: "Their details are being checked. They pay retail prices for now." },
  { value: "APPROVED", hint: "They can buy at wholesale prices." },
  { value: "SUSPENDED", hint: "They keep their account but pay retail prices until you resume access." },
  { value: "REJECTED", hint: "The doctor is told why, so they can fix it and apply again." },
];

/** A B2B account as the backend returns it for editing. */
export type B2BAccountDetail = {
  id: number; type: B2BBusinessType; status: VerificationStatus; rejectionReason: string | null;
  doctorName: string; phone: string | null; email: string | null; qualification: string | null;
  registrationNumber: string | null; registrationCouncil: string | null;
  businessName: string; addressLine: string | null; city: string | null; state: string | null; pincode: string | null;
  gstNumber: string | null; panNumber: string | null; drugLicenseNumber: string | null;
  priceTierId: number | null; creditLimit: number; creditDays: number; notes: string | null;
  documents: { id: number; type: string; fileUrl: string; fileName: string | null; status: string }[];
};

export type B2BDraft = {
  doctorName: string; phone: string; email: string; qualification: string;
  registrationNumber: string; registrationCouncil: string;
  businessName: string; type: B2BBusinessType; addressLine: string; city: string; state: string; pincode: string;
  gstNumber: string; panNumber: string; drugLicenseNumber: string;
  priceTierId: string; creditLimit: string; creditDays: string; notes: string;
};

export const emptyB2B: B2BDraft = {
  doctorName: "", phone: "", email: "", qualification: "",
  registrationNumber: "", registrationCouncil: "",
  businessName: "", type: "DOCTOR", addressLine: "", city: "", state: "", pincode: "",
  gstNumber: "", panNumber: "", drugLicenseNumber: "",
  priceTierId: "", creditLimit: "0", creditDays: "0", notes: "",
};

function Field({ label, hint, error, className, children }: { label: string; hint?: string; error?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Add a B2B customer by hand, or edit one. `account` is the saved account when editing. */
export function B2BForm({ initial, account }: { initial: B2BDraft; account?: B2BAccountDetail }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(initial);
  const [documents, setDocuments] = useState<DocumentDraft[]>([]);
  const [approveNow, setApproveNow] = useState(false);
  // editing: the status starts as it is saved; choosing another one is a decision and may need a reason
  const [status, setStatus] = useState<VerificationStatus>(account?.status ?? "PENDING");
  const [reason, setReason] = useState("");
  const set = <K extends keyof B2BDraft>(key: K, value: B2BDraft[K]) => setForm((current) => ({ ...current, [key]: value }));

  const isNew = !account;
  const { data: tierData } = useQuery({ queryKey: ["b2b-tiers"], queryFn: () => api<{ tiers: PriceTier[] }>("/admin/b2b/tiers") });
  const tiers = tierData?.tiers ?? [];

  const gst = form.gstNumber.trim().toUpperCase();
  const pan = form.panNumber.trim().toUpperCase();
  const gstError = gst && !GSTIN.test(gst) ? "A GST number has 15 characters, like 22AAAAA0000A1Z5" : undefined;
  const panError = pan && !PAN.test(pan) ? "A PAN has 10 characters, like ABCDE1234F" : undefined;
  const hasCertificate = documents.some((doc) => doc.type === "REGISTRATION_CERTIFICATE");
  // the same choices the B2B customers page offers: an active account can be paused, any other can be rejected
  const decisions = DECISIONS.filter((d) =>
    d.value === account?.status
    || (d.value === "UNDER_REVIEW" ? account?.status === "PENDING" : d.value === "SUSPENDED" ? account?.status === "APPROVED" : d.value === "REJECTED" ? account?.status !== "APPROVED" : true));
  const statusChanged = !isNew && status !== account.status;
  const needsReason = statusChanged && (status === "REJECTED" || status === "SUSPENDED");

  const save = useMutation({
    mutationFn: () => {
      const { phone, priceTierId, type, ...details } = form;
      const shared = { ...details, gstNumber: gst, panNumber: pan, creditLimit: Number(form.creditLimit || 0), creditDays: Number(form.creditDays || 0) };
      if (isNew) {
        return api<{ id: number; attachedToExistingCustomer?: boolean }>("/admin/b2b", {
          method: "POST",
          body: { ...shared, phone, priceTierId: priceTierId ? Number(priceTierId) : null, approveNow, documents },
        });
      }
      return api<{ id: number; attachedToExistingCustomer?: boolean }>(`/admin/b2b/${account.id}`, {
        method: "PATCH",
        body: {
          ...shared, type,
          ...(priceTierId ? { priceTierId: Number(priceTierId) } : {}),
          ...(statusChanged ? { status, reason: reason.trim() || undefined } : {}),
        },
      });
    },
    onSuccess: (result) => {
      if (isNew) {
        toast.success(approveNow ? "B2B customer added and approved" : "B2B customer added. It is waiting for approval.");
        if (result.attachedToExistingCustomer) toast.info("This mobile number already had a customer account, so the B2B account was added to it.");
      } else {
        toast.success("B2B customer saved");
      }
      ["b2b", "b2b-account", "b2b-tiers", "customers", "dashboard", "notifications"].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
      router.push("/admin/b2b");
    },
    onError: (err) => toast.error(err.message),
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (gstError || panError) return toast.error("Fix the highlighted fields first");
    if (!form.state) return toast.error("Choose the state");
    if (isNew && approveNow && !hasCertificate) return toast.error("Upload the registration certificate before approving, or untick “Approve now”");
    if (needsReason && !reason.trim()) return toast.error(status === "REJECTED" ? "Give a reason for rejecting" : "Give a reason for pausing");
    save.mutate();
  };

  return (
    <form onSubmit={submit}>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Back to B2B customers"><Link href="/admin/b2b"><ArrowLeft /></Link></Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold tracking-tight">{isNew ? "Add B2B customer" : "Edit B2B customer"}</h1>
          <p className="text-sm text-muted-foreground">A doctor who {isNew ? "will buy" : "buys"} at wholesale prices. Their registration is what makes them eligible.</p>
        </div>
        <Button asChild variant="outline" className="h-9"><Link href="/admin/b2b">Cancel</Link></Button>
        <Button type="submit" className="h-9" loading={save.isPending}>{isNew ? "Add B2B customer" : "Save changes"}
        </Button>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-3">
        <div className="grid min-w-0 gap-4 xl:col-span-2">
          <Card>
            <CardHeader><CardTitle>Doctor</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name"><Input required minLength={2} maxLength={120} value={form.doctorName} placeholder="Dr. Asha Verma" onChange={(e) => set("doctorName", e.target.value)} /></Field>
              <Field label="Qualification"><Input maxLength={120} value={form.qualification} placeholder="BHMS, MD (Hom)" onChange={(e) => set("qualification", e.target.value)} /></Field>
              {isNew ? (
                <Field label="Mobile number" hint="They sign in with this number.">
                  <Input required type="tel" inputMode="numeric" pattern="[6-9][0-9]{9}" maxLength={10} title="A 10-digit mobile number" value={form.phone} placeholder="9876543210"
                    onChange={(e) => set("phone", e.target.value.replace(/\D/g, ""))} />
                </Field>
              ) : (
                <Field label="Mobile number" hint="They sign in with this number, so it cannot be changed here.">
                  <Input type="tel" disabled value={form.phone || "Not provided"} />
                </Field>
              )}
              <Field label="Email"><Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Medical registration</CardTitle><CardDescription>Checked against the certificate before the account is approved.</CardDescription></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Registration number"><Input required minLength={2} maxLength={60} value={form.registrationNumber} onChange={(e) => set("registrationNumber", e.target.value)} /></Field>
              <Field label="Registered with" hint="State council, CCH or NCH"><Input maxLength={120} value={form.registrationCouncil} placeholder="Delhi Board of Homoeopathic System of Medicine" onChange={(e) => set("registrationCouncil", e.target.value)} /></Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Clinic or practice</CardTitle><CardDescription>Orders are billed and delivered here unless they choose another address.</CardDescription></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Clinic or practice name" className={isNew ? "sm:col-span-2" : undefined}><Input required minLength={2} maxLength={160} value={form.businessName} onChange={(e) => set("businessName", e.target.value)} /></Field>
              {isNew ? null : (
                <Field label="Type of business">
                  <Select value={form.type} onValueChange={(v) => set("type", v as B2BBusinessType)}>
                    <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BUSINESS_TYPES.map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              )}
              <Field label="Address" className="sm:col-span-2"><Textarea required minLength={3} maxLength={300} rows={2} value={form.addressLine} onChange={(e) => set("addressLine", e.target.value)} /></Field>
              <Field label="City"><Input required minLength={2} maxLength={80} value={form.city} onChange={(e) => set("city", e.target.value)} /></Field>
              <Field label="State"><Combobox value={form.state} onChange={(v) => set("state", v)} options={STATE_OPTIONS} allLabel="Choose a state" searchPlaceholder="Search states…" className="w-full" /></Field>
              <Field label="Pincode">
                <Input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} title="A 6-digit pincode" value={form.pincode} onChange={(e) => set("pincode", e.target.value.replace(/\D/g, ""))} />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Tax and licences</CardTitle><CardDescription>Fill in what the doctor has. With a GST number they get a GST invoice in the clinic&apos;s name.</CardDescription></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="GST number" error={gstError} hint="Optional"><Input value={form.gstNumber} maxLength={15} className="uppercase" aria-invalid={Boolean(gstError)} onChange={(e) => set("gstNumber", e.target.value)} /></Field>
              <Field label="PAN" error={panError} hint="Optional"><Input value={form.panNumber} maxLength={10} className="uppercase" aria-invalid={Boolean(panError)} onChange={(e) => set("panNumber", e.target.value)} /></Field>
              <Field label="Drug licence number" hint="Optional"><Input maxLength={60} value={form.drugLicenseNumber} onChange={(e) => set("drugLicenseNumber", e.target.value)} /></Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Documents</CardTitle><CardDescription>Only staff can open these files.</CardDescription></CardHeader>
            <CardContent>
              {isNew ? (
                <DocumentsField kinds={DOCUMENT_KINDS} value={documents} onChange={setDocuments} />
              ) : account.documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No documents were uploaded for this account.</p>
              ) : (
                <div className="grid gap-2">
                  {account.documents.map((doc) => (
                    <div key={doc.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><FileText className="size-4" /></span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{DOCUMENT_LABEL[doc.type] ?? humanize(doc.type)}</p>
                        <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="block truncate text-xs text-primary hover:underline">{doc.fileName ?? "Open the file"}</a>
                      </div>
                      <StatusBadge status={doc.status} label={doc.status === "APPROVED" ? "Checked" : doc.status === "PENDING" ? "Not checked yet" : undefined} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid min-w-0 gap-4">
          <Card>
            <CardHeader><CardTitle>Wholesale terms</CardTitle></CardHeader>
            <CardContent className="grid gap-4">
              <Field label="Price tier" hint="Decides their discount off the retail price.">
                <Select value={form.priceTierId || "default"} onValueChange={(v) => set("priceTierId", v === "default" ? "" : v)}>
                  <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {isNew ? <SelectItem value="default">Doctor tier (default)</SelectItem> : form.priceTierId ? null : <SelectItem value="default">Not set</SelectItem>}
                    {tiers.map((tier) => <SelectItem key={tier.id} value={String(tier.id)}>{tier.name} · {tier.defaultDiscountPercent}% off</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Credit limit (₹)" hint="0 means they pay before each order is sent.">
                <Input type="number" min="0" step="1" inputMode="numeric" value={form.creditLimit} onChange={(e) => set("creditLimit", e.target.value)} />
              </Field>
              <Field label="Days to pay" hint="Only used when there is a credit limit.">
                <Input type="number" min="0" max="365" step="1" inputMode="numeric" value={form.creditDays} onChange={(e) => set("creditDays", e.target.value)} />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{isNew ? "Approval" : "Status"}</CardTitle></CardHeader>
            <CardContent className="grid gap-4">
              {isNew ? (
                <label className="flex items-start gap-2.5 text-sm">
                  <Checkbox className="mt-0.5" checked={approveNow} onCheckedChange={(checked) => setApproveNow(checked === true)} />
                  <span>
                    Approve now
                    <span className="block text-xs text-muted-foreground">
                      {approveNow
                        ? "They can buy at wholesale prices straight away."
                        : "Left unticked, the account waits in “New application” until someone approves it."}
                    </span>
                  </span>
                </label>
              ) : (
                <>
                  <Field
                    label="Account status"
                    hint={DECISIONS.find((d) => d.value === status)?.hint ?? "Waiting for someone to look at the application."}
                  >
                    <Select value={status} onValueChange={(v) => setStatus(v as VerificationStatus)}>
                      <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {/* an application cannot be sent back to "new", so that only shows while it still is */}
                        {account.status === "PENDING" ? <SelectItem value="PENDING">{B2B_STATUS_LABEL.PENDING}</SelectItem> : null}
                        {decisions.map((d) => <SelectItem key={d.value} value={d.value}>{B2B_STATUS_LABEL[d.value]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  {needsReason ? (
                    <Field label={status === "REJECTED" ? "Reason for rejecting" : "Reason for pausing"}>
                      <Textarea required rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
                    </Field>
                  ) : !statusChanged && account.rejectionReason && (status === "REJECTED" || status === "SUSPENDED") ? (
                    <p className="rounded-lg bg-surface-2 p-3 text-sm">
                      <span className="block text-xs text-muted-foreground">Reason given</span>
                      {account.rejectionReason}
                    </p>
                  ) : null}
                </>
              )}
              <Field label="Internal note" hint="Only staff see this.">
                <Textarea rows={3} maxLength={1000} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
              </Field>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}
