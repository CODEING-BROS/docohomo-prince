"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import Link from "next/link";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { BulkActions, SelectPage, SelectRow, useSelection } from "@/components/admin/bulk";
import { DateRangePicker } from "@/components/admin/date-range-picker";
import { OrderDelivery } from "@/components/admin/order-delivery";
import { OrderInvoice } from "@/components/admin/order-invoice";
import { OrderPayment } from "@/components/admin/order-payment";
import { OrderReturns } from "@/components/admin/order-returns";
import { Thumb } from "@/components/admin/parts";
import { StatusPicker } from "@/components/admin/status-picker";
import { ColHead, DataTable, DataTableRow, DataTableToolbar, PaginationBar } from "@/components/custom/data-table";
import { DetailList } from "@/components/custom/detail-list";
import { DetailSheet } from "@/components/custom/dialogs";
import { FilterChips } from "@/components/custom/filter-chips";
import { SearchField } from "@/components/custom/form-field";
import { Money } from "@/components/custom/number";
import { PageHero } from "@/components/custom/page-hero";
import { SectionCard } from "@/components/custom/section-card";
import { StatusPill } from "@/components/custom/status-pill";
import { Timeline } from "@/components/custom/timeline";
import { Mono, SectionLabel } from "@/components/custom/typography";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useUrlState } from "@/hooks/use-url-state";
import { api } from "@/lib/api";
import { formatDateTime, formatMoney, formatMoneyExact, formatNumber, humanize, titleCase } from "@/lib/format";
import { useTimeZone } from "@/lib/timezone";
import type { OrderDetail, OrderRow, OrderStatus, Paged } from "@/lib/types";

const STATUSES: OrderStatus[] = [
  "PENDING", "CONFIRMED", "PROCESSING", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY",
  "DELIVERED", "CANCELLED", "UNDELIVERED", "RETURN_REQUESTED", "RETURNED", "REFUNDED",
];

// the same statuses, grouped the way an order moves along
const STATUS_GROUPS: { label: string; statuses: OrderStatus[] }[] = [
  { label: "Being prepared", statuses: ["PENDING", "CONFIRMED", "PROCESSING", "PACKED"] },
  { label: "On the way", statuses: ["SHIPPED", "OUT_FOR_DELIVERY"] },
  { label: "Finished", statuses: ["DELIVERED"] },
  { label: "Did not complete", statuses: ["CANCELLED", "UNDELIVERED"] },
  { label: "Returns and refunds", statuses: ["RETURN_REQUESTED", "RETURNED", "REFUNDED"] },
];

const HISTORY_TONE: Partial<Record<OrderStatus, "success" | "danger" | "info" | "warning">> = {
  DELIVERED: "success", CANCELLED: "danger", UNDELIVERED: "danger", SHIPPED: "info", OUT_FOR_DELIVERY: "info", PENDING: "warning",
};

type OrderList = Paged<OrderRow> & { statusCounts: Partial<Record<OrderStatus, number>> };

function OrderPanel({ orderId, onClose }: { orderId: number | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<OrderStatus | "">("");
  const [note, setNote] = useState("");

  const { data: order, isPending, isError, refetch } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => api<OrderDetail>(`/admin/orders/${orderId}`),
    enabled: orderId !== null,
  });

  const update = useMutation({
    mutationFn: () => api(`/admin/orders/${orderId}/status`, { method: "PATCH", body: { status, note: note || undefined } }),
    onSuccess: () => {
      toast.success(`Order marked ${humanize(status).toLowerCase()}`);
      setStatus("");
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["order", orderId] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err) => toast.error(err.message),
  });

  const moneyLines = order
    ? [
        { label: "Items", value: <Money value={order.subtotal} exact animate={false} /> },
        ...(order.discountTotal ? [{ label: "Discount", value: <Money value={-order.discountTotal} exact animate={false} />, tone: "success" as const }] : []),
        ...(order.couponDiscount ? [{ label: `Coupon${order.couponCode ? ` (${order.couponCode})` : ""}`, value: <Money value={-order.couponDiscount} exact animate={false} />, tone: "success" as const }] : []),
        ...(order.shippingCharge ? [{ label: "Delivery", value: <Money value={order.shippingCharge} exact animate={false} /> }] : []),
        ...(order.codCharge ? [{ label: "Cash on delivery fee", value: <Money value={order.codCharge} exact animate={false} /> }] : []),
      ]
    : [];

  // money still to come that the gateway will not bring: a transfer, a cheque, credit, or cash for a delivered parcel
  const received = order?.payments.filter((p) => p.status === "SUCCESS").reduce((sum, p) => sum + p.amount, 0) ?? 0;
  const due = order ? Math.round((order.grandTotal - received) * 100) / 100 : 0;
  const waiting = order ? ["PENDING", "PARTIALLY_PAID", "FAILED"].includes(order.paymentStatus ?? "") && order.status !== "CANCELLED" && due > 0 : false;

  return (
    <DetailSheet
      open={orderId !== null}
      onClose={onClose}
      wide
      title={order ? <Mono upper className="text-lg">{order.orderNumber}</Mono> : "Order"}
      description={order ? `Placed ${formatDateTime(order.placedAt)}` : undefined}
      status={order ? { status: order.status, kind: "order" } : undefined}
      actions={order ? <StatusPill status={order.channel} dot={false} /> : undefined}
      loading={isPending}
      failed={isError}
      onRetry={() => refetch()}
    >
      {order ? (
        <div className="grid gap-6 text-sm">
          <DetailList
            columns={2}
            items={[
              { label: "Customer", value: <>{order.customerName ?? "—"}<span className="block font-normal text-muted-foreground">{order.customerPhone}{order.customerEmail ? ` · ${order.customerEmail}` : ""}</span>{order.b2bAccount ? <span className="block font-normal text-plum">{order.b2bAccount.businessName} · {humanize(order.b2bAccount.type)}</span> : null}</> },
              { label: "Deliver to", value: <>{order.shippingAddress ?? "—"}<span className="block font-normal text-muted-foreground">{[order.shippingCity, order.shippingState, order.shippingPincode].filter(Boolean).join(", ")}</span></> },
            ]}
          />

          <section>
            <SectionLabel className="mb-3">Items ({order.items.reduce((sum, i) => sum + i.quantity, 0)})</SectionLabel>
            <ul className="grid gap-3">
              {order.items.map((item) => (
                <li key={item.id} className="flex items-start gap-3">
                  <Thumb src={item.imageUrl} name={item.productName} />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2">{titleCase(item.productName)}</p>
                    <p className="text-xs text-muted-foreground">{[item.variantTitle, item.sku, item.brandName ? titleCase(item.brandName) : null].filter(Boolean).join(" · ")}</p>
                  </div>
                  <div className="ledger shrink-0 text-right">
                    <p className="font-medium">{formatMoneyExact(item.lineTotal)}</p>
                    <p className="text-xs text-muted-foreground">{item.quantity} × {formatMoneyExact(item.unitPrice)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <SectionCard tone="muted" bodyClassName="px-4 py-3">
            <DetailList
              items={moneyLines}
              total={{ label: "Total", value: <Money value={order.grandTotal} exact animate={false} />, note: order.paymentMethod === "COD" ? "cash on delivery" : humanize(order.paymentMethod).toLowerCase() }}
            />
            {order.paymentStatus ? <div className="mt-2 flex justify-end"><StatusPill status={order.paymentStatus} kind="payment" /></div> : null}
          </SectionCard>

          {waiting && (order.paymentMethod !== "COD" || order.status === "DELIVERED") ? <OrderPayment key={`pay-${order.id}-${due}`} orderId={order.id} due={due} /> : null}

          <OrderDelivery key={order.id} order={order} />

          <OrderInvoice orderId={order.id} invoiceNumber={order.invoiceNumber} status={order.status} />

          <OrderReturns orderId={order.id} orderNumber={order.orderNumber} status={order.status} />

          <section className="grid gap-2">
            <SectionLabel>Change status</SectionLabel>
            <div className="flex gap-2">
              <StatusPicker value={status} onChange={setStatus} groups={STATUS_GROUPS} exclude={order.status} placeholder="Choose a new status" className="flex-1" />
              <Button size="lg" disabled={!status} loading={update.isPending} onClick={() => update.mutate()}>Update</Button>
            </div>
            {status ? <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the order history (optional)" rows={2} /> : null}
          </section>

          <section>
            <SectionLabel className="mb-3">History</SectionLabel>
            <Timeline
              dense
              items={order.history.map((entry) => ({ id: String(entry.id), title: humanize(entry.status), description: entry.note ?? undefined, at: entry.createdAt, tone: HISTORY_TONE[entry.status as OrderStatus] ?? "neutral" }))}
            />
          </section>
        </div>
      ) : null}
    </DetailSheet>
  );
}

function OrdersView() {
  const url = useUrlState();
  const tz = useTimeZone();
  const [openId, setOpenId] = useState<number | null>(null);

  const filters = {
    tz, q: url.get("q"), status: url.get("status"), channel: url.get("channel"), paymentMethod: url.get("paymentMethod"),
    from: url.get("from"), to: url.get("to"), page: url.get("page") || "1", pageSize: url.get("pageSize") || "20",
    open: url.get("status") ? "" : url.get("open"), // "orders to process": everything not handed to the courier yet
  };
  const { data, isPending, isError, isPlaceholderData, refetch } = useQuery({
    queryKey: ["orders", filters],
    queryFn: () => api<OrderList>("/admin/orders", { query: filters }),
    placeholderData: (previous) => previous,
  });

  const selection = useSelection((data?.items ?? []).map((order) => order.id));

  const counts = data?.statusCounts ?? {};
  const allCount = Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0);
  const chips = [
    { value: "all", label: "All", count: allCount },
    ...(filters.open ? [{ value: "open", label: "To process", count: data?.total ?? 0, tone: "terracotta" as const }] : []),
    ...STATUSES.filter((s) => counts[s] || filters.status === s).map((s) => ({ value: s, label: humanize(s), count: counts[s] ?? 0 })),
  ];

  return (
    <>
      <PageHero
        eyebrow={`Sales · Orders${allCount ? ` · ${formatNumber(allCount)}` : ""}`}
        title="Orders"
        description="Retail and wholesale orders in one place. They confirm, invoice and ship themselves; you pack."
        actions={
          <>
            <Button asChild variant="outline" size="lg"><Link href="/admin/orders/new"><Plus data-icon="inline-start" /> B2B order</Link></Button>
            <Button asChild size="lg"><Link href="/admin/orders/new/retail"><Plus data-icon="inline-start" /> Retail order</Link></Button>
          </>
        }
      >
        <FilterChips
          ariaLabel="Order status"
          value={filters.open ? "open" : filters.status || "all"}
          onChange={(value) => url.set({ status: value === "all" || value === "open" ? "" : value, open: value === "open" ? "1" : "" })}
          options={chips}
        />
      </PageHero>

      <SectionCard flush>
        <DataTableToolbar
          search={<SearchField value={filters.q} onChange={(q) => url.set({ q })} placeholder="Order number, name, phone or email" />}
          hasFilters={url.hasAny}
          onClear={url.clear}
          filters={
            <>
              <Select value={filters.channel || "all"} onValueChange={(v) => url.set({ channel: v === "all" ? "" : v })}>
                <SelectTrigger className="h-9 w-36" aria-label="Order type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All order types</SelectItem>
                  <SelectItem value="D2C">Retail</SelectItem>
                  <SelectItem value="B2B">Wholesale</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filters.paymentMethod || "all"} onValueChange={(v) => url.set({ paymentMethod: v === "all" ? "" : v })}>
                <SelectTrigger className="h-9 w-40" aria-label="Payment method"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All payments</SelectItem>
                  <SelectItem value="COD">Cash on delivery</SelectItem>
                  <SelectItem value="ONLINE">Online</SelectItem>
                  <SelectItem value="CREDIT">Credit</SelectItem>
                  <SelectItem value="BANK_TRANSFER">Bank transfer</SelectItem>
                </SelectContent>
              </Select>
              <DateRangePicker
                align="start"
                value={filters.from && filters.to ? { from: filters.from, to: filters.to } : null}
                onChange={(range) => url.set({ from: range?.from, to: range?.to })}
              />
            </>
          }
          actions={<BulkActions table="orders" noun="orders" refresh={["orders", "dashboard", "notifications"]} deleteNote="Deleted orders also disappear from sales reports." selection={selection} filters={filters} />}
        />

        <DataTable
          isPending={isPending || !data}
          isError={isError}
          isEmpty={data?.items.length === 0}
          isStale={isPlaceholderData}
          onRetry={() => refetch()}
          skeletonCols={7}
          empty={{ illustration: "orders", title: "No orders match", description: "Try a different search, or clear the filters to see every order.", action: url.hasAny ? <Button variant="outline" onClick={url.clear}>Clear filters</Button> : undefined }}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <ColHead className="w-10 pl-4"><SelectPage selection={selection} noun="orders" /></ColHead>
                <ColHead>Order</ColHead>
                <ColHead>Customer</ColHead>
                <ColHead>Type</ColHead>
                <ColHead>Payment</ColHead>
                <ColHead>Status</ColHead>
                <ColHead align="right">Items</ColHead>
                <ColHead align="right" className="pr-4">Total</ColHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.items.map((order) => (
                <DataTableRow key={order.id} selected={selection.has(order.id)} onOpen={() => setOpenId(order.id)} className="h-12!">
                  <TableCell className="pl-4"><SelectRow selection={selection} id={order.id} label={order.orderNumber} /></TableCell>
                  <TableCell>
                    <Mono upper className="font-medium">{order.orderNumber}</Mono>
                    <div className="text-xs text-muted-foreground">{formatDateTime(order.placedAt)}</div>
                  </TableCell>
                  <TableCell>
                    <div className="max-w-48 truncate">{order.customerName ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{[order.customerPhone, order.shippingCity].filter(Boolean).join(" · ")}</div>
                  </TableCell>
                  <TableCell><StatusPill status={order.channel} dot={false} /></TableCell>
                  <TableCell>
                    <div>{order.paymentMethod === "COD" ? "COD" : humanize(order.paymentMethod)}</div>
                    {order.paymentStatus ? <div className="text-xs text-muted-foreground">{humanize(order.paymentStatus)}</div> : null}
                  </TableCell>
                  <TableCell><StatusPill status={order.status} kind="order" /></TableCell>
                  <TableCell className="ledger text-right">{order.itemCount}</TableCell>
                  <TableCell className="ledger pr-4 text-right font-medium">{formatMoney(order.grandTotal)}</TableCell>
                </DataTableRow>
              ))}
            </TableBody>
          </Table>
        </DataTable>

        {data ? (
          <PaginationBar
            page={data.page} pageCount={data.pageCount} pageSize={data.pageSize} total={data.total} noun="orders"
            onPage={(page) => url.set({ page })} onPageSize={(pageSize) => url.set({ pageSize })}
          />
        ) : null}
      </SectionCard>

      <OrderPanel orderId={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

export default function OrdersPage() {
  return (
    <Suspense>
      <OrdersView />
    </Suspense>
  );
}
