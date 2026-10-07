"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertTriangle, ArrowRight, Building2, IndianRupee, type LucideIcon, PackageX, Receipt, ShoppingCart, Stethoscope, UserPlus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { type DayRange, DateRangePicker } from "@/components/admin/date-range-picker";
import { Thumb } from "@/components/admin/parts";
import { ColHead, DataTableRow } from "@/components/custom/data-table";
import { EmptyState } from "@/components/custom/empty-state";
import { FilterChips } from "@/components/custom/filter-chips";
import { IconTile } from "@/components/custom/icon-tile";
import { StatSkeleton } from "@/components/custom/loaders";
import { Money, Num } from "@/components/custom/number";
import { PageHero } from "@/components/custom/page-hero";
import { SectionCard } from "@/components/custom/section-card";
import { StatCard } from "@/components/custom/stat-card";
import { StatusPill } from "@/components/custom/status-pill";
import { Mono } from "@/components/custom/typography";
import { Button } from "@/components/ui/button";
import { type ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { formatCompact, formatDate, formatMoney, formatNumber, humanize, titleCase } from "@/lib/format";
import { shiftDay, todayInZone, useTimeZone } from "@/lib/timezone";
import type { Dashboard, SessionUser } from "@/lib/types";
import { cn } from "@/lib/utils";

const revenueConfig = {
  d2c: { label: "Retail", color: "var(--chart-1)" },
  b2b: { label: "Wholesale (doctors)", color: "var(--chart-5)" },
} satisfies ChartConfig;

const brandConfig = { revenue: { label: "Revenue", color: "var(--chart-1)" } } satisfies ChartConfig;

const STATUS_COLOR: Record<string, string> = {
  DELIVERED: "var(--chart-1)", SHIPPED: "var(--chart-4)", OUT_FOR_DELIVERY: "var(--chart-4)", CONFIRMED: "var(--chart-4)",
  PENDING: "var(--chart-3)", PROCESSING: "var(--chart-3)", PACKED: "var(--chart-3)",
  CANCELLED: "var(--chart-2)", UNDELIVERED: "var(--destructive)",
};
const PAYMENT_COLOR: Record<string, string> = {
  COD: "var(--chart-3)", ONLINE: "var(--chart-1)", CREDIT: "var(--chart-5)", BANK_TRANSFER: "var(--chart-4)",
};

function Donut({ data, total, totalLabel }: { data: { name: string; value: number; fill: string }[]; total: number; totalLabel: string }) {
  const config = Object.fromEntries(data.map((d) => [d.name, { label: d.name, color: d.fill }])) satisfies ChartConfig;
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative shrink-0">
        <ChartContainer config={config} className="aspect-square h-40">
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={52} outerRadius={72} strokeWidth={2} paddingAngle={1.5}>
              {data.map((d) => <Cell key={d.name} fill={d.fill} />)}
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display ledger text-2xl font-medium"><Num value={total} /></span>
          <span className="text-[0.6875rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{totalLabel}</span>
        </div>
      </div>
      <ul className="grid w-full gap-1.5 text-sm">
        {data.map((d) => (
          <li key={d.name} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: d.fill }} />
            <span className="truncate text-muted-foreground">{d.name}</span>
            <span className="ledger ml-auto font-medium">{formatNumber(d.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AttentionRow({ icon, label, count, href }: { icon: LucideIcon; label: string; count: number; href: string }) {
  const tone = count === 0 ? "neutral" : count > 20 ? "danger" : "warning";
  return (
    <Link
      href={href}
      data-clickable=""
      className="-mx-2 flex items-center gap-3 rounded-md px-2 py-1.5 transition-[background-color,box-shadow] hover:bg-surface-3 hover:shadow-[inset_3px_0_0_var(--terracotta)] focus-visible:bg-surface-3 focus-visible:outline-none"
    >
      <IconTile icon={icon} tone={tone} size="sm" />
      <span className="flex-1 text-sm">{label}</span>
      <span className={cn("font-display ledger text-lg font-medium", count === 0 && "text-muted-foreground")}>{formatNumber(count)}</span>
      <ArrowRight className="size-3.5 text-muted-foreground" />
    </Link>
  );
}

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

/** One-click date ranges; "All" starts at the first order ever. */
function QuickRanges({ value, onChange, firstDay }: { value: DayRange; onChange: (range: DayRange) => void; firstDay?: string }) {
  const ranges = [
    ...QUICK_RANGES.map((quick) => ({ label: quick.label, range: lastDays(quick.days) })),
    ...(firstDay ? [{ label: "All", range: { from: firstDay, to: todayInZone() } }] : []),
  ];
  const current = ranges.find((r) => r.range.from === value.from && r.range.to === value.to)?.label ?? "";
  return (
    <FilterChips
      variant="segmented" scrollable={false} ariaLabel="Quick date ranges" value={current}
      onChange={(label) => { const found = ranges.find((r) => r.label === label); if (found) onChange(found.range); }}
      options={ranges.map((r) => ({ value: r.label, label: r.label }))}
    />
  );
}

const greeting = () => {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
};

export default function DashboardPage() {
  const tz = useTimeZone();
  const [range, setRange] = useState<DayRange>(defaultRange);
  const { data, isPending, isError, refetch, isPlaceholderData } = useQuery({
    queryKey: ["dashboard", range, tz],
    queryFn: () => api<Dashboard>("/admin/dashboard", { query: { ...range, tz } }),
    placeholderData: (previous) => previous,
  });
  const { data: me } = useQuery({ queryKey: ["session-user"], queryFn: () => api<{ user: SessionUser }>("/auth/me"), staleTime: 300_000 });
  const firstName = me?.user.name?.split(" ")[0];

  const hero = (
    <PageHero
      tone="ink"
      overlap
      eyebrow={format(new Date(), "EEEE, d MMMM")}
      title={`${greeting()}${firstName ? `, ${firstName}` : ""}`}
      description="Sales, orders and what needs your attention."
    >
      <QuickRanges value={range} onChange={setRange} firstDay={data?.range.firstOrderDay} />
      <DateRangePicker value={range} onChange={(next) => setRange(next ?? defaultRange())} />
    </PageHero>
  );

  if (isError) {
    return (
      <>
        {hero}
        <div className="pt-6"><EmptyState variant="error" title="Could not load the dashboard" description="Check that the backend is running, then try again." onRetry={() => refetch()} bordered /></div>
      </>
    );
  }
  if (isPending || !data) {
    return (
      <>
        {hero}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <StatSkeleton key={i} />)}</div>
        <Skeleton className="mt-4 h-80 rounded-xl" />
      </>
    );
  }

  const tick = (day: string) => format(new Date(`${day}T00:00:00`), data.range.unit === "day" ? "d MMM" : "MMM yy");
  const totalOrders = data.ordersByStatus.reduce((sum, s) => sum + s.count, 0);
  const paidOrders = data.salesByPaymentMethod.reduce((sum, p) => sum + p.orders, 0);
  const topProductRevenue = Math.max(1, ...data.topProducts.map((p) => p.revenue));
  // the last twelve points of the series feed the sparklines
  const spark = (key: "d2c" | "b2b" | "total") => data.series.slice(-12).map((s) => (key === "total" ? s.d2c + s.b2b : s[key]));
  const faded = isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity";

  return (
    <>
      {hero}

      <div className={cn("relative grid gap-4 sm:grid-cols-2 xl:grid-cols-4", faded)}>
        <StatCard label="Revenue" value={data.totals.revenue.value} format="currency" change={data.totals.revenue.change} note="vs previous period" icon={IndianRupee} sparkline={spark("total")} />
        <StatCard label="Orders" value={data.totals.orders.value} change={data.totals.orders.change} note="vs previous period" icon={ShoppingCart} />
        <StatCard label="Average order value" value={data.totals.averageOrderValue.value} format="currency" change={data.totals.averageOrderValue.change} note="vs previous period" icon={Receipt} />
        <StatCard label="New customers" value={data.totals.newCustomers.value} change={data.totals.newCustomers.change} note="vs previous period" icon={UserPlus} />
      </div>

      <div className={cn("mt-4 grid gap-4 xl:grid-cols-3", faded)}>
        <SectionCard className="xl:col-span-2" title="Revenue" description={`${data.range.unit === "day" ? "Per day" : "Per month"}, cancelled and undelivered orders left out`}>
          <ChartContainer config={revenueConfig} className="aspect-auto h-72 w-full">
            <AreaChart data={data.series} margin={{ left: 4, right: 8, top: 4 }}>
              <defs>
                {(["d2c", "b2b"] as const).map((key) => (
                  <linearGradient key={key} id={`fill-${key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={`var(--color-${key})`} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={`var(--color-${key})`} stopOpacity={0.03} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={28} tickFormatter={tick} />
              <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => formatCompact(v)} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, payload) => {
                      const day = payload?.[0]?.payload?.date as string | undefined;
                      return day ? format(new Date(`${day}T00:00:00`), data.range.unit === "day" ? "EEE, d MMM yyyy" : "MMMM yyyy") : "";
                    }}
                    formatter={(value, name) => (
                      <div className="flex w-full items-center justify-between gap-6">
                        <span className="text-muted-foreground">{revenueConfig[name as "d2c" | "b2b"]?.label}</span>
                        <span className="ledger font-medium">{formatMoney(Number(value))}</span>
                      </div>
                    )}
                  />
                }
              />
              <Area dataKey="b2b" type="monotone" stackId="a" stroke="var(--color-b2b)" strokeWidth={2} fill="url(#fill-b2b)" />
              <Area dataKey="d2c" type="monotone" stackId="a" stroke="var(--color-d2c)" strokeWidth={2} fill="url(#fill-d2c)" />
              <ChartLegend content={<ChartLegendContent />} />
            </AreaChart>
          </ChartContainer>
        </SectionCard>

        <SectionCard
          title="Needs attention" description="Right now, across the whole store"
          footer={<span className="ledger text-muted-foreground">{formatNumber(data.counters.activeProducts)} active products · {formatNumber(data.counters.activeVariants)} variants</span>}
        >
          <div className="grid gap-1">
            <AttentionRow icon={ShoppingCart} label="Orders to process" count={data.counters.openOrders} href="/admin/orders?open=1" />
            <AttentionRow icon={PackageX} label="Products out of stock" count={data.counters.outOfStock} href="/admin/products?stock=out" />
            <AttentionRow icon={AlertTriangle} label="Variants running low" count={data.counters.lowStock} href="/admin/products?stock=low" />
            <AttentionRow icon={Stethoscope} label="Doctors waiting for verification" count={data.counters.doctorsToVerify} href="/admin/doctors?status=PENDING" />
            <AttentionRow icon={Building2} label="B2B applications to review" count={data.counters.b2bToApprove} href="/admin/b2b?status=PENDING" />
          </div>
        </SectionCard>
      </div>

      <div className={cn("mt-4 grid gap-4 lg:grid-cols-3", faded)}>
        <SectionCard title="Orders by status" description="All orders placed in this period">
          {totalOrders ? (
            <Donut total={totalOrders} totalLabel="orders" data={data.ordersByStatus.map((s) => ({ name: humanize(s.status), value: s.count, fill: STATUS_COLOR[s.status] ?? "var(--muted-foreground)" }))} />
          ) : <EmptyState size="sm" title="No orders in this period" />}
        </SectionCard>

        <SectionCard title="How customers paid" description="Completed and in-progress orders">
          {paidOrders ? (
            <Donut
              total={paidOrders} totalLabel="orders"
              data={data.salesByPaymentMethod.map((p) => ({ name: p.method === "COD" ? "Cash on delivery" : humanize(p.method), value: p.orders, fill: PAYMENT_COLOR[p.method] ?? "var(--muted-foreground)" }))}
            />
          ) : <EmptyState size="sm" title="No sales in this period" />}
        </SectionCard>

        <SectionCard title="Top brands" description="By revenue">
          {data.topBrands.length ? (
            <ChartContainer config={brandConfig} className="aspect-auto h-44 w-full">
              <BarChart data={data.topBrands.map((b) => ({ ...b, name: titleCase(b.name) }))} layout="vertical" margin={{ left: 0, right: 12 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={104} tick={{ fontSize: 12 }} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent formatter={(value) => <span className="ledger font-medium">{formatMoney(Number(value))}</span>} />} />
                <Bar dataKey="revenue" fill="var(--color-revenue)" radius={4} barSize={16} />
              </BarChart>
            </ChartContainer>
          ) : <EmptyState size="sm" title="No sales in this period" />}
        </SectionCard>
      </div>

      <div className={cn("mt-4 grid gap-4 xl:grid-cols-5", faded)}>
        <SectionCard className="xl:col-span-2" title="Best-selling products" description="By revenue in this period">
          {data.topProducts.length ? (
            <ol className="grid gap-3">
              {data.topProducts.map((p, index) => (
                <li key={`${p.productId}-${p.name}`} className="flex min-w-0 items-center gap-3">
                  <span className={cn("font-display flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-medium italic", index === 0 ? "bg-terracotta text-terracotta-foreground" : "bg-surface-2 text-muted-foreground")}>{index + 1}</span>
                  <Thumb src={null} name={p.name} className="size-8" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate">{titleCase(p.name)}</span>
                      <span className="ledger shrink-0 font-medium"><Money value={p.revenue} animate={false} /></span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3">
                        <div className="h-full rounded-full bg-(image:--gradient-terracotta)" style={{ width: `${(p.revenue / topProductRevenue) * 100}%` }} />
                      </div>
                      <span className="ledger w-14 shrink-0 text-right text-xs text-muted-foreground">{formatNumber(p.units)} sold</span>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          ) : <EmptyState size="sm" title="No sales in this period" />}
        </SectionCard>

        <SectionCard
          className="xl:col-span-3" flush title="Latest orders" description="The most recent orders, whatever the dates above"
          action={<Button asChild variant="ghost" size="sm"><Link href="/admin/orders">All orders <ArrowRight data-icon="inline-end" /></Link></Button>}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <ColHead className="pl-4">Order</ColHead>
                <ColHead>Customer</ColHead>
                <ColHead>Status</ColHead>
                <ColHead align="right" className="pr-4">Total</ColHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recentOrders.map((o) => (
                <DataTableRow key={o.id} href={`/admin/orders?q=${o.orderNumber}`} className="h-12">
                  <TableCell className="pl-4">
                    <Mono upper className="font-medium">{o.orderNumber}</Mono>
                    <div className="text-xs text-muted-foreground">{formatDate(o.placedAt)} · {o.channel === "B2B" ? "Wholesale" : "Retail"}</div>
                  </TableCell>
                  <TableCell className="max-w-40 truncate">{o.customerName ?? "—"}</TableCell>
                  <TableCell><StatusPill status={o.status} kind="order" /></TableCell>
                  <TableCell className="ledger pr-4 text-right font-medium">{formatMoney(o.grandTotal)}</TableCell>
                </DataTableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>
      </div>
    </>
  );
}
