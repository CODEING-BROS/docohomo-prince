"use client";

import NumberFlow, { type NumberFlowProps } from "@number-flow/react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { TONE_CLASS, toneFromChange, toneStyle } from "./tone";
import { formatCompact, formatMoney, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

// Figures that tick to their new value. The static form (animate={false}) prints exactly what
// lib/format.ts prints, so a number looks the same in a table cell and in a stat card.

export const NUMBER_TIMING = {
  transformTiming: { duration: 600, easing: "cubic-bezier(.22,1,.36,1)" },
  spinTiming: { duration: 500 },
  opacityTiming: { duration: 250 },
} as const;

// NumberFlow cannot spin scientific notation, so its Format type is a little narrower than Intl's
type Format = NonNullable<NumberFlowProps["format"]>;
const MONEY: Format = { style: "currency", currency: "INR", maximumFractionDigits: 0 };
const MONEY_EXACT: Format = { style: "currency", currency: "INR", maximumFractionDigits: 2 };
const COMPACT: Format = { notation: "compact", maximumFractionDigits: 1 };

const Static = ({ children, className }: { children: React.ReactNode; className?: string }) => <span className={cn("ledger", className)}>{children}</span>;
/** "₹1,234" with the sign in the text face, since the display serif has no rupee glyph. */
const rupee = (text: string) => (text.startsWith("₹") ? <><span className="rupee">₹</span>{text.slice(1)}</> : text);
const flowClass = "ledger inline-flex overflow-visible";

export function Money({ value, compact, exact, animate = true, strike, className }: { value: number | null | undefined; compact?: boolean; exact?: boolean; animate?: boolean; strike?: boolean; className?: string }) {
  const classes = cn(strike && "text-muted-foreground line-through", className);
  if (value === null || value === undefined) return <Static className={classes}>—</Static>;
  if (!animate) return <Static className={classes}>{rupee(compact ? `₹${formatCompact(value)}` : exact ? new Intl.NumberFormat("en-IN", MONEY_EXACT).format(value) : formatMoney(value))}</Static>;
  return (
    <NumberFlow
      value={value}
      locales="en-IN"
      format={compact ? { ...MONEY, ...COMPACT } : exact ? MONEY_EXACT : MONEY}
      {...NUMBER_TIMING}
      className={cn(flowClass, classes)}
    />
  );
}

export function Num({ value, format, animate = true, className }: { value: number | null | undefined; format?: Format; animate?: boolean; className?: string }) {
  if (value === null || value === undefined) return <Static className={className}>—</Static>;
  if (!animate) return <Static className={className}>{format ? new Intl.NumberFormat("en-IN", format).format(value) : formatNumber(value)}</Static>;
  return <NumberFlow value={value} locales="en-IN" format={format} {...NUMBER_TIMING} className={cn(flowClass, className)} />;
}

/** `value` is a fraction: 0.153 renders 15.3%. */
export function Pct({ value, signed, animate = true, className }: { value: number | null | undefined; signed?: boolean; animate?: boolean; className?: string }) {
  const format: Format = { style: "percent", maximumFractionDigits: 1, signDisplay: signed ? "exceptZero" : "auto" };
  return <Num value={value} format={format} animate={animate} className={className} />;
}

/** The change chip on a stat card: up in green, down in red, flat in grey, nothing to compare in words. */
export function Delta({ value, unit = "%", lowerIsBetter, hint = "No earlier data", className }: { value: number | null | undefined; unit?: "%" | "pt"; lowerIsBetter?: boolean; hint?: string; className?: string }) {
  if (value === null || value === undefined) return <span className={cn("text-xs text-muted-foreground", className)}>{hint}</span>;
  const tone = toneFromChange(value, lowerIsBetter);
  const up = value > 0;
  return (
    <span style={toneStyle(tone)} className={cn("ledger inline-flex h-5 items-center gap-0.5 rounded-full px-1.5 text-xs font-medium", TONE_CLASS.tint, className)}>
      {value === 0 ? "—" : (
        <>
          {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
          {Math.abs(value)}{unit === "%" ? "%" : " pt"}
        </>
      )}
    </span>
  );
}

/** Counts from `from` to `value` once on mount, for live figures such as a countdown. */
export function CountUp({ value, from = 0, duration = 900, format, className }: { value: number; from?: number; duration?: number; format?: Format; className?: string }) {
  const [shown, setShown] = useState(from);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) { setShown(value); return; }
    started.current = true;
    const timer = setTimeout(() => setShown(value), 30);
    return () => clearTimeout(timer);
  }, [value]);
  return <NumberFlow value={shown} locales="en-IN" format={format} transformTiming={{ duration, easing: "cubic-bezier(.22,1,.36,1)" }} spinTiming={{ duration }} className={cn(flowClass, className)} />;
}
