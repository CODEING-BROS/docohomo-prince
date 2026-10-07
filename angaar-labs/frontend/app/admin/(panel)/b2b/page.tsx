"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, MoreHorizontal, Plus } from "lucide-react";
import Link from "next/link";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { B2B_STATUS_LABEL } from "@/components/admin/b2b-form";
import { BulkActions, SelectPage, SelectRow, useSelection } from "@/components/admin/bulk";
import { EmptyState, PageHeader, PaginationBar, SearchInput, StatusBadge } from "@/components/admin/parts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useUrlState } from "@/hooks/use-url-state";
import { api } from "@/lib/api";
import { formatDate, formatMoney, formatNumber, humanize } from "@/lib/format";
import type { B2BAccountRow, Paged, PriceTier, VerificationStatus } from "@/lib/types";
import { FilterChips } from "@/components/custom/filter-chips";
import { SectionCard } from "@/components/custom/section-card";
import { ButtonSpinner, Spinner } from "@/components/custom/loaders";

type Changes = { priceTierId?: number; status?: "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "SUSPENDED"; reason?: string };
type B2BList = Paged<B2BAccountRow> & { statusCounts: Partial<Record<VerificationStatus, number>> };

const STATUS_LABEL = B2B_STATUS_LABEL;
const TABS: VerificationStatus[] = ["PENDING", "UNDER_REVIEW", "APPROVED", "SUSPENDED", "REJECTED"];

function B2BView() {
  const url = useUrlState();
  const queryClient = useQueryClient();
  // rejecting or pausing asks for a reason first
  const [asking, setAsking] = useState<{ account: B2BAccountRow; status: "REJECTED" | "SUSPENDED" } | null>(null);
  const [reason, setReason] = useState("");

  const filters = {
    q: url.get("q"), tierId: url.get("tierId"), status: url.get("status"),
    page: url.get("page") || "1", pageSize: url.get("pageSize") || "20",
  };
  const { data, isPending, isError } = useQuery({
    queryKey: ["b2b", filters],
    queryFn: () => api<B2BList>("/admin/b2b", { query: filters }),
    placeholderData: (previous) => previous,
  });
  const { data: tierData } = useQuery({ queryKey: ["b2b-tiers"], queryFn: () => api<{ tiers: PriceTier[] }>("/admin/b2b/tiers") });
  const tiers = tierData?.tiers ?? [];
  const selection = useSelection((data?.items ?? []).map((a) => a.id));

  const update = useMutation({
    mutationFn: (input: { account: B2BAccountRow; changes: Changes; done: string }) =>
      api(`/admin/b2b/${input.account.id}`, { method: "PATCH", body: input.changes }),
    onSuccess: (_result, input) => {
      toast.success(input.done);
      setAsking(null);
      setReason("");
      ["b2b", "b2b-tiers", "dashboard", "notifications"].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
    },
    onError: (err) => toast.error(err.message),
  });

  const counts = data?.statusCounts ?? {};
  const tabs = [
    { value: "", label: "All", count: Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0) },
    ...TABS.filter((s) => counts[s] || filters.status === s).map((s) => ({ value: s as string, label: STATUS_LABEL[s] ?? humanize(s), count: counts[s] ?? 0 })),
  ];

  return (
    <>
      <PageHeader
        title="B2B customers"
        description="Doctors who registered to buy at wholesale prices. New applications wait here for your approval."
      >
        <Button asChild className="h-9"><Link href="/admin/b2b/new"><Plus /> Add B2B customer</Link></Button>
      </PageHeader>

      {tiers.length ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          {tiers.map((tier) => (
            <Card key={tier.id}>
              <CardContent className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{tier.name} tier</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatNumber(tier.accountCount)} {tier.accountCount === 1 ? "account" : "accounts"}
                  </p>
                </div>
                <p className="text-right">
                  <span className="text-xl font-semibold ledger">{tier.defaultDiscountPercent}%</span>
                  <span className="block text-[11px] text-muted-foreground">off retail price</span>
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      <FilterChips ariaLabel="Status" className="mb-3" value={filters.status || "all"} onChange={(v) => url.set({ status: v === "all" ? "" : v })} options={tabs.map((tab) => ({ value: tab.value || "all", label: tab.label, count: tab.count }))} />

      <SectionCard flush>
        <div className="flex flex-wrap items-center gap-2 border-b border-foreground/18 bg-surface-2 px-3 py-2">
          <SearchInput value={filters.q} onChange={(q) => url.set({ q })} placeholder="Doctor, clinic, phone or registration number" className="w-full sm:w-80" />
          <Select value={filters.tierId || "all"} onValueChange={(v) => url.set({ tierId: v === "all" ? "" : v })}>
            <SelectTrigger className="h-9 w-40" aria-label="Price tier"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All price tiers</SelectItem>
              {tiers.map((tier) => <SelectItem key={tier.id} value={String(tier.id)}>{tier.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {url.hasAny ? <Button variant="ghost" className="h-9" onClick={url.clear}>Clear filters</Button> : null}
          <BulkActions table="b2b" noun="B2B customers" selection={selection} filters={filters} refresh={["b2b", "b2b-tiers", "dashboard"]} deleteNote="Their past orders are kept." />
        </div>

        {isError ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Could not load B2B customers. Check that the backend is running.</p>
        ) : isPending || !data ? (
          <div className="grid gap-2 p-4">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : data.items.length === 0 ? (
          <EmptyState
            icon={Building2}
            title={url.hasAny ? "No B2B customers match" : "No B2B customers yet"}
            description={url.hasAny ? "Try a different search, or clear the filters." : "When a doctor applies to buy at wholesale prices, the application appears here for you to approve."}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 pl-4"><SelectPage selection={selection} noun="B2B customers" /></TableHead>
                <TableHead>Doctor</TableHead>
                <TableHead>Registration</TableHead>
                <TableHead>Price tier</TableHead>
                <TableHead className="text-right">B2B orders</TableHead>
                <TableHead className="text-right">Spent</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Applied</TableHead>
                <TableHead className="w-10 pr-4"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((account) => {
                const busy = update.isPending && update.variables?.account.id === account.id;
                return (
                  <TableRow key={account.id} data-state={selection.has(account.id) ? "selected" : undefined}>
                    <TableCell className="pl-4"><SelectRow selection={selection} id={account.id} label={account.name} /></TableCell>
                    <TableCell>
                      <Link href={`/admin/b2b/${account.id}`} className="block max-w-52 truncate font-medium hover:underline">{account.name}</Link>
                      <div className="max-w-52 truncate text-xs text-muted-foreground">
                        {[account.businessName !== account.name ? account.businessName : null, account.phone, account.city].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>{account.registrationNumber ?? <span className="text-muted-foreground">Not provided</span>}</div>
                      <div className="text-xs text-muted-foreground">{account.documentCount} {account.documentCount === 1 ? "document" : "documents"}</div>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={account.tier ? String(account.tier.id) : ""}
                        onValueChange={(v) => {
                          const tier = tiers.find((t) => t.id === Number(v));
                          update.mutate({ account, changes: { priceTierId: Number(v) }, done: `${account.name} moved to the ${tier?.name ?? "new"} tier` });
                        }}
                      >
                        <SelectTrigger size="sm" className="w-40" aria-label={`Price tier for ${account.name}`}>
                          <SelectValue placeholder="Not set" />
                        </SelectTrigger>
                        <SelectContent>
                          {tiers.map((tier) => (
                            <SelectItem key={tier.id} value={String(tier.id)}>{tier.name} · {tier.defaultDiscountPercent}% off</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right ledger">{formatNumber(account.orderCount)}</TableCell>
                    <TableCell className="text-right font-medium ledger">{account.totalSpent ? formatMoney(account.totalSpent) : "—"}</TableCell>
                    <TableCell><StatusBadge status={account.status} label={STATUS_LABEL[account.status] ?? humanize(account.status)} /></TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(account.createdAt)}</TableCell>
                    <TableCell className="pr-4">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${account.name}`}>
                            {busy ? <Spinner size="sm" /> : <MoreHorizontal />}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-52">
                          <DropdownMenuItem asChild><Link href={`/admin/b2b/${account.id}`}>Edit details</Link></DropdownMenuItem>
                          {account.status !== "APPROVED" ? (
                            <DropdownMenuItem onSelect={() => update.mutate({ account, changes: { status: "APPROVED" }, done: `${account.name} can now buy at wholesale prices` })}>
                              {account.status === "SUSPENDED" ? "Resume wholesale access" : "Approve"}
                            </DropdownMenuItem>
                          ) : null}
                          {account.status === "PENDING" ? (
                            <DropdownMenuItem onSelect={() => update.mutate({ account, changes: { status: "UNDER_REVIEW" }, done: `${account.name} marked as under review` })}>
                              Mark as under review
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuSeparator />
                          {account.status === "APPROVED" ? (
                            <DropdownMenuItem variant="destructive" onSelect={() => setAsking({ account, status: "SUSPENDED" })}>Pause wholesale access…</DropdownMenuItem>
                          ) : account.status !== "REJECTED" ? (
                            <DropdownMenuItem variant="destructive" onSelect={() => setAsking({ account, status: "REJECTED" })}>Reject…</DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {data ? (
          <PaginationBar
            page={data.page} pageCount={data.pageCount} pageSize={data.pageSize} total={data.total} noun="B2B customers"
            onPage={(page) => url.set({ page })} onPageSize={(pageSize) => url.set({ pageSize })}
          />
        ) : null}
      </SectionCard>

      <Dialog open={asking !== null} onOpenChange={(open) => { if (!open) { setAsking(null); setReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{asking?.status === "SUSPENDED" ? "Pause wholesale access for" : "Reject"} {asking?.account.name}?</DialogTitle>
            <DialogDescription>
              {asking?.status === "SUSPENDED"
                ? "They keep their account but pay retail prices until you resume access."
                : "The doctor is told why, so they can fix it and apply again."}
            </DialogDescription>
          </DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" rows={3} autoFocus />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAsking(null); setReason(""); }}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!reason.trim() || update.isPending}
              onClick={() => asking && update.mutate({
                account: asking.account,
                changes: { status: asking.status, reason: reason.trim() },
                done: asking.status === "SUSPENDED" ? `Wholesale access paused for ${asking.account.name}` : `${asking.account.name} rejected`,
              })}
            >
              {update.isPending ? <ButtonSpinner /> : null}{asking?.status === "SUSPENDED" ? "Pause access" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function B2BPage() {
  return (
    <Suspense>
      <B2BView />
    </Suspense>
  );
}
