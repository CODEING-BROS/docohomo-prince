"use client";

import { useId } from "react";
import { type Tone, toneStyle } from "./tone";
import { useMotionSafe } from "./motion";
import { cn } from "@/lib/utils";

// A tiny line for the last few periods, tucked into a stat card. Plain SVG: no chart library.

export function KpiSparkline({
  data, width = 96, height = 28, tone = "terracotta", area = true, showLast = true, ariaLabel, className,
}: { data: number[]; width?: number; height?: number; tone?: Tone; area?: boolean; showLast?: boolean; ariaLabel?: string; className?: string }) {
  // useId gives ":r1:"-style ids; keep only the letters so it works as a keyframes name on the server too
  const id = `spark-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const { reduced } = useMotionSafe();
  const pad = 2;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const flat = data.length < 2 || max === min;
  const points = data.map((v, i) => {
    const x = data.length === 1 ? width / 2 : pad + (i * (width - pad * 2)) / (data.length - 1);
    const y = flat ? height / 2 : height - pad - ((v - min) / (max - min)) * (height - pad * 2);
    return [x, y] as const;
  });
  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const last = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      style={toneStyle(tone)}
      className={cn("shrink-0 overflow-visible", className)}
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      preserveAspectRatio="none"
    >
      {flat ? (
        <line x1={pad} x2={width - pad} y1={height / 2} y2={height / 2} stroke="var(--foreground)" strokeOpacity="0.3" strokeWidth="1.5" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      ) : (
        <>
          {area ? <path d={`${line} L${last[0].toFixed(1)} ${height} L${points[0][0].toFixed(1)} ${height} Z`} fill="var(--tone)" fillOpacity="0.1" /> : null}
          <path
            d={line}
            fill="none"
            stroke="var(--tone)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            pathLength={1}
            strokeDasharray={reduced ? undefined : 1}
            style={reduced ? undefined : { animation: `${id} 500ms ease-out forwards` }}
          />
          {showLast ? <circle cx={last[0]} cy={last[1]} r="2.5" fill="var(--tone)" /> : null}
          {!reduced ? <style>{`@keyframes ${id} { from { stroke-dashoffset: 1 } to { stroke-dashoffset: 0 } }`}</style> : null}
        </>
      )}
    </svg>
  );
}
