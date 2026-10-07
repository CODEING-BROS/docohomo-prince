"use client";

import { ChevronDown } from "lucide-react";
import { Spinner } from "./loaders";
import { type StatusKind, statusEntry } from "./status-registry";
import { TONE_CLASS, type Tone, toneStyle } from "./tone";
import { cn } from "@/lib/utils";

// One pill for every status in the system. The colour and words come from the registry; a status
// that is still moving (shipped, under review) gets a slowly pulsing dot.

export function StatusPill({
  status, kind, label, tone, size = "sm", dot = true, pulse = "auto", asChild, busy, className, ...props
}: {
  status: string; kind?: StatusKind; label?: string; tone?: Tone; size?: "sm" | "md"; dot?: boolean; pulse?: boolean | "auto";
  /** renders a button with a chevron, for a status that opens a menu */
  asChild?: boolean; busy?: boolean; className?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  const found = statusEntry(status, kind);
  const shownTone = tone ?? found.tone;
  const pulsing = pulse === true || (pulse === "auto" && found.inFlight);
  const classes = cn(
    "inline-flex shrink-0 items-center gap-1.5 rounded-full font-medium tracking-[0.06em] whitespace-nowrap uppercase",
    size === "sm" ? "h-5 px-2 text-[11px]/none" : "h-6 px-2.5 text-xs/none",
    TONE_CLASS.tint,
    asChild && "transition-colors not-disabled:hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
    className,
  );
  const inner = (
    <>
      {busy ? <Spinner size="xs" /> : dot ? <span aria-hidden className={cn("size-1.5 rounded-full", TONE_CLASS.dot, pulsing && "animate-pulse")} /> : null}
      {label ?? found.label}
      {asChild ? <ChevronDown className="-mr-0.5 size-3 opacity-70" /> : null}
    </>
  );
  if (asChild) {
    return (
      <button type="button" style={toneStyle(shownTone)} className={classes} {...props}>
        {inner}
      </button>
    );
  }
  return (
    <span style={toneStyle(shownTone)} className={classes}>
      {inner}
    </span>
  );
}

/** Just the coloured dot, for dense lists. */
export function StatusDot({ status, kind, tone, className }: { status: string; kind?: StatusKind; tone?: Tone; className?: string }) {
  const found = statusEntry(status, kind);
  return (
    <span
      aria-hidden
      style={toneStyle(tone ?? found.tone)}
      className={cn("inline-block size-2 shrink-0 rounded-full", TONE_CLASS.dot, found.inFlight && "animate-pulse", className)}
    />
  );
}
