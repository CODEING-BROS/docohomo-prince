"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, TicketPercent, Trash2 } from "lucide-react";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { BulkActions, SelectPage, SelectRow, useSelection } from "@/components/admin/bulk";
import { EmptyState, PageHeader, PaginationBar, SearchInput, StatusBadge } from "@/components/admin/parts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useUrlState } from "@/hooks/use-url-state";
import { api } from "@/lib/api";
import { formatDate, formatMoney, formatMoneyExact, formatNumber } from "@/lib/format";
import { useTimeZone } from "@/lib/timezone";
import type { Paged } from "@/lib/types";
import { cn } from "@/lib/utils";
import { FilterChips } from "@/components/custom/filter-chips";
import { SectionCard } from "@/components/custom/section-card";
import { ButtonSpinner } from "@/components/custom/loaders";

type CouponType = "PERCENT" | "FLAT" | "FREE_SHIPPING";
type CouponStatus = "ACTIVE" | "SCHEDULED" | "USED_UP" | "EXPIRED" | "OFF";
type CouponTab = "ACTIVE" | "EXPIRED" | "OFF";
type Audience = "BOTH" | "D2C" | "B2B";

type CouponRow = {
  id: number; code: string; description: string | null; type: CouponType; value: number;
  maxDiscount: number | null; minOrderValue: number | null; channel: "D2C" | "B2B" | null;
  usageLimit: number | null; perUserLimit: number | null; usedCount: number;
  startsAt: string | null; expiresAt: string | null; isActive: boolean; status: CouponStatus;
};
type CouponList = Paged<CouponRow> & { statusCounts: Record<CouponTab, number> };

// the badge colours are shared with other pages, so each coupon state borrows the closest one
const STATUS: Record<CouponStatus, { label: string; tone: string }> = {
  ACTIVE: { label: "Active", tone: "ACTIVE" },
  SCHEDULED: { label: "Not started yet", tone: "CONFIRMED" },
  USED_UP: { label: "Fully used", tone: "PENDING" },
  EXPIRED: { label: "Expired", tone: "ARCHIVED" },
  OFF: { label: "Turned off", tone: "ARCHIVED" },
};
const TABS: { value: CouponTab; label: string }[] = [
  { value: "ACTIVE", label: "Active" },
  { value: "EXPIRED", label: "Expired" },
  { value: "OFF", label: "Turned off" },
];
const AUDIENCE_LABEL: Record<Audience, string> = { BOTH: "Everyone", D2C: "Retail customers (D2C)", B2B: "Trade customers (B2B)" };

type Draft = {
  id: number | null; code: string; description: string; type: CouponType; value: string;
  maxDiscount: string; minOrderValue: string; audience: Audience; usageLimit: string; perUserLimit: string;
  startsAt: string; expiresAt: string; // yyyy-MM-dd
  savedStartsAt: string; savedExpiresAt: string; // what the dates were when the form opened
  isActive: boolean;
};
const emptyDraft: Draft = {
  id: null, code: "", description: "", type: "PERCENT", value: "", maxDiscount: "", minOrderValue: "", audience: "BOTH",
  usageLimit: "", perUserLimit: "", startsAt: "", expiresAt: "", savedStartsAt: "", savedExpiresAt: "", isActive: true,
};

const text = (value: number | null) => (value === null ? "" : String(value));
const numberOrNull = (value: string) => (value.trim() === "" ? null : Number(value));
/** Whole rupees as "₹100"; paise are shown only when there are some. */
const money = (value: number) => (Number.isInteger(value) ? formatMoney(value) : formatMoneyExact(value));
/** The calendar day (yyyy-MM-dd) a moment falls on in the timezone the admin is showing. */
const dayIn = (zone: string, value: string | null) => (value ? new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(new Date(value)) : "");

const discountText = (coupon: CouponRow) =>
  coupon.type === "FREE_SHIPPING" ? "Free delivery"
  : coupon.type === "FLAT" ? `${money(coupon.value)} off`
  : `${coupon.value}% off${coupon.maxDiscount ? `, up to ${money(coupon.maxDiscount)}` : ""}`;

const validityText = (coupon: CouponRow) =>
  coupon.startsAt && coupon.expiresAt ? `${formatDate(coupon.startsAt)} to ${formatDate(coupon.expiresAt)}`
  : coupon.expiresAt ? `Until ${formatDate(coupon.expiresAt)}`
  : coupon.startsAt ? `From ${formatDate(coupon.startsAt)}`
  : "No end date";

const optional = <span className="font-normal text-muted-foreground">(optional)</span>;

function CouponsView() {
  const url = useUrlState();
  const zone = useTimeZone();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<CouponRow | null>(null);

  const filters = { q: url.get("q"), status: url.get("status"), page: url.get("page") || "1", pageSize: url.get("pageSize") || "20" };
  const { data, isPending, isError } = useQuery({
    queryKey: ["coupons", filters],
    queryFn: () => api<CouponList>("/admin/coupons", { query: filters }),
    placeholderData: (previous) => previous,
  });
  const selection = useSelection((data?.items ?? []).map((c) => c.id));
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["coupons"] });

  const save = useMutation({
    mutationFn: (d: Draft) =>
      api(d.id ? `/admin/coupons/${d.id}` : "/admin/coupons", {
        method: d.id ? "PATCH" : "POST",
        body: {
          code: d.code,
          description: d.description,
          type: d.type,
          value: d.type === "FREE_SHIPPING" ? 0 : numberOrNull(d.value),
          maxDiscount: d.type === "PERCENT" ? numberOrNull(d.maxDiscount) : null,
          minOrderValue: numberOrNull(d.minOrderValue),
          channel: d.audience === "BOTH" ? null : d.audience,
          usageLimit: numberOrNull(d.usageLimit),
          perUserLimit: numberOrNull(d.perUserLimit),
          isActive: d.isActive,
          // a date that was not touched is left out, so it keeps its exact time
          ...(d.startsAt !== d.savedStartsAt ? { startsAt: d.startsAt || null } : {}),
          ...(d.expiresAt !== d.savedExpiresAt ? { expiresAt: d.expiresAt || null } : {}),
          tz: zone,
        },
      }),
    onSuccess: (_r, d) => {
      toast.success(d.id ? "Coupon updated" : "Coupon added");
      setDraft(null);
      refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: (coupon: CouponRow) => api(`/admin/coupons/${coupon.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Coupon deleted");
      setDeleting(null);
      refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  const edit = (coupon: CouponRow) => {
    const startsAt = dayIn(zone, coupon.startsAt);
    const expiresAt = dayIn(zone, coupon.expiresAt);
    setDraft({
      id: coupon.id, code: coupon.code, description: coupon.description ?? "", type: coupon.type,
      value: coupon.type === "FREE_SHIPPING" ? "" : String(coupon.value), maxDiscount: text(coupon.maxDiscount), minOrderValue: text(coupon.minOrderValue),
      audience: coupon.channel ?? "BOTH", usageLimit: text(coupon.usageLimit), perUserLimit: text(coupon.perUserLimit),
      startsAt, expiresAt, savedStartsAt: startsAt, savedExpiresAt: expiresAt, isActive: coupon.isActive,
    });
  };

  const counts = data?.statusCounts;
  const tabs = [
    { value: "", label: "All", count: counts ? counts.ACTIVE + counts.EXPIRED + counts.OFF : 0 },
    ...TABS.map((tab) => ({ ...tab, count: counts?.[tab.value] ?? 0 })),
  ];

  return (
    <>
      <PageHeader title="Coupons" description="Discount codes customers type in at checkout">
        <Button className="h-9" onClick={() => setDraft(emptyDraft)}><Plus /> Add coupon</Button>
      </PageHeader>

      <FilterChips ariaLabel="Status" className="mb-3" value={filters.status || "all"} onChange={(v) => url.set({ status: v === "all" ? "" : v })} options={tabs.map((tab) => ({ value: tab.value || "all", label: tab.label, count: tab.count }))} />

      <SectionCard flush>
        <div className="flex flex-wrap items-center gap-2 border-b border-foreground/18 bg-surface-2 px-3 py-2">
          <SearchInput value={filters.q} onChange={(q) => url.set({ q })} placeholder="Search by coupon code" className="w-full sm:w-72" />
          {url.hasAny ? <Button variant="ghost" className="h-9" onClick={url.clear}>Clear filters</Button> : null}
          <BulkActions table="coupons" noun="coupons" selection={selection} filters={filters} refresh={["coupons"]} deleteNote="Coupons that have already been used are kept." />
        </div>

        {isError ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Could not load coupons. Check that the backend is running.</p>
        ) : isPending || !data ? (
          <div className="grid gap-2 p-4">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : data.items.length === 0 ? (
          <EmptyState
            icon={TicketPercent}
            title={url.hasAny ? "No coupons match" : "No coupons yet"}
            description={url.hasAny ? "Try a different search, or clear the filters." : "Add a coupon to give customers a discount code they can use at checkout."}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 pl-4"><SelectPage selection={selection} noun="coupons" /></TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead>Who can use it</TableHead>
                <TableHead className="text-right">Times used</TableHead>
                <TableHead>Valid</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24 pr-4"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((coupon) => (
                <TableRow key={coupon.id} data-state={selection.has(coupon.id) ? "selected" : undefined}>
                  <TableCell className="pl-4"><SelectRow selection={selection} id={coupon.id} label={coupon.code} /></TableCell>
                  <TableCell>
                    <div className="font-mono font-medium">{coupon.code}</div>
                    {coupon.description ? <div className="max-w-60 truncate text-xs text-muted-foreground">{coupon.description}</div> : null}
                  </TableCell>
                  <TableCell>
                    <div>{discountText(coupon)}</div>
                    <div className="text-xs text-muted-foreground">
                      {coupon.minOrderValue ? `On orders of ${money(coupon.minOrderValue)} or more` : "On any order value"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>{AUDIENCE_LABEL[coupon.channel ?? "BOTH"]}</div>
                    {coupon.perUserLimit ? (
                      <div className="text-xs text-muted-foreground">{coupon.perUserLimit === 1 ? "Once" : `${formatNumber(coupon.perUserLimit)} times`} per customer</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right ledger">
                    {formatNumber(coupon.usedCount)}
                    {coupon.usageLimit ? <span className="text-muted-foreground"> of {formatNumber(coupon.usageLimit)}</span> : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{validityText(coupon)}</TableCell>
                  <TableCell><StatusBadge status={STATUS[coupon.status].tone} label={STATUS[coupon.status].label} /></TableCell>
                  <TableCell className="pr-4 text-right">
                    <Button variant="ghost" size="icon-sm" aria-label={`Edit ${coupon.code}`} onClick={() => edit(coupon)}><Pencil /></Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Delete ${coupon.code}`} onClick={() => setDeleting(coupon)}><Trash2 /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {data ? (
          <PaginationBar
            page={data.page} pageCount={data.pageCount} pageSize={data.pageSize} total={data.total} noun="coupons"
            onPage={(page) => url.set({ page })} onPageSize={(pageSize) => url.set({ pageSize })}
          />
        ) : null}
      </SectionCard>

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit coupon" : "Add coupon"}</DialogTitle>
            <DialogDescription>Customers type this code at checkout to get the discount.</DialogDescription>
          </DialogHeader>
          {draft ? (
            <form id="coupon-form" className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(draft); }}>
              <div className="grid gap-1.5">
                <Label htmlFor="coupon-code">Coupon code</Label>
                <Input
                  id="coupon-code" required autoFocus minLength={3} maxLength={40} pattern="[A-Za-z0-9_\-]+" title="Letters, numbers, - and _ only, with no spaces"
                  placeholder="WELCOME10" className="h-9 font-mono uppercase placeholder:font-sans placeholder:normal-case"
                  value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase().replace(/\s/g, "") })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>What it gives</Label>
                <Select value={draft.type} onValueChange={(v) => setDraft({ ...draft, type: v as CouponType })}>
                  <SelectTrigger className="h-9 w-full" aria-label="What it gives"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERCENT">A percentage off</SelectItem>
                    <SelectItem value="FLAT">A fixed amount off</SelectItem>
                    <SelectItem value="FREE_SHIPPING">Free delivery</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {draft.type === "PERCENT" ? (
                <>
                  <div className="grid gap-1.5">
                    <Label htmlFor="coupon-value">Discount (%)</Label>
                    <Input id="coupon-value" required type="number" inputMode="decimal" min={1} max={100} step="any" className="h-9" placeholder="10"
                      value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="coupon-max">Highest discount (₹) {optional}</Label>
                    <Input id="coupon-max" type="number" inputMode="decimal" min={1} step="any" className="h-9" placeholder="No upper limit"
                      value={draft.maxDiscount} onChange={(e) => setDraft({ ...draft, maxDiscount: e.target.value })} />
                  </div>
                </>
              ) : draft.type === "FLAT" ? (
                <div className="grid gap-1.5">
                  <Label htmlFor="coupon-value">Discount (₹)</Label>
                  <Input id="coupon-value" required type="number" inputMode="decimal" min={1} step="any" className="h-9" placeholder="100"
                    value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} />
                </div>
              ) : null}

              <div className="grid gap-1.5">
                <Label htmlFor="coupon-min">Smallest order value (₹) {optional}</Label>
                <Input id="coupon-min" type="number" inputMode="decimal" min={0} step="any" className="h-9" placeholder="Any order value"
                  value={draft.minOrderValue} onChange={(e) => setDraft({ ...draft, minOrderValue: e.target.value })} />
              </div>
              <div className={cn("grid gap-1.5", draft.type === "FLAT" && "sm:col-span-2")}>
                <Label>Who can use it</Label>
                <Select value={draft.audience} onValueChange={(v) => setDraft({ ...draft, audience: v as Audience })}>
                  <SelectTrigger className="h-9 w-full" aria-label="Who can use it"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BOTH">{AUDIENCE_LABEL.BOTH}</SelectItem>
                    <SelectItem value="D2C">{AUDIENCE_LABEL.D2C}</SelectItem>
                    <SelectItem value="B2B">{AUDIENCE_LABEL.B2B}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="coupon-usage">Total number of uses {optional}</Label>
                <Input id="coupon-usage" type="number" inputMode="numeric" min={1} step={1} className="h-9" placeholder="No limit"
                  value={draft.usageLimit} onChange={(e) => setDraft({ ...draft, usageLimit: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="coupon-per-user">Uses per customer {optional}</Label>
                <Input id="coupon-per-user" type="number" inputMode="numeric" min={1} step={1} className="h-9" placeholder="No limit"
                  value={draft.perUserLimit} onChange={(e) => setDraft({ ...draft, perUserLimit: e.target.value })} />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="coupon-start">First day {optional}</Label>
                <Input id="coupon-start" type="date" className="h-9" max={draft.expiresAt || undefined}
                  value={draft.startsAt} onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })} />
                <p className="text-xs text-muted-foreground">Leave empty to start straight away.</p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="coupon-end">Last day {optional}</Label>
                <Input id="coupon-end" type="date" className="h-9" min={draft.startsAt || undefined}
                  value={draft.expiresAt} onChange={(e) => setDraft({ ...draft, expiresAt: e.target.value })} />
                <p className="text-xs text-muted-foreground">Leave empty if it never ends.</p>
              </div>

              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="coupon-description">Description {optional}</Label>
                <Textarea id="coupon-description" rows={2} maxLength={500} placeholder="A note for yourself, for example where this code was shared"
                  value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </div>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <Checkbox checked={draft.isActive} onCheckedChange={(checked) => setDraft({ ...draft, isActive: checked === true })} />
                Customers can use this coupon
              </label>
              {draft.id ? (
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  Used {formatNumber(data?.items.find((c) => c.id === draft.id)?.usedCount ?? 0)} times so far.
                </p>
              ) : null}
            </form>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
            <Button type="submit" form="coupon-form" loading={save.isPending}>{draft?.id ? "Save changes" : "Add coupon"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleting?.code}?</DialogTitle>
            <DialogDescription>
              {deleting?.usedCount
                ? `This coupon has been used ${formatNumber(deleting.usedCount)} ${deleting.usedCount === 1 ? "time" : "times"}, so it cannot be deleted. Turn it off instead.`
                : "Customers will no longer be able to use this code. This cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="destructive" disabled={!deleting || deleting.usedCount > 0 || remove.isPending} onClick={() => deleting && remove.mutate(deleting)}>
              {remove.isPending ? <ButtonSpinner /> : null}Delete coupon
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function CouponsPage() {
  return (
    <Suspense>
      <CouponsView />
    </Suspense>
  );
}
