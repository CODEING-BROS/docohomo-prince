"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, Truck } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BulkActions, SelectPage, SelectRow, useSelection } from "@/components/admin/bulk";
import { CourierSettings } from "@/components/admin/courier-settings";
import { EmptyState, PageHeader, PaginationBar, StatusBadge } from "@/components/admin/parts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { formatMoney, formatMoneyExact } from "@/lib/format";
import { SectionCard } from "@/components/custom/section-card";
import { ButtonSpinner } from "@/components/custom/loaders";

type Audience = "BOTH" | "D2C" | "B2B";

type ShippingRuleRow = {
  id: number; name: string; channel: "D2C" | "B2B" | null;
  minOrderValue: number; maxOrderValue: number | null; charge: number;
  codAvailable: boolean; codCharge: number; isActive: boolean;
};

const AUDIENCE_LABEL: Record<Audience, string> = { BOTH: "All orders", D2C: "Retail orders (D2C)", B2B: "Trade orders (B2B)" };

type Draft = {
  id: number | null; name: string; audience: Audience; minOrderValue: string; maxOrderValue: string;
  charge: string; codAvailable: boolean; codCharge: string; isActive: boolean;
};
const emptyDraft: Draft = {
  id: null, name: "", audience: "BOTH", minOrderValue: "0", maxOrderValue: "", charge: "", codAvailable: true, codCharge: "0", isActive: true,
};

const numberOrNull = (value: string) => (value.trim() === "" ? null : Number(value));
/** Whole rupees as "₹55"; paise are shown only when there are some. */
const money = (value: number) => (Number.isInteger(value) ? formatMoney(value) : formatMoneyExact(value));

const orderValueText = (rule: ShippingRuleRow) =>
  rule.maxOrderValue !== null ? `${money(rule.minOrderValue)} to under ${money(rule.maxOrderValue)}`
  : rule.minOrderValue > 0 ? `${money(rule.minOrderValue)} and above`
  : "Any order value";

const optional = <span className="font-normal text-muted-foreground">(optional)</span>;

export default function ShippingPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<ShippingRuleRow | null>(null);

  const { data, isPending, isError } = useQuery({ queryKey: ["shipping"], queryFn: () => api<{ items: ShippingRuleRow[] }>("/admin/shipping") });
  const rules = useMemo(
    () => (data?.items ?? []).filter((r) => r.name.toLowerCase().includes(search.trim().toLowerCase())),
    [data, search],
  );
  // there are only a handful of rules, so they are all loaded and paged here
  const pageCount = Math.max(1, Math.ceil(rules.length / pageSize));
  const current = Math.min(page, pageCount);
  const shown = rules.slice((current - 1) * pageSize, current * pageSize);
  const selection = useSelection(shown.map((r) => r.id));

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["shipping"] });

  const save = useMutation({
    mutationFn: (d: Draft) =>
      api(d.id ? `/admin/shipping/${d.id}` : "/admin/shipping", {
        method: d.id ? "PATCH" : "POST",
        body: {
          name: d.name,
          channel: d.audience === "BOTH" ? null : d.audience,
          minOrderValue: numberOrNull(d.minOrderValue) ?? 0,
          maxOrderValue: numberOrNull(d.maxOrderValue),
          charge: numberOrNull(d.charge),
          codAvailable: d.codAvailable,
          codCharge: d.codAvailable ? (numberOrNull(d.codCharge) ?? 0) : 0,
          isActive: d.isActive,
        },
      }),
    onSuccess: (_r, d) => {
      toast.success(d.id ? "Delivery rule updated" : "Delivery rule added");
      setDraft(null);
      refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: (rule: ShippingRuleRow) => api(`/admin/shipping/${rule.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Delivery rule deleted");
      setDeleting(null);
      refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <>
      <PageHeader title="Shipping" description="How parcels reach customers, and what customers pay for delivery." />

      <CourierSettings />

      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-semibold">Delivery charges</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Charges by order value. Going down this list, the first active rule that fits an order sets its delivery charge.
          </p>
        </div>
        <Button className="h-9" onClick={() => setDraft(emptyDraft)}><Plus /> Add delivery rule</Button>
      </div>

      <SectionCard flush>
        <div className="flex flex-wrap items-center gap-2 border-b border-foreground/18 bg-surface-2 px-3 py-2">
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search delivery rules"
            className="h-9 w-full sm:w-64"
          />
          <BulkActions table="shipping" noun="delivery rules" selection={selection} filters={{ q: search.trim() }} refresh={["shipping"]} deleteNote="Past orders keep the delivery charge they were given." />
        </div>

        {isError ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Could not load delivery rules. Check that the backend is running.</p>
        ) : isPending ? (
          <div className="grid gap-2 p-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-11" />)}</div>
        ) : rules.length === 0 ? (
          <EmptyState
            icon={Truck}
            title={search.trim() ? "No delivery rules match" : "No delivery rules yet"}
            description={search.trim() ? "Try a different search, or add a new rule." : "Without a rule, delivery is free on every order. Add a rule to charge for delivery."}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 pl-4"><SelectPage selection={selection} noun="delivery rules" /></TableHead>
                <TableHead>Rule</TableHead>
                <TableHead>Applies to</TableHead>
                <TableHead>Order value</TableHead>
                <TableHead className="text-right">Delivery charge</TableHead>
                <TableHead>Cash on delivery</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24 pr-4"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((rule) => (
                <TableRow key={rule.id} data-state={selection.has(rule.id) ? "selected" : undefined}>
                  <TableCell className="pl-4"><SelectRow selection={selection} id={rule.id} label={rule.name} /></TableCell>
                  <TableCell className="font-medium">{rule.name}</TableCell>
                  <TableCell>{AUDIENCE_LABEL[rule.channel ?? "BOTH"]}</TableCell>
                  <TableCell className="ledger">{orderValueText(rule)}</TableCell>
                  <TableCell className="text-right font-medium ledger">{rule.charge > 0 ? money(rule.charge) : "Free"}</TableCell>
                  <TableCell>
                    {rule.codAvailable
                      ? rule.codCharge > 0 ? `Yes, ${money(rule.codCharge)} extra` : "Yes, no extra charge"
                      : <span className="text-muted-foreground">Not offered</span>}
                  </TableCell>
                  <TableCell><StatusBadge status={rule.isActive ? "ACTIVE" : "ARCHIVED"} label={rule.isActive ? "In use" : "Turned off"} /></TableCell>
                  <TableCell className="pr-4 text-right">
                    <Button
                      variant="ghost" size="icon-sm" aria-label={`Edit ${rule.name}`}
                      onClick={() => setDraft({
                        id: rule.id, name: rule.name, audience: rule.channel ?? "BOTH", minOrderValue: String(rule.minOrderValue),
                        maxOrderValue: rule.maxOrderValue === null ? "" : String(rule.maxOrderValue), charge: String(rule.charge),
                        codAvailable: rule.codAvailable, codCharge: String(rule.codCharge), isActive: rule.isActive,
                      })}
                    >
                      <Pencil />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Delete ${rule.name}`} onClick={() => setDeleting(rule)}>
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {data ? (
          <PaginationBar
            page={current} pageCount={pageCount} pageSize={pageSize} total={rules.length} noun="delivery rules"
            onPage={setPage} onPageSize={(size) => { setPageSize(size); setPage(1); }}
          />
        ) : null}
      </SectionCard>

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit delivery rule" : "Add delivery rule"}</DialogTitle>
            <DialogDescription>Orders whose value falls in this range pay this delivery charge.</DialogDescription>
          </DialogHeader>
          {draft ? (
            <form id="shipping-form" className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(draft); }}>
              <div className="grid gap-1.5">
                <Label htmlFor="shipping-name">Name</Label>
                <Input id="shipping-name" required autoFocus maxLength={120} className="h-9" placeholder="Standard delivery"
                  value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Applies to</Label>
                <Select value={draft.audience} onValueChange={(v) => setDraft({ ...draft, audience: v as Audience })}>
                  <SelectTrigger className="h-9 w-full" aria-label="Applies to"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BOTH">{AUDIENCE_LABEL.BOTH}</SelectItem>
                    <SelectItem value="D2C">{AUDIENCE_LABEL.D2C}</SelectItem>
                    <SelectItem value="B2B">{AUDIENCE_LABEL.B2B}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="shipping-min">Order value from (₹)</Label>
                <Input id="shipping-min" required type="number" inputMode="decimal" min={0} step="any" className="h-9"
                  value={draft.minOrderValue} onChange={(e) => setDraft({ ...draft, minOrderValue: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="shipping-max">Order value below (₹) {optional}</Label>
                <Input id="shipping-max" type="number" inputMode="decimal" min={0} step="any" className="h-9" placeholder="No upper limit"
                  value={draft.maxOrderValue} onChange={(e) => setDraft({ ...draft, maxOrderValue: e.target.value })} />
              </div>

              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="shipping-charge">Delivery charge (₹)</Label>
                <Input id="shipping-charge" required type="number" inputMode="decimal" min={0} step="any" className="h-9 sm:w-1/2" placeholder="0 for free delivery"
                  value={draft.charge} onChange={(e) => setDraft({ ...draft, charge: e.target.value })} />
              </div>

              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <Checkbox checked={draft.codAvailable} onCheckedChange={(checked) => setDraft({ ...draft, codAvailable: checked === true })} />
                Offer cash on delivery for these orders
              </label>
              {draft.codAvailable ? (
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label htmlFor="shipping-cod">Extra charge for cash on delivery (₹)</Label>
                  <Input id="shipping-cod" type="number" inputMode="decimal" min={0} step="any" className="h-9 sm:w-1/2" placeholder="0"
                    value={draft.codCharge} onChange={(e) => setDraft({ ...draft, codCharge: e.target.value })} />
                </div>
              ) : null}

              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <Checkbox checked={draft.isActive} onCheckedChange={(checked) => setDraft({ ...draft, isActive: checked === true })} />
                Use this rule
              </label>
            </form>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
            <Button type="submit" form="shipping-form" loading={save.isPending}>{draft?.id ? "Save changes" : "Add delivery rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleting?.name}?</DialogTitle>
            <DialogDescription>
              New orders in this range will follow the next rule that fits, or get free delivery if none does. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="destructive" disabled={!deleting || remove.isPending} onClick={() => deleting && remove.mutate(deleting)}>
              {remove.isPending ? <ButtonSpinner /> : null}Delete rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
