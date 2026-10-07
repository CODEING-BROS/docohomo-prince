"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { IconTile } from "./icon-tile";
import { KpiSparkline } from "./kpi-sparkline";
import { StatSkeleton } from "./loaders";
import { Delta, Money, Num, Pct } from "./number";
import type { Tone } from "./tone";
import { Eyebrow } from "./typography";
import { cn } from "@/lib/utils";

// A headline figure as a ledger tile: eyebrow, rule, the number in the display face, the change.

export function StatCard({
  label, value, format = "number", change, changeUnit = "%", lowerIsBetter, hint, note, icon, sparkline, tone = "panel", href, loading, size = "md", className,
}: {
  label: string; value: number | string | null | undefined; format?: "number" | "currency" | "percent" | "compact"; change?: number | null; changeUnit?: "%" | "pt";
  lowerIsBetter?: boolean; hint?: string; note?: string; icon?: LucideIcon; sparkline?: number[]; tone?: Tone | "panel"; href?: string; loading?: boolean;
  size?: "sm" | "md" | "lg"; className?: string;
}) {
  if (loading) return <StatSkeleton className={className} />;

  const figure =
    typeof value === "string" ? <span className="ledger">{value.startsWith("₹") ? <><span className="rupee">₹</span>{value.slice(1)}</> : value}</span>
    : format === "currency" ? <Money value={value} />
    : format === "compact" ? <Money value={value} compact />
    : format === "percent" ? <Pct value={value} />
    : <Num value={value} />;

  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <Eyebrow as="p" className="truncate">{label}</Eyebrow>
        {icon ? <IconTile icon={icon} tone={tone} size="sm" className="-mt-1" /> : null}
      </div>
      <div className="my-2.5 border-t border-foreground/18" />
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className={cn("font-display ledger min-w-[6ch] overflow-visible font-medium [font-variation-settings:'opsz'_48]", size === "sm" ? "text-xl/none" : size === "lg" ? "text-4xl/none" : "text-[1.75rem]/none")}>
            {figure}
          </p>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            {change !== undefined ? <Delta value={change} unit={changeUnit} lowerIsBetter={lowerIsBetter} hint={hint} /> : hint ? <span>{hint}</span> : null}
            {change !== undefined && change !== null && note ? <span className="whitespace-nowrap">{note}</span> : change === undefined && note ? <span className="whitespace-nowrap">{note}</span> : null}
          </div>
        </div>
        {sparkline?.length ? <KpiSparkline data={sparkline} tone="terracotta" className="mb-0.5 shrink-0" /> : null}
      </div>
    </>
  );

  const classes = cn("block rounded-xl border border-border bg-card p-4 text-left transition-[box-shadow,background-color]", href && "hover:bg-surface-3 hover:shadow-[inset_3px_0_0_var(--terracotta)] focus-visible:bg-surface-3 focus-visible:shadow-[inset_3px_0_0_var(--terracotta)] focus-visible:outline-none", className);
  return href ? <Link href={href} data-clickable className={classes}>{inner}</Link> : <div className={classes}>{inner}</div>;
}
