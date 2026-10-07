"use client";

import { useQuery } from "@tanstack/react-query";
import { CreditCard } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { BulkActions, SelectPage, SelectRow, useSelection } from "@/components/admin/bulk";
import { DateRangePicker } from "@/components/admin/date-range-picker";
import { EmptyState, PageHeader, PaginationBar, SearchInput, StatusBadge } from "@/components/admin/parts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useUrlState } from "@/hooks/use-url-state";
import { api } from "@/lib/api";
import { formatDateTime, formatMoneyExact, formatNumber, humanize } from "@/lib/format";
import { useTimeZone } from "@/lib/timezone";
import type { Paged } from "@/lib/types";
import { SectionCard } from "@/components/custom/section-card";

type PaymentStatus = "CREATED" | "PENDING" | "SUCCESS" | "FAILED" | "REFUNDED";

type PaymentRow = {
  id: number; createdAt: string; paidAt: string | null;
  orderNumber: string | null; appointmentNumber: string | null; customerName: string | null;
  provider: string; method: string | null; providerRef: string | null;
  amount: number; refundedAmount: number; currency: string; status: PaymentStatus;
};
type PaymentList = Paged<PaymentRow> & {
  totals: { count: number; successCount: number; successAmount: number; refundedAmount: number };
  providers: string[];
};

const STATUS_LABEL: Record<PaymentStatus, string> = {
  CREATED: "Started", PENDING: "Waiting", SUCCESS: "Successful", FAILED: "Failed", REFUNDED: "Refunded",
};
// the badge colours are shared with other pages; a payment that was only started is shown as neutral
const STATUS_TONE: Record<PaymentStatus, string> = {
  CREATED: "DRAFT", PENDING: "PENDING", SUCCESS: "SUCCESS", FAILED: "FAILED", REFUNDED: "REFUNDED",
};
const PROVIDER_LABEL: Record<string, string> = {
  PHONEPE: "PhonePe", RAZORPAY: "Razorpay", COD: "Cash on delivery", MANUAL: "Recorded by staff",
};
const providerLabel = (provider: string) => PROVIDER_LABEL[provider] ?? humanize(provider);

function PaymentsView() {
  const url = useUrlState();
  const tz = useTimeZone();

  const filters = {
    tz, q: url.get("q"), status: url.get("status"), provider: url.get("provider"),
    from: url.get("from"), to: url.get("to"), page: url.get("page") || "1", pageSize: url.get("pageSize") || "20",
  };
  const { data, isPending, isError } = useQuery({
    queryKey: ["payments", filters],
    queryFn: () => api<PaymentList>("/admin/payments", { query: filters }),
    placeholderData: (previous) => previous,
  });

  // any row can be ticked to export it; "delete" only removes attempts that never brought money in
  // (the server keeps every payment that succeeded or was refunded, and says how many it kept)
  const selection = useSelection((data?.items ?? []).map((payment) => payment.id));

  const totals = data?.totals;
  const summary = [
    { label: "Payments", value: totals ? formatNumber(totals.count) : "—", hint: url.hasAny ? "Matching your search and filters" : "Every payment on record" },
    { label: "Successful payments", value: totals ? formatNumber(totals.successCount) : "—", hint: "Money that actually came in" },
    {
      label: "Amount received", value: totals ? formatMoneyExact(totals.successAmount) : "—",
      hint: totals?.refundedAmount ? `${formatMoneyExact(totals.refundedAmount)} of this was refunded later` : "Total of the successful payments",
    },
  ];

  return (
    <>
      <PageHeader title="Payments" description="Money received for orders and consultations. This list is for viewing only." />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {summary.map((item) => (
          <Card key={item.label}>
            <CardContent>
              <p className="text-sm text-muted-foreground">{item.label}</p>
              <p className="mt-1 truncate text-2xl font-semibold tracking-tight ledger">{item.value}</p>
              <p className="mt-1.5 text-xs text-muted-foreground">{item.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <SectionCard flush>
        <div className="flex flex-wrap items-center gap-2 border-b border-foreground/18 bg-surface-2 px-3 py-2">
          <SearchInput value={filters.q} onChange={(q) => url.set({ q })} placeholder="Reference or order number" className="w-full sm:w-72" />
          <Select value={filters.status || "all"} onValueChange={(v) => url.set({ status: v === "all" ? "" : v })}>
            <SelectTrigger className="h-9 w-40" aria-label="Payment status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {(Object.keys(STATUS_LABEL) as PaymentStatus[]).map((status) => (
                <SelectItem key={status} value={status}>{STATUS_LABEL[status]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.provider || "all"} onValueChange={(v) => url.set({ provider: v === "all" ? "" : v })}>
            <SelectTrigger className="h-9 w-44" aria-label="Paid through"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All payment services</SelectItem>
              {[...new Set([...(data?.providers ?? []), ...(filters.provider ? [filters.provider] : [])])].map((provider) => (
                <SelectItem key={provider} value={provider}>{providerLabel(provider)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DateRangePicker
            align="start"
            value={filters.from && filters.to ? { from: filters.from, to: filters.to } : null}
            onChange={(range) => url.set({ from: range?.from, to: range?.to })}
          />
          {url.hasAny ? <Button variant="ghost" className="h-9" onClick={url.clear}>Clear filters</Button> : null}
          <BulkActions table="payments" noun="payments" selection={selection} filters={filters} refresh={["payments"]} deleteNote="Only failed attempts, and unfinished ones older than a day, are removed. Payments that brought money in or were refunded are your accounts record and are kept." />
        </div>

        {isError ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Could not load payments. Check that the backend is running.</p>
        ) : isPending || !data ? (
          <div className="grid gap-2 p-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : data.items.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title={url.hasAny ? "No payments match" : "No payments yet"}
            description={url.hasAny ? "Try a different search, or clear the filters to see every payment." : "Payments appear here as customers pay for orders and consultations."}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 pl-4"><SelectPage selection={selection} noun="payments" /></TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Paid through</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="pr-4">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((payment) => (
                <TableRow key={payment.id} data-state={selection.has(payment.id) ? "selected" : undefined}>
                  <TableCell className="pl-4"><SelectRow selection={selection} id={payment.id} label={`the payment of ${formatDateTime(payment.createdAt)}`} /></TableCell>
                  <TableCell className="text-muted-foreground">{formatDateTime(payment.createdAt)}</TableCell>
                  <TableCell>
                    {payment.orderNumber ? (
                      <Link href={`/admin/orders?q=${encodeURIComponent(payment.orderNumber)}`} className="font-medium text-primary hover:underline">
                        {payment.orderNumber}
                      </Link>
                    ) : payment.appointmentNumber ? (
                      <>
                        <div className="font-medium">{payment.appointmentNumber}</div>
                        <div className="text-xs text-muted-foreground">Consultation</div>
                      </>
                    ) : (
                      <span className="text-muted-foreground">No order linked</span>
                    )}
                  </TableCell>
                  <TableCell><div className="max-w-48 truncate">{payment.customerName ?? "—"}</div></TableCell>
                  <TableCell>
                    <div>{providerLabel(payment.provider)}</div>
                    {payment.method ? <div className="text-xs text-muted-foreground">{payment.method}</div> : null}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    <div className="max-w-56 truncate" title={payment.providerRef ?? undefined}>{payment.providerRef ?? "—"}</div>
                  </TableCell>
                  <TableCell className="text-right font-medium ledger">
                    {formatMoneyExact(payment.amount)}
                    {payment.refundedAmount > 0 ? (
                      <div className="text-xs font-normal text-muted-foreground">{formatMoneyExact(payment.refundedAmount)} refunded</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="pr-4"><StatusBadge status={STATUS_TONE[payment.status]} label={STATUS_LABEL[payment.status]} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {data ? (
          <PaginationBar
            page={data.page} pageCount={data.pageCount} pageSize={data.pageSize} total={data.total} noun="payments"
            onPage={(page) => url.set({ page })} onPageSize={(pageSize) => url.set({ pageSize })}
          />
        ) : null}
      </SectionCard>
    </>
  );
}

export default function PaymentsPage() {
  return (
    <Suspense>
      <PaymentsView />
    </Suspense>
  );
}
