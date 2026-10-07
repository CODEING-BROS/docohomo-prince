"use client";

import { Progress } from "@/components/ui/progress";
import { useMotionSafe } from "./motion";
import { Num } from "./number";
import { TONE_CLASS, type Tone, toneStyle } from "./tone";
import { Eyebrow } from "./typography";
import { cn } from "@/lib/utils";

// A ring for "how much of the whole": open orders, stock health, questions answered.

const RING = { 40: { stroke: 3, text: "text-xs" }, 56: { stroke: 4, text: "text-sm" }, 72: { stroke: 5, text: "text-lg" }, 96: { stroke: 6, text: "text-2xl" }, 128: { stroke: 7, text: "text-3xl" } };

export function ProgressRing({
  value, max = 100, size = 72, stroke, tone = "primary", label, sublabel, segments, animate = true, className,
}: {
  value: number; max?: number; size?: keyof typeof RING; stroke?: number; tone?: Tone; label?: React.ReactNode; sublabel?: string;
  segments?: { value: number; tone: Tone; label?: string }[]; animate?: boolean; className?: string;
}) {
  const { reduced } = useMotionSafe();
  const width = stroke ?? RING[size].stroke;
  const r = (size - width) / 2;
  const circumference = 2 * Math.PI * r;
  const fraction = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const transition = animate && !reduced ? "stroke-dashoffset 700ms cubic-bezier(.22,1,.36,1)" : undefined;

  const arcs = (segments ?? [{ value, tone }]).reduce<{ value: number; tone: Tone; label?: string; part: number; start: number }[]>((list, segment) => {
    const part = max > 0 ? Math.min(1, segment.value / max) : 0;
    const start = list.length ? list[list.length - 1].start + list[list.length - 1].part : 0;
    return [...list, { ...segment, part, start }];
  }, []);

  return (
    <div className={cn("inline-flex items-center gap-4", className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="color-mix(in oklch, var(--foreground) 10%, transparent)" strokeWidth={width} />
          {arcs.map((arc, i) => (
            <circle
              key={i}
              cx={size / 2} cy={size / 2} r={r} fill="none"
              style={{ ...toneStyle(arc.tone), transition }}
              stroke="var(--tone)"
              strokeWidth={width}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - arc.part)}
              transform={`rotate(${arc.start * 360} ${size / 2} ${size / 2})`}
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("font-display ledger font-medium leading-none", RING[size].text)}>
            {label ?? <Num value={Math.round(fraction * 100)} animate={animate} />}
            {label === undefined ? <span className="text-[0.6em]">%</span> : null}
          </span>
          {sublabel && size >= 72 ? <Eyebrow as="span" className="mt-1 text-[9px]">{sublabel}</Eyebrow> : null}
        </div>
      </div>
      {segments ? (
        <ul className="grid gap-1 text-sm">
          {segments.map((segment, i) => (
            <li key={i} className="flex items-center gap-2" style={toneStyle(segment.tone)}>
              <span className={cn("size-2 rounded-full", TONE_CLASS.dot)} />
              <span className="text-muted-foreground">{segment.label}</span>
              <span className="ledger ml-auto font-medium"><Num value={segment.value} animate={false} /></span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function ProgressBar({ value, max = 100, tone = "primary", gradient, label, hint, size = "sm", className }: { value: number; max?: number; tone?: Tone; gradient?: boolean; label?: React.ReactNode; hint?: React.ReactNode; size?: "sm" | "md"; className?: string }) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className={cn("w-full", className)} style={toneStyle(tone)}>
      {label || hint ? (
        <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
          {label ? <span className="font-medium">{label}</span> : <span />}
          {hint ? <span className="text-muted-foreground">{hint}</span> : null}
        </div>
      ) : null}
      <Progress
        value={percent}
        className={cn("bg-surface-3", size === "sm" ? "h-1.5" : "h-2.5", gradient ? "[&>[data-slot=progress-indicator]]:bg-(image:--gradient-terracotta)" : "[&>[data-slot=progress-indicator]]:bg-(--tone)")}
      />
    </div>
  );
}
