"use client";

import { Check, X } from "lucide-react";
import Link from "next/link";
import { m, useMotionSafe } from "./motion";
import { ProgressBar } from "./progress-ring";
import { Eyebrow } from "./typography";
import { cn } from "@/lib/utils";

// Where someone is in a journey: registering as a doctor, an order on its way, a return.

export type Step = { id: string; label: string; shortLabel?: string; description?: string; state: "done" | "current" | "upcoming" | "error" | "skipped"; href?: string; at?: string };

const STATE_TEXT: Record<Step["state"], string> = { done: "completed", current: "current step", upcoming: "not started", error: "needs attention", skipped: "skipped" };

function Marker({ step, number }: { step: Step; number: number }) {
  const { reduced } = useMotionSafe();
  return (
    <span
      aria-hidden
      className={cn(
        "font-display relative flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-medium transition-colors",
        step.state === "done" && "bg-primary text-primary-foreground",
        step.state === "current" && "bg-background text-terracotta ring-2 ring-terracotta shadow-[0_0_0_6px_color-mix(in_oklch,var(--terracotta)_25%,transparent)] animate-[pulse_2s_ease-in-out_infinite]",
        step.state === "upcoming" && "bg-background text-muted-foreground ring-1 ring-foreground/25",
        step.state === "error" && "bg-destructive text-paper",
        step.state === "skipped" && "bg-background text-muted-foreground ring-1 ring-dashed ring-foreground/30 [--tw-ring-color:transparent] border border-dashed border-foreground/30",
      )}
    >
      {step.state === "done" ? (
        <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <m.path d="M3 8.5l3.2 3.2L13 5" initial={reduced ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.3 }} />
        </svg>
      ) : step.state === "error" ? <X className="size-3.5" /> : step.state === "skipped" ? "–" : number}
      {step.state === "done" ? <Check className="sr-only" /> : null}
    </span>
  );
}

export function Stepper({ steps, orientation = "horizontal", numbered = true, compact, mobileLabel = true, className }: { steps: Step[]; orientation?: "horizontal" | "vertical"; numbered?: boolean; compact?: boolean; mobileLabel?: boolean; className?: string }) {
  const currentIndex = Math.max(0, steps.findIndex((s) => s.state === "current"));
  const done = steps.filter((s) => s.state === "done").length;

  const label = (step: Step) => (
    <span className="flex min-w-0 flex-col">
      <span className={cn("text-sm", step.state === "current" ? "font-semibold" : step.state === "upcoming" || step.state === "skipped" ? "text-muted-foreground" : "font-medium")}>
        {step.label}
        <span className="sr-only">, {STATE_TEXT[step.state]}</span>
      </span>
      {step.description && !compact ? <span className="text-xs text-muted-foreground">{step.description}</span> : null}
    </span>
  );
  const wrap = (step: Step, inner: React.ReactNode) =>
    step.href && step.state !== "upcoming" ? <Link href={step.href} className="flex items-center gap-2.5 rounded-md underline-offset-4 hover:underline">{inner}</Link> : <span className="flex items-center gap-2.5">{inner}</span>;

  if (orientation === "vertical") {
    return (
      <ol className={cn("relative", className)}>
        {steps.map((step, i) => (
          <li key={step.id} aria-current={step.state === "current" ? "step" : undefined} className={cn("relative flex gap-3", i < steps.length - 1 && (compact ? "pb-4" : "pb-6"))}>
            {i < steps.length - 1 ? <span aria-hidden className={cn("absolute top-7 bottom-0 left-[13px] w-0.5", step.state === "done" ? "bg-primary" : "bg-foreground/15")} /> : null}
            <Marker step={step} number={numbered ? i + 1 : 0} />
            <div className="flex min-w-0 flex-1 items-start justify-between gap-3 pt-1">
              {wrap(step, label(step))}
              {step.at ? <span className="font-mono text-[11px] text-muted-foreground">{step.at}</span> : null}
            </div>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <div className={className}>
      <ol className={cn("hidden items-start sm:flex", compact ? "gap-2" : "gap-3")}>
        {steps.map((step, i) => (
          <li key={step.id} aria-current={step.state === "current" ? "step" : undefined} className="flex min-w-0 flex-1 items-center gap-2.5 last:flex-none">
            {wrap(step, <><Marker step={step} number={numbered ? i + 1 : 0} />{label(step)}</>)}
            {i < steps.length - 1 ? (
              <span aria-hidden className="relative mx-1 h-0.5 min-w-4 flex-1 overflow-hidden rounded-full bg-foreground/15">
                <span className={cn("absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-400", step.state === "done" ? "w-full" : "w-0")} />
              </span>
            ) : null}
          </li>
        ))}
      </ol>
      {mobileLabel ? (
        <div className="sm:hidden">
          <ProgressBar value={done + (steps[currentIndex]?.state === "current" ? 0.5 : 0)} max={steps.length} tone="terracotta" />
          <Eyebrow className="mt-2">Step {currentIndex + 1} of {steps.length} · {steps[currentIndex]?.shortLabel ?? steps[currentIndex]?.label}</Eyebrow>
        </div>
      ) : null}
    </div>
  );
}
