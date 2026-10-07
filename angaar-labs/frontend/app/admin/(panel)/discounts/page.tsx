"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgePercent, Pencil, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BulkActions, SelectPage, SelectRow, useSelection } from "@/components/admin/bulk";
import { Combobox } from "@/components/admin/combobox";
import { EmptyState, PageHeader, StatusBadge } from "@/components/admin/parts";
import { type VariantHit, VariantPicker } from "@/components/admin/variant-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { formatDate, formatMoney, formatNumber, titleCase } from "@/lib/format";
import type { B2BAccountRow, Lookups, Paged, PriceTier } from "@/lib/types";
import { SectionCard } from "@/components/custom/section-card";
import { ButtonSpinner } from "@/components/custom/loaders";

type Scope = "ALL" | "BRAND" | "CATEGORY" | "PRODUCT" | "VARIANT";
type DiscountType = "PERCENT" | "FLAT" | "FIXED_PRICE";
type WhoKind = "EVERYONE" | "TIER" | "DOCTOR";

type Rule = {
  id: number; name: string; scope: Scope; discountType: DiscountType; value: number; minQuantity: number; minOrderValue: number | null;
  priority: number; isActive: boolean; startsOn: string | null; endsOn: string | null;
  priceTierId: number | null; b2bAccountId: number | null; brandId: number | null; categoryId: number | null; productId: number | null; variantId: number | null;
  who: string; whoKind: WhoKind; target: string | null;
};

type RuleDraft = {
  id: number | null; name: string; whoKind: WhoKind; priceTierId: string; b2bAccountId: string;
  scope: Scope; brandId: string; categoryId: string; productId: number | null; variantId: number | null; targetLabel: string;
  discountType: DiscountType; value: string; minQuantity: string; minOrderValue: string; startsOn: string; endsOn: string; isActive: boolean;
};

const blankRule: RuleDraft = {
  id: null, name: "", whoKind: "TIER", priceTierId: "", b2bAccountId: "", scope: "ALL", brandId: "", categoryId: "", productId: null, variantId: null,
  targetLabel: "", discountType: "PERCENT", value: "", minQuantity: "1", minOrderValue: "", startsOn: "", endsOn: "", isActive: true,
};

const SCOPE_LABEL: Record<Scope, string> = { ALL: "All products", BRAND: "A brand", CATEGORY: "A category", PRODUCT: "A product (all its packs)", VARIANT: "One pack of a product" };

const describeDiscount = (rule: Pick<Rule, "discountType" | "value">) =>
  rule.discountType === "PERCENT" ? `${rule.value}% off` : rule.discountType === "FLAT" ? `${formatMoney(rule.value)} off each` : `${formatMoney(rule.value)} each`;

const describeSlab = (rule: Pick<Rule, "minQuantity" | "minOrderValue">) => {
  const parts = [rule.minQuantity > 1 ? `${rule.minQuantity}+ units` : null, rule.minOrderValue ? `orders of ${formatMoney(rule.minOrderValue)}+` : null].filter(Boolean);
  return parts.length ? parts.join(" and ") : "Any quantity";
};

function TierCard({ tier, onSaved }: { tier: PriceTier; onSaved: () => void }) {
  const [percent, setPercent] = useState(String(tier.defaultDiscountPercent));
  const changed = Number(percent) !== tier.defaultDiscountPercent && percent !== "";
  const save = useMutation({
    mutationFn: () => api(`/admin/discounts/tiers/${tier.id}`, { method: "PATCH", body: { defaultDiscountPercent: Number(percent) } }),
    onSuccess: () => { toast.success(`${tier.name} tier updated`); onSaved(); },
    onError: (err) => toast.error(err.message),
  });
  const remove = useMutation({
    mutationFn: () => api(`/admin/discounts/tiers/${tier.id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success(`${tier.name} tier deleted`); onSaved(); },
    onError: (err) => toast.error(err.message),
  });
  return (
    <Card>
      <CardContent className="grid gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium">{tier.name}</p>
            <p className="text-xs text-muted-foreground">{formatNumber(tier.accountCount)} {tier.accountCount === 1 ? "customer" : "customers"}</p>
          </div>
          <Button variant="ghost" size="icon-sm" aria-label={`Delete the ${tier.name} tier`} disabled={tier.accountCount > 0 || remove.isPending} title={tier.accountCount > 0 ? "Move its customers to another tier first" : "Delete"} onClick={() => remove.mutate()}>
            <Trash2 />
          </Button>
        </div>
        <div className="flex items-end gap-2">
          <div className="grid flex-1 gap-1">
            <Label htmlFor={`tier-${tier.id}`} className="text-xs text-muted-foreground">Standard discount off retail</Label>
            <div className="relative">
              <Input id={`tier-${tier.id}`} type="number" min="0" max="90" step="0.5" inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value)} className="h-9 pr-7" />
              <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sm text-muted-foreground">%</span>
            </div>
          </div>
          <Button className="h-9" disabled={!changed || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <ButtonSpinner /> : null}Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DiscountsPage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<RuleDraft | null>(null);
  const [newTier, setNewTier] = useState<{ name: string; percent: string } | null>(null);
  const set = <K extends keyof RuleDraft>(key: K, value: RuleDraft[K]) => setDraft((current) => (current ? { ...current, [key]: value } : current));

  const { data: tierData } = useQuery({ queryKey: ["b2b-tiers"], queryFn: () => api<{ tiers: PriceTier[] }>("/admin/b2b/tiers") });
  const { data: ruleData, isPending } = useQuery({ queryKey: ["discount-rules"], queryFn: () => api<{ items: Rule[] }>("/admin/discounts/rules") });
  const { data: lookups } = useQuery({ queryKey: ["product-lookups"], queryFn: () => api<Lookups>("/admin/products/lookups"), staleTime: 5 * 60_000 });
  const { data: accounts } = useQuery({ queryKey: ["b2b", "all-for-picker"], queryFn: () => api<Paged<B2BAccountRow>>("/admin/b2b", { query: { pageSize: 500 } }) });

  const tiers = tierData?.tiers ?? [];
  const rules = ruleData?.items ?? [];
  const selection = useSelection(rules.map((rule) => rule.id));
  const refresh = () => ["b2b-tiers", "discount-rules"].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));

  const brandOptions = useMemo(() => (lookups?.brands ?? []).map((b) => ({ value: String(b.id), label: titleCase(b.name) })), [lookups]);
  const categoryOptions = useMemo(() => {
    const byId = new Map((lookups?.categories ?? []).map((c) => [c.id, c]));
    return (lookups?.categories ?? []).map((c) => ({ value: String(c.id), label: titleCase(c.name), hint: c.parentId ? `in ${titleCase(byId.get(c.parentId)?.name ?? "")}` : "Main category" }));
  }, [lookups]);
  const doctorOptions = useMemo(
    () => (accounts?.items ?? []).map((a) => ({ value: String(a.id), label: a.name, hint: a.businessName !== a.name ? a.businessName : undefined })),
    [accounts],
  );

  const saveRule = useMutation({
    mutationFn: (d: RuleDraft) =>
      api(d.id ? `/admin/discounts/rules/${d.id}` : "/admin/discounts/rules", {
        method: d.id ? "PATCH" : "POST",
        body: {
          name: d.name,
          priceTierId: d.whoKind === "TIER" ? d.priceTierId : "", b2bAccountId: d.whoKind === "DOCTOR" ? d.b2bAccountId : "",
          scope: d.scope, brandId: d.brandId, categoryId: d.categoryId, productId: d.productId ?? "", variantId: d.variantId ?? "",
          discountType: d.discountType, value: d.value, minQuantity: d.minQuantity || "1", minOrderValue: d.minOrderValue,
          startsOn: d.startsOn, endsOn: d.endsOn, isActive: d.isActive,
        },
      }),
    onSuccess: (_r, d) => { toast.success(d.id ? "Rule updated" : "Rule added"); setDraft(null); refresh(); },
    onError: (err) => toast.error(err.message),
  });
  const removeRule = useMutation({
    mutationFn: (rule: Rule) => api(`/admin/discounts/rules/${rule.id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Rule deleted"); refresh(); },
    onError: (err) => toast.error(err.message),
  });
  const addTier = useMutation({
    mutationFn: () => api("/admin/discounts/tiers", { method: "POST", body: { name: newTier?.name, defaultDiscountPercent: Number(newTier?.percent || 0) } }),
    onSuccess: () => { toast.success("Tier added"); setNewTier(null); refresh(); },
    onError: (err) => toast.error(err.message),
  });

  const edit = (rule: Rule) =>
    setDraft({
      id: rule.id, name: rule.name, whoKind: rule.whoKind, priceTierId: rule.priceTierId ? String(rule.priceTierId) : "", b2bAccountId: rule.b2bAccountId ? String(rule.b2bAccountId) : "",
      scope: rule.scope, brandId: rule.brandId ? String(rule.brandId) : "", categoryId: rule.categoryId ? String(rule.categoryId) : "",
      productId: rule.productId, variantId: rule.variantId, targetLabel: rule.scope === "PRODUCT" || rule.scope === "VARIANT" ? (rule.target ?? "") : "",
      discountType: rule.discountType, value: String(rule.value), minQuantity: String(rule.minQuantity), minOrderValue: rule.minOrderValue === null ? "" : String(rule.minOrderValue),
      startsOn: rule.startsOn ?? "", endsOn: rule.endsOn ?? "", isActive: rule.isActive,
    });

  const pickTarget = (hit: VariantHit) =>
    setDraft((current) => current && ({
      ...current, productId: hit.productId, variantId: hit.variantId,
      targetLabel: current.scope === "VARIANT" ? `${titleCase(hit.productName)} · ${hit.title}` : titleCase(hit.productName),
    }));

  const submitRule = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    if (draft.whoKind === "TIER" && !draft.priceTierId) return toast.error("Choose the price tier");
    if (draft.whoKind === "DOCTOR" && !draft.b2bAccountId) return toast.error("Choose the doctor");
    if (draft.scope === "BRAND" && !draft.brandId) return toast.error("Choose the brand");
    if (draft.scope === "CATEGORY" && !draft.categoryId) return toast.error("Choose the category");
    if ((draft.scope === "PRODUCT" || draft.scope === "VARIANT") && !draft.productId) return toast.error("Choose the product");
    saveRule.mutate(draft);
  };

  return (
    <>
      <PageHeader title="B2B discounts" description="What doctors pay when they buy wholesale. Retail customers always pay the selling price.">
        <Button className="h-9" onClick={() => setDraft({ ...blankRule, priceTierId: tiers[0] ? String(tiers[0].id) : "" })}><Plus /> Add discount rule</Button>
      </PageHeader>

      <Card className="mb-4 bg-muted/30">
        <CardContent className="text-sm text-muted-foreground">
          <p className="font-medium text-foreground">How a wholesale price is worked out</p>
          <ol className="mt-1.5 list-decimal space-y-0.5 pl-5">
            <li>A rule made for that one doctor comes first.</li>
            <li>Otherwise the B2B price typed on the product, if there is one.</li>
            <li>Otherwise the best matching rule below: a pack beats a product, a product beats a category, a category beats a brand.</li>
            <li>Otherwise the standard discount of the doctor&apos;s price tier.</li>
          </ol>
        </CardContent>
      </Card>

      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Price tiers</h2>
        <Button variant="outline" size="sm" onClick={() => setNewTier({ name: "", percent: "10" })}><Plus /> Add tier</Button>
      </div>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tiers.map((tier) => <TierCard key={`${tier.id}-${tier.defaultDiscountPercent}`} tier={tier} onSaved={refresh} />)}
      </div>

      <div className="mb-2 flex min-h-9 flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">Discount rules</h2>
        <BulkActions table="discounts/rules" noun="discount rules" selection={selection} exportable={false} refresh={["discount-rules"]} deleteNote="Doctors who were getting these prices go back to their tier's standard discount." />
      </div>
      <SectionCard flush>
        {isPending ? (
          <div className="grid gap-2 p-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-11" />)}</div>
        ) : rules.length === 0 ? (
          <EmptyState icon={BadgePercent} title="No discount rules yet" description="Until you add one, every doctor simply gets their tier's standard discount. Add rules for special brands, bigger quantities, or one doctor's own prices." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 pl-4"><SelectPage selection={selection} noun="discount rules" /></TableHead>
                <TableHead>Rule</TableHead>
                <TableHead>Who gets it</TableHead>
                <TableHead>On</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead>When buying</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20 pr-4"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.id} data-state={selection.has(rule.id) ? "selected" : undefined}>
                  <TableCell className="pl-4"><SelectRow selection={selection} id={rule.id} label={rule.name} /></TableCell>
                  <TableCell className="max-w-56 truncate font-medium">{rule.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="max-w-44 truncate font-normal">{rule.who}</Badge>
                  </TableCell>
                  <TableCell className="max-w-56 truncate">{rule.target ? titleCase(rule.target) : <span className="text-destructive">Removed</span>}</TableCell>
                  <TableCell className="font-medium ledger">{describeDiscount(rule)}</TableCell>
                  <TableCell className="text-muted-foreground">{describeSlab(rule)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {rule.startsOn || rule.endsOn ? `${rule.startsOn ? formatDate(`${rule.startsOn}T12:00:00+05:30`) : "Now"} – ${rule.endsOn ? formatDate(`${rule.endsOn}T12:00:00+05:30`) : "no end"}` : "Always"}
                  </TableCell>
                  <TableCell><StatusBadge status={rule.isActive ? "ACTIVE" : "ARCHIVED"} label={rule.isActive ? "On" : "Off"} /></TableCell>
                  <TableCell className="pr-4 text-right">
                    <Button variant="ghost" size="icon-sm" aria-label={`Edit ${rule.name}`} onClick={() => edit(rule)}><Pencil /></Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Delete ${rule.name}`} disabled={removeRule.isPending} onClick={() => removeRule.mutate(rule)}><Trash2 /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>

      <Dialog open={newTier !== null} onOpenChange={(open) => !open && setNewTier(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add price tier</DialogTitle>
            <DialogDescription>A group of B2B customers who share the same standard discount.</DialogDescription>
          </DialogHeader>
          {newTier ? (
            <form id="tier-form" className="grid gap-4" onSubmit={(e) => { e.preventDefault(); addTier.mutate(); }}>
              <div className="grid gap-1.5"><Label htmlFor="tier-name">Name</Label><Input id="tier-name" required autoFocus placeholder="Senior doctor" value={newTier.name} onChange={(e) => setNewTier({ ...newTier, name: e.target.value })} /></div>
              <div className="grid gap-1.5"><Label htmlFor="tier-percent">Standard discount off retail (%)</Label><Input id="tier-percent" required type="number" min="0" max="90" step="0.5" value={newTier.percent} onChange={(e) => setNewTier({ ...newTier, percent: e.target.value })} /></div>
            </form>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewTier(null)}>Cancel</Button>
            <Button type="submit" form="tier-form" loading={addTier.isPending}>Add tier</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit discount rule" : "Add discount rule"}</DialogTitle>
            <DialogDescription>Say who gets the discount, on what, and how much.</DialogDescription>
          </DialogHeader>
          {draft ? (
            <form id="rule-form" className="grid gap-5" onSubmit={submitRule}>
              <div className="grid gap-1.5">
                <Label htmlFor="rule-name">Name</Label>
                <Input id="rule-name" required autoFocus placeholder="SBL dilutions, 20% for doctors" value={draft.name} onChange={(e) => set("name", e.target.value)} />
              </div>

              <fieldset className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
                <legend className="px-1 text-sm font-medium">Who gets it</legend>
                <div className="grid gap-1.5">
                  <Label>Customers</Label>
                  <Select value={draft.whoKind} onValueChange={(v) => set("whoKind", v as WhoKind)}>
                    <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TIER">Everyone in a price tier</SelectItem>
                      <SelectItem value="DOCTOR">One doctor only</SelectItem>
                      <SelectItem value="EVERYONE">All B2B customers</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {draft.whoKind === "TIER" ? (
                  <div className="grid gap-1.5">
                    <Label>Price tier</Label>
                    <Select value={draft.priceTierId} onValueChange={(v) => set("priceTierId", v)}>
                      <SelectTrigger className="h-9 w-full"><SelectValue placeholder="Choose a tier" /></SelectTrigger>
                      <SelectContent>{tiers.map((tier) => <SelectItem key={tier.id} value={String(tier.id)}>{tier.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                ) : draft.whoKind === "DOCTOR" ? (
                  <div className="grid gap-1.5">
                    <Label>Doctor</Label>
                    <Combobox value={draft.b2bAccountId} onChange={(v) => set("b2bAccountId", v)} options={doctorOptions} allLabel={doctorOptions.length ? "Choose a doctor" : "No B2B customers yet"} searchPlaceholder="Search doctors…" className="w-full" />
                  </div>
                ) : null}
              </fieldset>

              <fieldset className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
                <legend className="px-1 text-sm font-medium">On what</legend>
                <div className="grid gap-1.5">
                  <Label>Applies to</Label>
                  <Select
                    value={draft.scope}
                    onValueChange={(v) => setDraft({ ...draft, scope: v as Scope, productId: null, variantId: null, targetLabel: "", discountType: v !== "VARIANT" && draft.discountType === "FIXED_PRICE" ? "PERCENT" : draft.discountType })}
                  >
                    <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{(Object.keys(SCOPE_LABEL) as Scope[]).map((scope) => <SelectItem key={scope} value={scope}>{SCOPE_LABEL[scope]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {draft.scope === "BRAND" ? (
                  <div className="grid gap-1.5"><Label>Brand</Label><Combobox value={draft.brandId} onChange={(v) => set("brandId", v)} options={brandOptions} allLabel="Choose a brand" searchPlaceholder="Search brands…" className="w-full" /></div>
                ) : draft.scope === "CATEGORY" ? (
                  <div className="grid gap-1.5"><Label>Category</Label><Combobox value={draft.categoryId} onChange={(v) => set("categoryId", v)} options={categoryOptions} allLabel="Choose a category" searchPlaceholder="Search categories…" className="w-full" /></div>
                ) : draft.scope === "PRODUCT" || draft.scope === "VARIANT" ? (
                  <div className="grid gap-1.5">
                    <Label>{draft.scope === "VARIANT" ? "Pack" : "Product"}</Label>
                    {draft.targetLabel ? (
                      <div className="flex h-9 items-center gap-2 rounded-md border px-2.5 text-sm">
                        <span className="min-w-0 flex-1 truncate">{draft.targetLabel}</span>
                        <button type="button" aria-label="Choose a different product" className="text-muted-foreground hover:text-foreground" onClick={() => setDraft({ ...draft, productId: null, variantId: null, targetLabel: "" })}><X className="size-4" /></button>
                      </div>
                    ) : (
                      <VariantPicker onPick={pickTarget} label={draft.scope === "VARIANT" ? "Find a pack" : "Find a product"} className="w-full" />
                    )}
                  </div>
                ) : null}
              </fieldset>

              <fieldset className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
                <legend className="px-1 text-sm font-medium">How much</legend>
                <div className="grid gap-1.5">
                  <Label>Kind of discount</Label>
                  <Select value={draft.discountType} onValueChange={(v) => set("discountType", v as DiscountType)}>
                    <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PERCENT">Percent off the retail price</SelectItem>
                      <SelectItem value="FLAT">Rupees off each unit</SelectItem>
                      {draft.scope === "VARIANT" ? <SelectItem value="FIXED_PRICE">A fixed price per unit</SelectItem> : null}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="rule-value">{draft.discountType === "PERCENT" ? "Percent" : draft.discountType === "FLAT" ? "Rupees off" : "Price (₹)"}</Label>
                  <Input id="rule-value" required type="number" min="0.01" step="0.01" inputMode="decimal" value={draft.value} onChange={(e) => set("value", e.target.value)} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="rule-qty">Minimum quantity</Label>
                  <Input id="rule-qty" type="number" min="1" step="1" inputMode="numeric" value={draft.minQuantity} onChange={(e) => set("minQuantity", e.target.value)} />
                  <p className="text-xs text-muted-foreground">Make several rules with rising quantities for slabs, like 10+ and 50+.</p>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="rule-order">Minimum order value (₹)</Label>
                  <Input id="rule-order" type="number" min="0" step="1" inputMode="numeric" placeholder="No minimum" value={draft.minOrderValue} onChange={(e) => set("minOrderValue", e.target.value)} />
                  <p className="text-xs text-muted-foreground">Counted at retail prices, across the whole order.</p>
                </div>
              </fieldset>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5"><Label htmlFor="rule-start">Starts on <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="rule-start" type="date" value={draft.startsOn} onChange={(e) => set("startsOn", e.target.value)} /></div>
                <div className="grid gap-1.5"><Label htmlFor="rule-end">Ends on <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="rule-end" type="date" min={draft.startsOn || undefined} value={draft.endsOn} onChange={(e) => set("endsOn", e.target.value)} /></div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={draft.isActive} onCheckedChange={(checked) => set("isActive", checked === true)} />
                Rule is switched on
              </label>
            </form>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
            <Button type="submit" form="rule-form" loading={saveRule.isPending}>{draft?.id ? "Save changes" : "Add rule"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
