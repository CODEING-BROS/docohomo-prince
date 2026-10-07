"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, Clock, RotateCcw, TriangleAlert, Undo2 } from "lucide-react";
import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { toast } from "sonner";
import { BulkActions, SelectPage, SelectRow, useSelection } from "@/components/admin/bulk";
import { EmptyState, PageHeader, PaginationBar, SearchInput, StatCard, StatusBadge } from "@/components/admin/parts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useUrlState } from "@/hooks/use-url-state";
import { api } from "@/lib/api";
import { formatDateTime, formatMoneyExact, formatNumber } from "@/lib/format";
import type { Paged } from "@/lib/types";
import { cn } from "@/lib/utils";
import { FilterChips } from "@/components/custom/filter-chips";
import { SectionCard } from "@/components/custom/section-card";
import { ButtonSpinner, Spinner } from "@/components/custom/loaders";

type RefundStatus = "PENDING" | "SUCCESS" | "FAILED";
type Kind = "order" | "consultation";

type DueRow = {
  paymentId: number; kind: Kind; targetId: number; number: string; customer: string;
  paid: number; left: number; cancelledAt: string | null; reason: string | null; testPayment: boolean; lastProblem: string | null;
};
type RefundRow = {
  id: number; orderId: number | null; appointmentId: number | null; amount: number; paid: number; status: RefundStatus;
  providerRef: string | null; reason: string | null; automatic: boolean; error: string | null; createdAt: string; completedAt: string | null;
  kind: Kind; number: string; customer: string; testPayment: boolean;
};
type RefundList = Paged<RefundRow> & {
  due: DueRow[];
  settings: { automatic: boolean };
  gateway: "gateway" | "test" | "off";
  totals: Partial<Record<RefundStatus, { count: number; amount: number }>>;
};

const STATUSES: RefundStatus[] = ["PENDING", "SUCCESS", "FAILED"];
const STATUS_LABEL: Record<RefundStatus, string> = { PENDING: "On its way", SUCCESS: "Refunded", FAILED: "Did not go through" };

/** The order or consultation a payment was for, as a link to where staff can see it. */
function Target({ kind, number }: { kind: Kind; number: string }) {
  return (
    <>
      <Link href={`${kind === "order" ? "/admin/orders" : "/admin/appointments"}?q=${encodeURIComponent(number)}`} className="font-medium hover:underline">
        {number}
      </Link>
      <div className="text-xs text-muted-foreground">{kind === "order" ? "Order" : "Consultation"}</div>
    </>
  );
}

function RefundsView() {
  const url = useUrlState();
  const queryClient = useQueryClient();
  const [refunding, setRefunding] = useState<DueRow | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [confirmAutomatic, setConfirmAutomatic] = useState(false);

  const filters = { q: url.get("q"), status: url.get("status"), page: url.get("page") || "1", pageSize: url.get("pageSize") || "20" };
  const { data, isPending, isError } = useQuery({
    queryKey: ["refunds", filters],
    queryFn: () => api<RefundList>("/admin/refunds", { query: filters }),
    placeholderData: (previous) => previous,
  });
  const refresh = () => ["refunds", "payments", "orders", "order", "appointments"].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
  // a refund that was sent, or is on its way, is a record of money: only failed ones can be ticked
  const failedIds = useMemo(() => (data?.items ?? []).filter((refund) => refund.status === "FAILED").map((refund) => refund.id), [data]);
  const selection = useSelection(failedIds);

  const send = useMutation({
    mutationFn: (row: DueRow) =>
      api<{ status: RefundStatus; amount: number }>("/admin/refunds", {
        method: "POST",
        body: { ...(row.kind === "order" ? { orderId: row.targetId } : { appointmentId: row.targetId }), amount: Number(amount), reason: reason.trim() },
      }),
    onSuccess: (result, row) => {
      toast.success(
        result.status === "SUCCESS"
          ? `${formatMoneyExact(result.amount)} refunded to ${row.customer}`
          : `Refund of ${formatMoneyExact(result.amount)} sent to the bank. It shows as "On its way" until the bank confirms it.`,
      );
      setRefunding(null);
      refresh();
    },
    onError: (err) => { toast.error(err.message); refresh(); },
  });

  const retry = useMutation({
    mutationFn: (row: RefundRow) => api<{ status: RefundStatus; amount: number }>(`/admin/refunds/${row.id}/retry`, { method: "POST" }),
    onSuccess: (result) => {
      toast.success(result.status === "SUCCESS" ? `${formatMoneyExact(result.amount)} refunded` : "Sent again. Waiting for the bank to confirm it.");
      refresh();
    },
    onError: (err) => { toast.error(err.message); refresh(); },
  });

  const automatic = useMutation({
    mutationFn: (on: boolean) => api<{ automatic: boolean }>("/admin/refunds/settings", { method: "PUT", body: { automatic: on } }),
    onSuccess: (saved) => {
      toast.success(saved.automatic ? "Refunds are now sent automatically" : "Refunds now wait for you to send them");
      setConfirmAutomatic(false);
      refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  const open = (row: DueRow) => {
    setAmount(String(row.left));
    setReason(row.reason ?? (row.kind === "order" ? "Order cancelled" : "Consultation cancelled"));
    setRefunding(row);
  };

  const due = data?.due ?? [];
  const dueAmount = due.reduce((sum, row) => sum + row.left, 0);
  const totals = data?.totals ?? {};
  const isAutomatic = data?.settings.automatic ?? false;
  const amountNumber = Number(amount);
  const amountProblem = !refunding || amount === "" ? null
    : !(amountNumber > 0) ? "Enter an amount above zero"
    : amountNumber > refunding.left ? `At most ${formatMoneyExact(refunding.left)} can still be refunded`
    : null;

  const counts = Object.fromEntries(STATUSES.map((s) => [s, totals[s]?.count ?? 0])) as Record<RefundStatus, number>;
  const tabs = [
    { value: "", label: "All", count: STATUSES.reduce((sum, s) => sum + counts[s], 0) },
    ...STATUSES.filter((s) => counts[s] || filters.status === s).map((s) => ({ value: s as string, label: STATUS_LABEL[s], count: counts[s] })),
  ];

  return (
    <>
      <PageHeader title="Refunds" description="Send money back for cancelled orders and consultations that were paid for online" />

      {data?.gateway === "off" ? (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-warning/15 p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          <p>The payment gateway is not connected, so refunds cannot be sent from here. Refund from the PhonePe business dashboard until it is.</p>
        </div>
      ) : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Waiting for a refund" value={formatMoneyExact(dueAmount)} icon={Undo2} hint={due.length ? `${formatNumber(due.length)} cancelled and paid for` : "Nothing is waiting"} />
        <StatCard label="Refunded" value={formatMoneyExact(totals.SUCCESS?.amount ?? 0)} icon={CircleCheck} hint={`${formatNumber(counts.SUCCESS)} refunds`} />
        <StatCard label="On its way" value={formatMoneyExact(totals.PENDING?.amount ?? 0)} icon={Clock} hint={counts.PENDING ? "Waiting for the bank to confirm" : "None in progress"} />
        <StatCard label="Did not go through" value={formatNumber(counts.FAILED)} icon={TriangleAlert} hint={counts.FAILED ? "Try these again below" : "No failed refunds"} />
      </div>

      <Card className="mb-8">
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-2xl">
            <p className="font-medium">Send refunds automatically</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {isAutomatic
                ? "On. When a paid order or consultation is cancelled, the full amount goes back to the customer straight away. You are told if one does not go through."
                : "Off. When a paid order or consultation is cancelled, you get an alert and it waits in the list below until you press Refund."}
            </p>
          </div>
          <Switch
            checked={isAutomatic} disabled={!data || automatic.isPending} aria-label="Send refunds automatically"
            onCheckedChange={(on) => (on ? setConfirmAutomatic(true) : automatic.mutate(false))}
          />
        </CardContent>
      </Card>

      <section className="mb-8">
        <div className="mb-3">
          <h2 className="font-medium">Waiting for a refund</h2>
          <p className="text-sm text-muted-foreground">Cancelled after the customer paid online, and the money has not gone back yet</p>
        </div>
        <SectionCard flush>
          {isError ? (
            <p className="py-16 text-center text-sm text-muted-foreground">Could not load refunds. Check that the backend is running.</p>
          ) : isPending || !data ? (
            <div className="grid gap-2 p-4">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : due.length === 0 ? (
            <EmptyState icon={CircleCheck} title="Nobody is waiting for money back" description="When an order or a consultation that was paid for online is cancelled, it appears here until the money is returned." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">For</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Cancelled</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Still to refund</TableHead>
                  <TableHead className="w-10 pr-4"><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {due.map((row) => (
                  <TableRow key={row.paymentId}>
                    <TableCell className="pl-4"><Target kind={row.kind} number={row.number} /></TableCell>
                    <TableCell><div className="max-w-48 truncate">{row.customer || "—"}</div></TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.cancelledAt ? formatDateTime(row.cancelledAt) : "—"}
                      {row.reason ? <div className="max-w-64 truncate text-xs" title={row.reason}>{row.reason}</div> : null}
                      {row.lastProblem ? <div className="max-w-64 text-xs whitespace-normal text-destructive">Last try failed: {row.lastProblem}</div> : null}
                    </TableCell>
                    <TableCell className="text-right ledger">{formatMoneyExact(row.paid)}</TableCell>
                    <TableCell className="text-right font-medium ledger">{formatMoneyExact(row.left)}</TableCell>
                    <TableCell className="pr-4 text-right">
                      <Button size="sm" disabled={data.gateway === "off" && !row.testPayment} onClick={() => open(row)}>Refund</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>
      </section>

      <section>
        <div className="mb-3">
          <h2 className="font-medium">Refunds made</h2>
          <p className="text-sm text-muted-foreground">Every refund sent, by you or automatically</p>
        </div>

        <FilterChips ariaLabel="Status" className="mb-3" value={filters.status || "all"} onChange={(v) => url.set({ status: v === "all" ? "" : v })} options={tabs.map((tab) => ({ value: tab.value || "all", label: tab.label, count: tab.count }))} />

        <SectionCard flush>
          <div className="flex flex-wrap items-center gap-2 border-b border-foreground/18 bg-surface-2 px-3 py-2">
            <SearchInput value={filters.q} onChange={(q) => url.set({ q })} placeholder="Order, consultation or customer…" className="w-full sm:w-72" />
            {url.hasAny ? <Button variant="ghost" className="h-9" onClick={url.clear}>Clear filters</Button> : null}
            <BulkActions table="refunds" noun="failed refunds" selection={selection} exportable={false} refresh={["refunds"]} deleteNote="No money moved on these. The amount stays under “waiting to be refunded” until a refund goes through." />
          </div>

          {isError ? (
            <p className="py-16 text-center text-sm text-muted-foreground">Could not load refunds. Check that the backend is running.</p>
          ) : isPending || !data ? (
            <div className="grid gap-2 p-4">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : data.items.length === 0 ? (
            <EmptyState
              icon={Undo2}
              title={url.hasAny ? "No refunds match" : "No refunds yet"}
              description={url.hasAny ? "Try a different search or status, or clear the filters." : "Refunds you send, and ones sent automatically, are listed here with what the bank said."}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 pl-4">{failedIds.length ? <SelectPage selection={selection} noun="failed refunds" /> : null}</TableHead>
                  <TableHead>Refund</TableHead>
                  <TableHead>For</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Why</TableHead>
                  <TableHead className="pr-4"><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((refund) => (
                  <TableRow key={refund.id} data-state={selection.has(refund.id) ? "selected" : undefined}>
                    <TableCell className="pl-4">{refund.status === "FAILED" ? <SelectRow selection={selection} id={refund.id} label={`refund ${refund.id}`} /> : null}</TableCell>
                    <TableCell>
                      <div className="font-medium">#{refund.id}</div>
                      <div className="text-xs text-muted-foreground">{formatDateTime(refund.createdAt)}</div>
                    </TableCell>
                    <TableCell><Target kind={refund.kind} number={refund.number} /></TableCell>
                    <TableCell><div className="max-w-44 truncate">{refund.customer || "—"}</div></TableCell>
                    <TableCell className="text-right font-medium ledger">
                      {formatMoneyExact(refund.amount)}
                      {refund.amount < refund.paid ? <div className="text-xs font-normal text-muted-foreground">of {formatMoneyExact(refund.paid)}</div> : null}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={refund.status} label={STATUS_LABEL[refund.status]} />
                      {refund.status === "FAILED" && refund.error ? <div className="mt-0.5 max-w-60 text-xs whitespace-normal text-destructive">{refund.error}</div> : null}
                      {refund.status === "SUCCESS" && refund.completedAt ? <div className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(refund.completedAt)}</div> : null}
                      {refund.testPayment ? <div className="mt-0.5 text-xs text-muted-foreground">Test payment, no real money</div> : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <div className="max-w-56 truncate" title={refund.reason ?? undefined}>{refund.reason ?? "—"}</div>
                      <div className="text-xs">{refund.automatic ? "Sent automatically" : "Sent by staff"}</div>
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      {refund.status === "FAILED" ? (
                        <Button size="sm" variant="outline" disabled={retry.isPending} onClick={() => retry.mutate(refund)}>
                          {retry.isPending && retry.variables?.id === refund.id ? <Spinner size="sm" /> : <RotateCcw />}
                          Try again
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {data ? (
            <PaginationBar
              page={data.page} pageCount={data.pageCount} pageSize={data.pageSize} total={data.total} noun="refunds"
              onPage={(page) => url.set({ page })} onPageSize={(pageSize) => url.set({ pageSize })}
            />
          ) : null}
        </SectionCard>
      </section>

      {/* send money back for one cancelled order or consultation */}
      <Dialog open={refunding !== null} onOpenChange={(isOpen) => !isOpen && setRefunding(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="pr-8 leading-snug">Refund {refunding?.kind === "order" ? "order" : "consultation"} {refunding?.number}?</DialogTitle>
            <DialogDescription>
              {refunding ? `${refunding.customer || "The customer"} paid ${formatMoneyExact(refunding.paid)}. ${formatMoneyExact(refunding.left)} can still be refunded.` : null}
            </DialogDescription>
          </DialogHeader>
          <form
            id="refund-form" className="grid gap-4"
            onSubmit={(event) => { event.preventDefault(); if (refunding && !amountProblem && !send.isPending) send.mutate(refunding); }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="refund-amount">Amount to refund (₹)</Label>
              <Input id="refund-amount" required type="number" inputMode="decimal" min={1} max={refunding?.left} step="0.01" className="h-9" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <p className={cn("text-xs", amountProblem ? "text-destructive" : "text-muted-foreground")}>{amountProblem ?? "Change this to give back only part of the payment."}</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="refund-reason">Reason</Label>
              <Textarea id="refund-reason" required minLength={3} maxLength={300} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <p className={cn("flex items-start gap-2 rounded-lg p-3 text-sm", refunding?.testPayment ? "bg-muted/50" : "bg-warning/15")}>
              <TriangleAlert className={cn("mt-0.5 size-4 shrink-0", refunding?.testPayment ? "text-muted-foreground" : "text-warning")} />
              {refunding?.testPayment
                ? "This was a test payment, so no real money moves. The refund is only recorded."
                : "This sends real money back through PhonePe to the way the customer paid. It cannot be undone."}
            </p>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefunding(null)}>Cancel</Button>
            <Button type="submit" form="refund-form" loading={send.isPending} disabled={Boolean(amountProblem) || !reason.trim()}>Refund {amount !== "" && !amountProblem ? formatMoneyExact(amountNumber) : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* switching automatic refunds on moves real money without anyone looking: ask first */}
      <Dialog open={confirmAutomatic} onOpenChange={setConfirmAutomatic}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send refunds automatically?</DialogTitle>
            <DialogDescription>
              From now on, when an order or a consultation that was paid for online is cancelled, by the customer, by staff, or because a doctor missed the call, the full amount goes back
              through PhonePe without anyone checking it first.
            </DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Refunds that are already waiting in the list are not sent. Send those yourself.</li>
            <li>You can still give back part of a payment by hand.</li>
            <li>You can switch this off again at any time.</li>
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAutomatic(false)}>Keep it off</Button>
            <Button disabled={automatic.isPending} onClick={() => automatic.mutate(true)}>
              {automatic.isPending ? <ButtonSpinner /> : null}Switch on
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function RefundsPage() {
  return (
    <Suspense>
      <RefundsView />
    </Suspense>
  );
}
