"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowDownRight, ArrowUpRight, Ban, CircleAlert, Download, IndianRupee, type LucideIcon, Mail, Package, PackageCheck,
  Percent, Receipt, SearchX, ShoppingCart, UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { type DayRange, DateRangePicker } from "@/components/admin/date-range-picker";
import { EmptyState, PageHeader, StatusBadge } from "@/components/admin/parts";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { formatCompact, formatDate, formatMoney, formatNumber, humanize, titleCase } from "@/lib/format";
import { shiftDay, todayInZone, useTimeZone, zoneShortName } from "@/lib/timezone";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────── What the backend sends

type ChannelFilter = "ALL" | "D2C" | "B2B";
/** Sent with every report: the dates, the timezone they are counted in, and the sales channel. */
type Filters = { from: string; to: string; tz: string; channel?: "D2C" | "B2B" };

type Metric = { value: number; previous: number | null; change: number | null };
type Summary = {
  range: { from: string; to: string; previousFrom: string; previousTo: string; firstOrderDay: string; comparable: boolean };
  totals: Record<
    "revenue" | "ordersPlaced" | "salesOrders" | "averageOrderValue" | "unitsSold" | "newCustomers" | "cancelledOrders" | "cancelledShare",
    Metric
  >;
};

type Report<Row> = { rows: Row[] };
type SalesRow = { name: string; orders: number; units: number; revenue: number };
type TimeRow = { date: string; orders: number; units: number; revenue: number; d2cRevenue: number; b2bRevenue: number };
type ProductRow = SalesRow & { productId: number | null; brand: string | null };
type StatusRow = SalesRow & { status: string; countsAsSale: boolean };
type CustomerRow = { userId: number | null; name: string | null; phone: string | null; orders: number; revenue: number; lastOrderAt: string };
type B2BRow = {
  accountId: number; doctor: string; clinic: string; type: string; tier: string | null; city: string | null;
  orders: number; revenue: number; lastOrderAt: string;
};
type StockRow = {
  variantId: number; productId: number; product: string; variant: string; sku: string; brand: string | null;
  stock: number; limit: number; state: "OUT" | "LOW";
};
type StockReport = { counts: { outOfStock: number; lowStock: number }; rows: StockRow[] };

// ─────────────────────────────────────────────────────────── Loading and downloading

/** Loads one report. While new dates are loading, the old numbers stay on screen (dimmed). */
function useReport<T>(name: string, filters: Filters) {
  return useQuery({
    queryKey: ["reports", name, filters],
    queryFn: () => api<T>(`/admin/reports/${name}`, { query: filters }),
    placeholderData: (previous) => previous,
  });
}

/** Saves the same report as a spreadsheet file (opens in Excel and Google Sheets). */
const downloadReport = (name: string, filters: Filters) => {
  const params = new URLSearchParams({ format: "csv" });
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  const link = document.createElement("a");
  link.href = `/api/admin/reports/${name}?${params}`;
  link.download = "";
  document.body.appendChild(link);
  link.click();
  link.remove();
};

const parseDay = (day: string) => new Date(`${day}T00:00:00`);
const longDay = (day: string) => format(parseDay(day), "d MMM yyyy");
const sum = <T,>(rows: T[], pick: (row: T) => number) => rows.reduce((total, row) => total + pick(row), 0);
const percentOf = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "—");
const paymentLabel = (method: string) => (method === "COD" ? "Cash on delivery" : humanize(method));
const shorten = (text: string, max = 22) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

// ─────────────────────────────────────────────────────────── Header controls

const lastDays = (days: number): DayRange => {
  const today = todayInZone();
  return { from: shiftDay(today, 1 - days), to: today };
};
const defaultRange = () => lastDays(30);

const QUICK_RANGES = [
  { label: "Today", days: 1 },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "3 months", days: 90 },
  { label: "6 months", days: 180 },
  { label: "1 year", days: 365 },
];

const segmentClass = (active: boolean) =>
  cn(
    "h-full rounded-md px-3 text-sm whitespace-nowrap transition-colors",
    active ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
  );
const SEGMENT_GROUP = "inline-flex h-9 max-w-full items-center overflow-x-auto rounded-lg border bg-muted/50 p-0.5";

/** One-click date ranges, the same ones as on the dashboard. "All" starts at the first order ever. */
function QuickRanges({ value, onChange, firstDay }: { value: DayRange; onChange: (range: DayRange) => void; firstDay?: string }) {
  const ranges = [
    ...QUICK_RANGES.map((quick) => ({ label: quick.label, range: lastDays(quick.days) })),
    ...(firstDay ? [{ label: "All", range: { from: firstDay, to: todayInZone() } }] : []),
  ];
  return (
    <div role="group" aria-label="Quick date ranges" className={SEGMENT_GROUP}>
      {ranges.map(({ label, range }) => {
        const active = value.from === range.from && value.to === range.to;
        return (
          <button key={label} type="button" aria-pressed={active} onClick={() => onChange(range)} className={segmentClass(active)}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** A small row of buttons where exactly one is picked. */
function Segmented<V extends string>({
  label, value, onChange, options,
}: { label: string; value: V; onChange: (value: V) => void; options: { value: V; label: string; hint?: string }[] }) {
  return (
    <div role="group" aria-label={label} className={SEGMENT_GROUP}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.hint}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={segmentClass(value === option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

const CHANNELS: { value: ChannelFilter; label: string; hint: string }[] = [
  { value: "ALL", label: "All", hint: "Every order" },
  { value: "D2C", label: "D2C", hint: "Retail customers" },
  { value: "B2B", label: "B2B", hint: "Doctors and wholesale buyers" },
];
const CHANNEL_NAME: Record<"D2C" | "B2B", string> = { D2C: "D2C (retail)", B2B: "B2B (doctors & wholesale)" };

// ─────────────────────────────────────────────────────────── Summary cards

/** A headline number and how it moved against the period just before. */
function SummaryCard({
  label, value, metric, icon: Icon, note, lowerIsBetter = false, changeUnit = "%",
}: {
  label: string; value: string; metric: Metric; icon: LucideIcon; note?: string; lowerIsBetter?: boolean; changeUnit?: "%" | " points";
}) {
  const { change } = metric;
  const up = (change ?? 0) > 0;
  const flat = change === 0;
  const good = flat ? null : up !== lowerIsBetter;
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 truncate text-2xl font-semibold tracking-tight ledger">{value}</p>
          <p className="mt-1.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            {change === null ? (
              "No earlier data to compare"
            ) : flat ? (
              "Same as the previous period"
            ) : (
              <>
                <span className={cn("inline-flex items-center gap-0.5 font-medium", good ? "text-success" : "text-destructive")}>
                  {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                  {Math.abs(change)}{changeUnit}
                </span>
                vs previous period
              </>
            )}
          </p>
          {note ? <p className="mt-1 text-xs text-muted-foreground/80">{note}</p> : null}
        </div>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4.5" />
        </span>
      </CardContent>
    </Card>
  );
}

function SummaryCards({ filters }: { filters: Filters }) {
  const { data, isPending, isError, isPlaceholderData } = useReport<Summary>("summary", filters);

  if (isError) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Could not load the summary. Check that the backend is running, then refresh.
        </CardContent>
      </Card>
    );
  }
  if (isPending || !data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
    );
  }

  const { totals, range } = data;
  return (
    <div className={cn("transition-opacity", isPlaceholderData && "opacity-60")}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Revenue" value={formatMoney(totals.revenue.value)} metric={totals.revenue} icon={IndianRupee} note="Money from orders that counted as sales" />
        <SummaryCard label="Orders placed" value={formatNumber(totals.ordersPlaced.value)} metric={totals.ordersPlaced} icon={ShoppingCart} note="Every order, including cancelled ones" />
        <SummaryCard label="Orders counted as sales" value={formatNumber(totals.salesOrders.value)} metric={totals.salesOrders} icon={PackageCheck} note="Not cancelled, undelivered, returned or refunded" />
        <SummaryCard label="Average order value" value={formatMoney(totals.averageOrderValue.value)} metric={totals.averageOrderValue} icon={Receipt} note="Revenue divided by orders counted as sales" />
        <SummaryCard label="Units sold" value={formatNumber(totals.unitsSold.value)} metric={totals.unitsSold} icon={Package} note="Items in orders counted as sales" />
        <SummaryCard label="New customers" value={formatNumber(totals.newCustomers.value)} metric={totals.newCustomers} icon={UserPlus} note="Customers who signed up in these dates" />
        <SummaryCard label="Cancelled orders" value={formatNumber(totals.cancelledOrders.value)} metric={totals.cancelledOrders} icon={Ban} lowerIsBetter note="Lower is better" />
        <SummaryCard label="Share of orders cancelled" value={`${totals.cancelledShare.value}%`} metric={totals.cancelledShare} icon={Percent} lowerIsBetter changeUnit=" points" note="Cancelled orders out of all orders placed" />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {range.comparable
          ? `"Previous period" means the same number of days just before: ${longDay(range.previousFrom)} – ${longDay(range.previousTo)}.`
          : "These dates go back to your very first order, so there is no earlier period to compare with."}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────── Building blocks for a report

/** The frame every report sits in: a title, a plain explanation and the Download button. */
function ReportCard({
  title, description, onDownload, toolbar, children,
}: { title: string; description: string; onDownload: () => void; toolbar?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        <CardAction className="flex flex-wrap items-center justify-end gap-2">
          {toolbar}
          <Button variant="outline" className="h-9" onClick={onDownload} title="Save this report as a spreadsheet file">
            <Download /> Download
          </Button>
        </CardAction>
      </CardHeader>
      {children}
    </Card>
  );
}

/** Shows a skeleton while loading, a message when it failed or there is nothing, and the report otherwise. */
function ReportBody({
  loading, failed, stale, empty, emptyTitle, emptyText, chart = true, children,
}: {
  loading: boolean; failed: boolean; stale: boolean; empty: boolean; emptyTitle: string; emptyText: string; chart?: boolean;
  children: React.ReactNode;
}) {
  if (failed) {
    return (
      <CardContent>
        <EmptyState icon={CircleAlert} title="Could not load this report" description="Check that the backend is running, then refresh the page." />
      </CardContent>
    );
  }
  if (loading) {
    return (
      <CardContent className="grid gap-3" aria-busy>
        {chart ? <Skeleton className="h-56 rounded-lg" /> : null}
        {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-9 rounded-md" />)}
      </CardContent>
    );
  }
  if (empty) {
    return (
      <CardContent>
        <EmptyState icon={SearchX} title={emptyTitle} description={emptyText} />
      </CardContent>
    );
  }
  return <div className={cn("flex flex-col gap-4 transition-opacity", stale && "opacity-60")}>{children}</div>;
}

/** What to say when nothing was sold in the chosen dates. */
const noSales = (filters: Filters) => ({
  emptyTitle: "No sales in these dates",
  emptyText: `Nothing was sold between ${longDay(filters.from)} and ${longDay(filters.to)}${filters.channel ? ` through ${filters.channel}` : ""}. Try a longer date range${filters.channel ? ", or set the channel to All" : ""}.`,
});

type ColumnDef<Row> = { header: string; align?: "right"; className?: string; cell: (row: Row, index: number) => React.ReactNode };

const ROWS_SHOWN_FIRST = 100;

/** A plain table of every row. Long lists start with the first 100 and a button to show the rest. */
function DataTable<Row>({
  columns, rows, rowKey, totals,
}: { columns: ColumnDef<Row>[]; rows: Row[]; rowKey: (row: Row, index: number) => string | number; totals?: React.ReactNode[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? rows : rows.slice(0, ROWS_SHOWN_FIRST);
  const edge = (index: number) => cn(index === 0 && "pl-4", index === columns.length - 1 && "pr-4");
  return (
    <div className="border-t">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column, index) => (
              <TableHead key={column.header} className={cn(edge(index), column.align === "right" && "text-right")}>{column.header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((row, rowIndex) => (
            <TableRow key={rowKey(row, rowIndex)}>
              {columns.map((column, index) => (
                <TableCell key={column.header} className={cn(edge(index), column.align === "right" && "text-right ledger", column.className)}>
                  {column.cell(row, rowIndex)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
        {totals ? (
          <TableFooter>
            <TableRow>
              {totals.map((cell, index) => (
                <TableCell key={columns[index].header} className={cn(edge(index), "font-medium", columns[index].align === "right" && "text-right ledger")}>
                  {cell}
                </TableCell>
              ))}
            </TableRow>
          </TableFooter>
        ) : null}
      </Table>
      {rows.length > ROWS_SHOWN_FIRST ? (
        <div className="flex items-center justify-between gap-3 border-t px-4 pt-3 text-sm text-muted-foreground">
          <span>
            Showing {formatNumber(visible.length)} of {formatNumber(rows.length)} rows
          </span>
          <Button variant="outline" size="sm" onClick={() => setShowAll((current) => !current)}>
            {showAll ? "Show fewer" : `Show all ${formatNumber(rows.length)}`}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Side-by-side bars for the ten biggest rows. */
function TopBars({
  items, label, formatValue, color = "var(--chart-1)", caption,
}: { items: { name: string; value: number }[]; label: string; formatValue: (value: number) => string; color?: string; caption?: string }) {
  const config = { value: { label, color } } satisfies ChartConfig;
  const data = items.slice(0, 10);
  return (
    <CardContent>
      {caption ? <p className="mb-2 text-xs text-muted-foreground">{caption}</p> : null}
      <ChartContainer config={config} className="aspect-auto w-full" style={{ height: Math.max(96, data.length * 34 + 28) }}>
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 16 }}>
          <CartesianGrid horizontal={false} />
          <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(v: number) => formatCompact(v)} />
          <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={148} tick={{ fontSize: 12 }} tickFormatter={(v: string) => shorten(v)} />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                formatter={(value) => (
                  <div className="flex w-full items-center justify-between gap-6">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium ledger">{formatValue(Number(value))}</span>
                  </div>
                )}
              />
            }
          />
          <Bar dataKey="value" fill="var(--color-value)" radius={4} barSize={18} />
        </BarChart>
      </ChartContainer>
    </CardContent>
  );
}

const topCaption = (count: number, what: string) => (count > 10 ? `The top 10 ${what}. The table below lists all ${formatNumber(count)}.` : undefined);

// ─────────────────────────────────────────────────────────── Sales over time

const timeConfig = {
  d2cRevenue: { label: CHANNEL_NAME.D2C, color: "var(--chart-1)" },
  b2bRevenue: { label: CHANNEL_NAME.B2B, color: "var(--chart-3)" },
} satisfies ChartConfig;

function SalesOverTime({ filters }: { filters: Filters }) {
  const report = useReport<Report<TimeRow> & { unit: "day" | "month" }>("sales-over-time", filters);
  const rows = report.data?.rows ?? [];
  const byDay = report.data?.unit !== "month";
  const label = (day: string) => format(parseDay(day), byDay ? "EEE, d MMM yyyy" : "MMMM yyyy");
  const newestFirst = [...rows].reverse();

  return (
    <ReportCard
      title="Sales over time"
      description={
        byDay
          ? "Revenue, orders and units for each day. Cancelled, undelivered, returned and refunded orders are left out."
          : "Revenue, orders and units for each month (ranges longer than 3 months are shown by month). The first and last month only count the days inside your dates."
      }
      onDownload={() => downloadReport("sales-over-time", filters)}
    >
      <ReportBody loading={report.isPending} failed={report.isError} stale={report.isPlaceholderData} empty={sum(rows, (r) => r.orders) === 0} {...noSales(filters)}>
        <CardContent>
          <ChartContainer config={timeConfig} className="aspect-auto h-72 w-full">
            <BarChart data={rows} margin={{ left: 4, right: 8, top: 4 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={28}
                tickFormatter={(day: string) => format(parseDay(day), byDay ? "d MMM" : "MMM yy")}
              />
              <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => formatCompact(v)} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, payload) => {
                      const day = payload?.[0]?.payload?.date as string | undefined;
                      return day ? label(day) : "";
                    }}
                    formatter={(value, name) => (
                      <div className="flex w-full items-center justify-between gap-6">
                        <span className="text-muted-foreground">{timeConfig[name as keyof typeof timeConfig]?.label}</span>
                        <span className="font-medium ledger">{formatMoney(Number(value))}</span>
                      </div>
                    )}
                  />
                }
              />
              <Bar dataKey="d2cRevenue" stackId="revenue" fill="var(--color-d2cRevenue)" maxBarSize={36} />
              <Bar dataKey="b2bRevenue" stackId="revenue" fill="var(--color-b2bRevenue)" radius={[3, 3, 0, 0]} maxBarSize={36} />
              <ChartLegend content={<ChartLegendContent />} />
            </BarChart>
          </ChartContainer>
        </CardContent>
        <DataTable<TimeRow>
          rows={newestFirst}
          rowKey={(row) => row.date}
          columns={[
            { header: byDay ? "Date" : "Month", cell: (row) => label(row.date) },
            { header: "Orders", align: "right", cell: (row) => formatNumber(row.orders) },
            { header: "Units sold", align: "right", cell: (row) => formatNumber(row.units) },
            { header: "D2C revenue", align: "right", cell: (row) => formatMoney(row.d2cRevenue) },
            { header: "B2B revenue", align: "right", cell: (row) => formatMoney(row.b2bRevenue) },
            { header: "Total revenue", align: "right", className: "font-medium", cell: (row) => formatMoney(row.revenue) },
          ]}
          totals={[
            "Total",
            formatNumber(sum(rows, (r) => r.orders)),
            formatNumber(sum(rows, (r) => r.units)),
            formatMoney(sum(rows, (r) => r.d2cRevenue)),
            formatMoney(sum(rows, (r) => r.b2bRevenue)),
            formatMoney(sum(rows, (r) => r.revenue)),
          ]}
        />
      </ReportBody>
    </ReportCard>
  );
}

// ─────────────────────────────────────────────────────────── Sales split one way (brand, category, payment, state…)

const ITEM_VALUE_NOTE = "Revenue here is the value of the items sold; delivery charges and order-wide coupons are not included, so the total can differ a little from the Revenue card above.";

function SalesBy<Row extends SalesRow>({
  filters, endpoint, title, description, nameHeader, what, name, nameCell, showShare = true, extraColumns = [],
}: {
  filters: Filters;
  endpoint: string;
  title: string;
  description: string;
  nameHeader: string;
  what: string; // "brands", "states"… for the line above the chart
  name: (row: Row) => string;
  nameCell?: (row: Row) => React.ReactNode;
  showShare?: boolean;
  extraColumns?: ColumnDef<Row>[];
}) {
  const report = useReport<Report<Row>>(endpoint, filters);
  const rows = report.data?.rows ?? [];
  const totalRevenue = sum(rows, (r) => r.revenue);

  return (
    <ReportCard title={title} description={description} onDownload={() => downloadReport(endpoint, filters)}>
      <ReportBody loading={report.isPending} failed={report.isError} stale={report.isPlaceholderData} empty={rows.length === 0} {...noSales(filters)}>
        <TopBars
          items={rows.map((row) => ({ name: name(row), value: row.revenue }))}
          label="Revenue"
          formatValue={formatMoney}
          caption={topCaption(rows.length, what)}
        />
        <DataTable<Row>
          rows={rows}
          rowKey={(_, index) => index}
          columns={[
            { header: "#", className: "w-10 text-muted-foreground", cell: (_, index) => index + 1 },
            { header: nameHeader, className: "max-w-80 truncate", cell: (row) => (nameCell ? nameCell(row) : name(row)) },
            ...extraColumns,
            { header: "Orders", align: "right", cell: (row) => formatNumber(row.orders) },
            { header: "Units sold", align: "right", cell: (row) => formatNumber(row.units) },
            { header: "Revenue", align: "right", className: "font-medium", cell: (row) => formatMoney(row.revenue) },
            ...(showShare
              ? [{ header: "Share of revenue", align: "right" as const, className: "text-muted-foreground", cell: (row: Row) => percentOf(row.revenue, totalRevenue) }]
              : []),
          ]}
        />
      </ReportBody>
    </ReportCard>
  );
}

// ─────────────────────────────────────────────────────────── Order status

function OrderStatus({ filters }: { filters: Filters }) {
  const report = useReport<Report<StatusRow>>("by-status", filters);
  const rows = report.data?.rows ?? [];
  const totalOrders = sum(rows, (r) => r.orders);

  return (
    <ReportCard
      title="Orders by status"
      description="Every order placed in these dates and where it stands now. Cancelled, undelivered, returned and refunded orders are not counted as sales."
      onDownload={() => downloadReport("by-status", filters)}
    >
      <ReportBody
        loading={report.isPending} failed={report.isError} stale={report.isPlaceholderData} empty={rows.length === 0}
        emptyTitle="No orders in these dates"
        emptyText={`No orders were placed between ${longDay(filters.from)} and ${longDay(filters.to)}${filters.channel ? ` through ${filters.channel}` : ""}. Try a longer date range.`}
      >
        <TopBars
          items={[...rows].sort((a, b) => b.orders - a.orders).map((row) => ({ name: humanize(row.status), value: row.orders }))}
          label="Orders"
          formatValue={formatNumber}
          color="var(--chart-3)"
        />
        <DataTable<StatusRow>
          rows={rows}
          rowKey={(row) => row.status}
          columns={[
            { header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
            { header: "Orders", align: "right", cell: (row) => formatNumber(row.orders) },
            { header: "Share of orders", align: "right", className: "text-muted-foreground", cell: (row) => percentOf(row.orders, totalOrders) },
            { header: "Units", align: "right", cell: (row) => formatNumber(row.units) },
            { header: "Order value", align: "right", className: "font-medium", cell: (row) => formatMoney(row.revenue) },
            { header: "Counted as sales", cell: (row) => (row.countsAsSale ? "Yes" : <span className="text-muted-foreground">No</span>) },
          ]}
          totals={["All orders", formatNumber(totalOrders), "", formatNumber(sum(rows, (r) => r.units)), formatMoney(sum(rows, (r) => r.revenue)), ""]}
        />
      </ReportBody>
    </ReportCard>
  );
}

// ─────────────────────────────────────────────────────────── Customers

function TopCustomers({ filters }: { filters: Filters }) {
  const report = useReport<Report<CustomerRow>>("top-customers", filters);
  const rows = report.data?.rows ?? [];
  const nameOf = (row: CustomerRow) => (row.name ? titleCase(row.name) : (row.phone ?? "Name not given"));

  return (
    <ReportCard
      title="Top customers"
      description="The customers who spent the most in these dates (up to 50). Cancelled, undelivered, returned and refunded orders are left out."
      onDownload={() => downloadReport("top-customers", filters)}
    >
      <ReportBody loading={report.isPending} failed={report.isError} stale={report.isPlaceholderData} empty={rows.length === 0} {...noSales(filters)}>
        <TopBars
          items={rows.map((row) => ({ name: nameOf(row), value: row.revenue }))}
          label="Amount spent"
          formatValue={formatMoney}
          caption={topCaption(rows.length, "spenders")}
        />
        <DataTable<CustomerRow>
          rows={rows}
          rowKey={(_, index) => index}
          columns={[
            { header: "#", className: "w-10 text-muted-foreground", cell: (_, index) => index + 1 },
            { header: "Customer", className: "max-w-64 truncate", cell: (row) => (row.name ? titleCase(row.name) : <span className="text-muted-foreground">Name not given</span>) },
            { header: "Phone", className: "ledger", cell: (row) => row.phone ?? "—" },
            { header: "Orders", align: "right", cell: (row) => formatNumber(row.orders) },
            { header: "Amount spent", align: "right", className: "font-medium", cell: (row) => formatMoney(row.revenue) },
            { header: "Last order", align: "right", className: "text-muted-foreground", cell: (row) => formatDate(row.lastOrderAt) },
          ]}
        />
      </ReportBody>
    </ReportCard>
  );
}

function B2BCustomers({ filters }: { filters: Filters }) {
  const report = useReport<Report<B2BRow>>("b2b-customers", filters);
  const rows = report.data?.rows ?? [];
  const retailOnly = filters.channel === "D2C";

  return (
    <ReportCard
      title="B2B customers"
      description="Doctors and wholesale buyers, by how much they bought in these dates. Cancelled, undelivered, returned and refunded orders are left out."
      onDownload={() => downloadReport("b2b-customers", filters)}
    >
      <ReportBody
        loading={report.isPending} failed={report.isError} stale={report.isPlaceholderData} empty={rows.length === 0}
        emptyTitle={retailOnly ? "The channel is set to D2C" : "No B2B sales in these dates"}
        emptyText={
          retailOnly
            ? "B2B customers only buy through the B2B channel. Set the channel at the top to All or B2B to see them."
            : `No doctor or wholesale buyer ordered between ${longDay(filters.from)} and ${longDay(filters.to)}. Try a longer date range.`
        }
      >
        <TopBars
          items={rows.map((row) => ({ name: titleCase(row.doctor), value: row.revenue }))}
          label="Amount bought"
          formatValue={formatMoney}
          color="var(--chart-3)"
          caption={topCaption(rows.length, "buyers")}
        />
        <DataTable<B2BRow>
          rows={rows}
          rowKey={(row) => row.accountId}
          columns={[
            { header: "#", className: "w-10 text-muted-foreground", cell: (_, index) => index + 1 },
            { header: "Doctor", className: "max-w-56 truncate", cell: (row) => titleCase(row.doctor) },
            {
              header: "Clinic", className: "max-w-64 truncate",
              cell: (row) => (
                <>
                  {titleCase(row.clinic)}
                  {row.city ? <span className="text-muted-foreground"> · {titleCase(row.city)}</span> : null}
                </>
              ),
            },
            { header: "Price tier", cell: (row) => row.tier ?? <span className="text-muted-foreground">None</span> },
            { header: "Orders", align: "right", cell: (row) => formatNumber(row.orders) },
            { header: "Amount bought", align: "right", className: "font-medium", cell: (row) => formatMoney(row.revenue) },
            { header: "Last order", align: "right", className: "text-muted-foreground", cell: (row) => formatDate(row.lastOrderAt) },
          ]}
        />
      </ReportBody>
    </ReportCard>
  );
}

// ─────────────────────────────────────────────────────────── Stock

type StockFilter = "ALL" | "OUT" | "LOW";

function Stock({ filters }: { filters: Filters }) {
  const [show, setShow] = useState<StockFilter>("ALL");
  // stock is "right now": it does not depend on the dates or the channel
  const report = useQuery({ queryKey: ["reports", "stock"], queryFn: () => api<StockReport>("/admin/reports/stock") });
  const all = report.data?.rows ?? [];
  const counts = report.data?.counts ?? { outOfStock: 0, lowStock: 0 };
  const rows = show === "ALL" ? all : all.filter((row) => row.state === show);

  return (
    <ReportCard
      title="Stock to refill"
      description="Packs that are out of stock or at their low-stock limit, as of right now. The dates and channel above do not change this list."
      onDownload={() => downloadReport("stock", { ...filters, channel: undefined })}
      toolbar={
        <Segmented<StockFilter>
          label="Stock level"
          value={show}
          onChange={setShow}
          options={[
            { value: "ALL", label: `All (${formatNumber(all.length)})` },
            { value: "OUT", label: `Out of stock (${formatNumber(counts.outOfStock)})` },
            { value: "LOW", label: `Running low (${formatNumber(counts.lowStock)})` },
          ]}
        />
      }
    >
      <ReportBody
        loading={report.isPending} failed={report.isError} stale={false} empty={rows.length === 0} chart={false}
        emptyTitle={all.length === 0 ? "Everything is well stocked" : show === "OUT" ? "Nothing is out of stock" : "Nothing is running low"}
        emptyText={all.length === 0 ? "No pack is out of stock or at its low-stock limit." : "Pick another stock level above to see the rest of the list."}
      >
        <DataTable<StockRow>
          // a fresh table per filter, so "show all" starts closed again
          key={show}
          rows={rows}
          rowKey={(row) => row.variantId}
          columns={[
            { header: "Product", className: "max-w-80 truncate", cell: (row) => titleCase(row.product) },
            { header: "Variant", cell: (row) => row.variant },
            { header: "SKU", className: "text-muted-foreground", cell: (row) => row.sku },
            { header: "Brand", cell: (row) => (row.brand ? titleCase(row.brand) : "—") },
            { header: "In stock", align: "right", className: "font-medium", cell: (row) => formatNumber(row.stock) },
            { header: "Low-stock limit", align: "right", className: "text-muted-foreground", cell: (row) => formatNumber(row.limit) },
            {
              header: "Stock level",
              cell: (row) => <StatusBadge status={row.state === "OUT" ? "CANCELLED" : "PENDING"} label={row.state === "OUT" ? "Out of stock" : "Running low"} />,
            },
          ]}
        />
      </ReportBody>
    </ReportCard>
  );
}

// ─────────────────────────────────────────────────────────── Page

const TABS = [
  { value: "sales", label: "Sales over time" },
  { value: "products", label: "Products" },
  { value: "brands", label: "Brands" },
  { value: "categories", label: "Categories" },
  { value: "customers", label: "Customers" },
  { value: "b2b", label: "B2B customers" },
  { value: "payments", label: "Payments" },
  { value: "states", label: "States" },
  { value: "status", label: "Order status" },
  { value: "stock", label: "Stock" },
];

export default function ReportsPage() {
  const tz = useTimeZone();
  const [range, setRange] = useState<DayRange>(defaultRange);
  const [channel, setChannel] = useState<ChannelFilter>("ALL");
  const [tab, setTab] = useState("sales");
  const filters: Filters = { ...range, tz, channel: channel === "ALL" ? undefined : channel };

  // the summary also tells us the day of the first order ever, for the "All" quick range
  const summary = useReport<Summary>("summary", filters);

  return (
    <>
      <PageHeader title="Reports" description="What sold, who bought it and where. Every report can be downloaded as a spreadsheet.">
        <Segmented<ChannelFilter> label="Sales channel" value={channel} onChange={setChannel} options={CHANNELS} />
        <QuickRanges value={range} onChange={setRange} firstDay={summary.data?.range.firstOrderDay} />
        <DateRangePicker value={range} onChange={(next) => setRange(next ?? defaultRange())} />
        <Button asChild variant="outline" className="h-9"><Link href="/admin/report-emails"><Mail /> Get these by email</Link></Button>
      </PageHeader>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {longDay(range.from)} – {longDay(range.to)} · {channel === "ALL" ? "All sales channels" : CHANNEL_NAME[channel]}
        </p>
        <Button variant="ghost" size="sm" onClick={() => downloadReport("summary", filters)} title="Save these numbers as a spreadsheet file">
          <Download /> Download summary
        </Button>
      </div>

      <SummaryCards filters={filters} />

      <Tabs value={tab} onValueChange={setTab} className="mt-6 gap-4">
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList className="w-max">
            {TABS.map((item) => (
              <TabsTrigger key={item.value} value={item.value} className="px-3">{item.label}</TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="sales">
          <SalesOverTime filters={filters} />
        </TabsContent>

        <TabsContent value="products">
          <SalesBy<ProductRow>
            filters={filters}
            endpoint="by-product"
            title="Best-selling products"
            description={`The products that brought in the most money (up to 100). ${ITEM_VALUE_NOTE}`}
            nameHeader="Product"
            what="products"
            name={(row) => titleCase(row.name)}
            showShare={false}
            extraColumns={[{ header: "Brand", className: "max-w-48 truncate text-muted-foreground", cell: (row) => (row.brand ? titleCase(row.brand) : "—") }]}
          />
        </TabsContent>

        <TabsContent value="brands">
          <SalesBy<SalesRow>
            filters={filters}
            endpoint="by-brand"
            title="Sales by brand"
            description={`How much each brand sold. ${ITEM_VALUE_NOTE}`}
            nameHeader="Brand"
            what="brands"
            name={(row) => titleCase(row.name)}
          />
        </TabsContent>

        <TabsContent value="categories">
          <SalesBy<SalesRow>
            filters={filters}
            endpoint="by-category"
            title="Sales by category"
            description={`Products are counted under their main category, so sub-categories are added into the one above them. ${ITEM_VALUE_NOTE}`}
            nameHeader="Category"
            what="categories"
            name={(row) => titleCase(row.name)}
          />
        </TabsContent>

        <TabsContent value="customers">
          <TopCustomers filters={filters} />
        </TabsContent>

        <TabsContent value="b2b">
          <B2BCustomers filters={filters} />
        </TabsContent>

        <TabsContent value="payments">
          <SalesBy<SalesRow>
            filters={filters}
            endpoint="by-payment-method"
            title="How customers paid"
            description="Sales by payment method. Cancelled, undelivered, returned and refunded orders are left out. The total matches the Revenue card above."
            nameHeader="Payment method"
            what="payment methods"
            name={(row) => paymentLabel(row.name)}
          />
        </TabsContent>

        <TabsContent value="states">
          <SalesBy<SalesRow>
            filters={filters}
            endpoint="by-state"
            title="Sales by state"
            description="Where orders were delivered, from the state written on each order's delivery address. Spelling differences in the address show up as separate rows."
            nameHeader="State"
            what="states"
            name={(row) => row.name}
          />
        </TabsContent>

        <TabsContent value="status">
          <OrderStatus filters={filters} />
        </TabsContent>

        <TabsContent value="stock">
          <Stock filters={filters} />
        </TabsContent>
      </Tabs>

      <p className="mt-4 text-xs text-muted-foreground">
        Days are counted in the timezone picked at the top of the page ({zoneShortName(tz)}).
      </p>
    </>
  );
}
