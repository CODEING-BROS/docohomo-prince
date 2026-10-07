"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, FileText, Percent } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Combobox } from "@/components/admin/combobox";
import { PageHeader } from "@/components/admin/parts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { formatNumber, titleCase } from "@/lib/format";
import { STATE_OPTIONS } from "@/lib/india";
import { cn } from "@/lib/utils";

type Seller = {
  legalName: string; tradeName: string; gstin: string; pan: string; drugLicence: string;
  address: string; city: string; state: string; pincode: string; phone: string; email: string;
  prefix: string; issueOn: "dispatch" | "placed"; footer: string;
};
type Settings = { seller: Seller; missing: string[]; advice?: string[]; counters: { financialYear: string; last: number }[] };
type TaxSummary = { total: number; missingRate: number; missingHsn: number; forms: { form: string; count: number }[]; combinations: { gstPercent: number; hsnCode: string; count: number }[] };
type Lookups = { brands: { id: number; name: string }[]; categories: { id: number; name: string; parentId: number | null }[] };

const RATES = [0, 5, 12, 18, 28];

function Field({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** The business details printed on every invoice, and when invoices are made. */
function BusinessDetails({ initial, missing, advice = [], counters }: { initial: Seller; missing: string[]; advice?: string[]; counters: Settings["counters"] }) {
  const queryClient = useQueryClient();
  const [seller, setSeller] = useState(initial);
  const set = <K extends keyof Seller>(key: K, value: Seller[K]) => setSeller((current) => ({ ...current, [key]: value }));
  const save = useMutation({
    mutationFn: () => api<{ missing: string[] }>("/admin/invoices/settings", { method: "PUT", body: seller }),
    onSuccess: (result) => {
      toast.success(result.missing.length ? "Saved. A few details are still needed before invoices can be made." : "Saved. Invoices will now be made automatically.");
      queryClient.invalidateQueries({ queryKey: ["invoice-settings"] });
    },
    onError: (err) => toast.error(err.message),
  });
  const year = counters[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your business details</CardTitle>
        <CardDescription>Printed at the top of every invoice. An invoice is made by itself for every order; saved invoices keep the details they were made with.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {advice.length ? (
          <ul className="grid gap-1.5 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm">
            {advice.map((line) => <li key={line} className="flex items-start gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" /> {line}</li>)}
          </ul>
        ) : null}
        {missing.length ? (
          <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <span><span className="font-medium">No invoices are made yet.</span> Still needed: {missing.join(", ")}.</span>
          </p>
        ) : (
          <p className="flex items-start gap-2 rounded-lg border border-success/40 bg-success/10 px-3 py-2.5 text-sm">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
            <span>Invoices are made automatically.{year ? ` ${formatNumber(year.last)} made in ${year.financialYear} so far.` : ""}</span>
          </p>
        )}
        <form className="grid gap-4 sm:grid-cols-6" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <Field label="Registered business name" hint="Exactly as on the GST certificate." className="sm:col-span-4"><Input value={seller.legalName} onChange={(e) => set("legalName", e.target.value)} /></Field>
          <Field label="Name shown on top" className="sm:col-span-2"><Input value={seller.tradeName} onChange={(e) => set("tradeName", e.target.value)} /></Field>
          <Field label="GSTIN" className="sm:col-span-2"><Input className="uppercase" maxLength={15} placeholder="09ABCDE1234F1Z5" value={seller.gstin} onChange={(e) => set("gstin", e.target.value.toUpperCase())} /></Field>
          <Field label="PAN" className="sm:col-span-2"><Input className="uppercase" maxLength={10} value={seller.pan} onChange={(e) => set("pan", e.target.value.toUpperCase())} /></Field>
          <Field label="Drug licence number" className="sm:col-span-2"><Input value={seller.drugLicence} onChange={(e) => set("drugLicence", e.target.value)} /></Field>
          <Field label="Address" className="sm:col-span-6"><Input value={seller.address} onChange={(e) => set("address", e.target.value)} /></Field>
          <Field label="City" className="sm:col-span-2"><Input value={seller.city} onChange={(e) => set("city", e.target.value)} /></Field>
          <Field label="State" hint="Decides CGST + SGST (same state) or IGST (other states)." className="sm:col-span-2">
            <Combobox value={seller.state} onChange={(v) => set("state", v)} options={STATE_OPTIONS} allLabel="Choose a state" searchPlaceholder="Search states…" className="w-full" />
          </Field>
          <Field label="Pincode" className="sm:col-span-2"><Input inputMode="numeric" maxLength={6} value={seller.pincode} onChange={(e) => set("pincode", e.target.value.replace(/\D/g, ""))} /></Field>
          <Field label="Phone" className="sm:col-span-3"><Input value={seller.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
          <Field label="Email" className="sm:col-span-3"><Input type="email" value={seller.email} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label="Invoice numbers start with" hint={`For example ${seller.prefix || "DH"}/26-27/000001. Numbers start again every April.`} className="sm:col-span-2">
            <Input className="uppercase" maxLength={6} value={seller.prefix} onChange={(e) => set("prefix", e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))} />
          </Field>
          <Field label="Make the invoice" className="sm:col-span-4">
            <Select value={seller.issueOn} onValueChange={(v) => set("issueOn", v as Seller["issueOn"])}>
              <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="dispatch">When the order is packed or shipped (recommended: cancelled orders never get one)</SelectItem>
                <SelectItem value="placed">As soon as the order is placed or paid</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Line at the bottom (optional)" className="sm:col-span-6"><Textarea rows={2} placeholder="Thank you for your order." value={seller.footer} onChange={(e) => set("footer", e.target.value)} /></Field>
          <Button type="submit" className="h-9 justify-self-start sm:col-span-6" loading={save.isPending}>Save details</Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** Sets the GST rate and HSN code on a whole group of products at once. */
function ProductTax() {
  const queryClient = useQueryClient();
  const { data: summary } = useQuery({ queryKey: ["tax-summary"], queryFn: () => api<TaxSummary>("/admin/invoices/tax-summary") });
  const { data: lookups } = useQuery({ queryKey: ["product-lookups"], queryFn: () => api<Lookups>("/admin/products/lookups"), staleTime: 5 * 60_000 });
  const [scope, setScope] = useState<"form" | "brand" | "category" | "all">("form");
  const [pick, setPick] = useState("");
  const [gstPercent, setGstPercent] = useState("12");
  const [hsnCode, setHsnCode] = useState("3004");
  const [onlyMissing, setOnlyMissing] = useState(true);

  const options = useMemo(() => {
    if (scope === "form") return (summary?.forms ?? []).map((f) => ({ value: f.form || "__none__", label: f.form || "No type set", hint: `${formatNumber(f.count)} products` }));
    if (scope === "brand") return (lookups?.brands ?? []).map((b) => ({ value: String(b.id), label: titleCase(b.name) }));
    if (scope === "category") return (lookups?.categories ?? []).map((c) => ({ value: String(c.id), label: titleCase(c.name), hint: c.parentId ? undefined : "Main category" }));
    return [];
  }, [scope, summary, lookups]);

  const apply = useMutation({
    mutationFn: () =>
      api<{ updated: number }>("/admin/invoices/tax-bulk", {
        method: "POST",
        body: {
          gstPercent: Number(gstPercent), hsnCode, onlyMissing,
          ...(scope === "form" ? { form: pick === "__none__" ? "" : pick } : {}),
          ...(scope === "brand" ? { brandId: Number(pick) } : {}),
          ...(scope === "category" ? { categoryId: Number(pick) } : {}),
        },
      }),
    onSuccess: (result) => {
      toast.success(`${formatNumber(result.updated)} products updated`);
      ["tax-summary", "products"].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
    },
    onError: (err) => toast.error(err.message),
  });
  const ready = (scope === "all" || pick) && /^(\d{4}|\d{6}|\d{8})$/.test(hsnCode);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Percent className="size-4 text-primary" /> GST rate and HSN code on products</CardTitle>
        <CardDescription>Each invoice line takes its tax from the product. Set them here for many products at once; single products can still be changed on their own page.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {!summary ? <Skeleton className="h-16" /> : (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Products</p><p className="text-xl font-semibold ledger">{formatNumber(summary.total)}</p></div>
            <div className={cn("rounded-lg border p-3", summary.missingRate ? "border-warning/40 bg-warning/5" : "")}><p className="text-xs text-muted-foreground">Without a GST rate</p><p className="text-xl font-semibold ledger">{formatNumber(summary.missingRate)}</p></div>
            <div className={cn("rounded-lg border p-3", summary.missingHsn ? "border-warning/40 bg-warning/5" : "")}><p className="text-xs text-muted-foreground">Without an HSN code</p><p className="text-xl font-semibold ledger">{formatNumber(summary.missingHsn)}</p></div>
          </div>
        )}
        <form className="grid gap-4 sm:grid-cols-6" onSubmit={(e) => { e.preventDefault(); apply.mutate(); }}>
          <Field label="Which products" className="sm:col-span-2">
            <Select value={scope} onValueChange={(v) => { setScope(v as typeof scope); setPick(""); }}>
              <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="form">One type of medicine</SelectItem>
                <SelectItem value="brand">One brand</SelectItem>
                <SelectItem value="category">One category (and everything in it)</SelectItem>
                <SelectItem value="all">All products</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {scope !== "all" ? (
            <Field label={scope === "form" ? "Type" : scope === "brand" ? "Brand" : "Category"} className="sm:col-span-4">
              <Combobox value={pick} onChange={setPick} options={options} allLabel="Choose" searchPlaceholder="Search…" className="w-full" />
            </Field>
          ) : <span className="hidden sm:col-span-4 sm:block" />}
          <Field label="GST rate" className="sm:col-span-2">
            <Select value={gstPercent} onValueChange={setGstPercent}>
              <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{RATES.map((rate) => <SelectItem key={rate} value={String(rate)}>{rate}%</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="HSN code" hint="4, 6 or 8 digits." className="sm:col-span-2"><Input inputMode="numeric" maxLength={8} value={hsnCode} onChange={(e) => setHsnCode(e.target.value.replace(/\D/g, ""))} /></Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm sm:col-span-2">
            <Checkbox checked={onlyMissing} onCheckedChange={(v) => setOnlyMissing(v === true)} /> Only products without a rate yet
          </label>
          <p className="text-xs text-muted-foreground sm:col-span-6">Check the right rate and HSN code for each type of product with your accountant. Rates change from time to time.</p>
          <Button type="submit" className="h-9 justify-self-start sm:col-span-6" loading={apply.isPending} disabled={!ready}>Apply to these products</Button>
        </form>
        {summary && summary.combinations.length > 1 ? (
          <div className="grid gap-1 text-sm">
            <p className="text-xs font-medium text-muted-foreground">Rates in use now</p>
            {summary.combinations.map((c) => <p key={`${c.gstPercent}-${c.hsnCode}`} className="ledger">{c.gstPercent}% · HSN {c.hsnCode || "not set"} · {formatNumber(c.count)} products</p>)}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function InvoicesPage() {
  const { data, isPending } = useQuery({ queryKey: ["invoice-settings"], queryFn: () => api<Settings>("/admin/invoices/settings") });
  return (
    <>
      <PageHeader title="Invoices" description="An invoice is made by itself for every order as soon as it is confirmed, emailed with the shipping message, and can be downloaded by staff and by the buyer." />
      <div className="grid items-start gap-4 xl:grid-cols-5">
        <div className="xl:col-span-3">{isPending || !data ? <Skeleton className="h-96 rounded-xl" /> : <BusinessDetails key={JSON.stringify(data.seller)} initial={data.seller} missing={data.missing} advice={data.advice} counters={data.counters} />}</div>
        <div className="grid gap-4 xl:col-span-2">
          <ProductTax />
          <Card>
            <CardContent className="flex items-start gap-3 text-sm">
              <FileText className="mt-0.5 size-5 shrink-0 text-primary" />
              <p className="text-muted-foreground">To see or print an invoice, open the order in <span className="font-medium text-foreground">Orders</span>. Buyers find theirs on their own order page.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
