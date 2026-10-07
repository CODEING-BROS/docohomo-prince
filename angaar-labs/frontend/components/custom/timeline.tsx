"use client";

import { formatDistanceToNowStrict } from "date-fns";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { IconTile } from "./icon-tile";
import { m, useMotionSafe } from "./motion";
import { TONE_CLASS, type Tone, toneStyle } from "./tone";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

// What happened, in order: order history, parcel tracking, stock movements, payouts.

export type TimelineItem = {
  id: string; title: React.ReactNode; description?: React.ReactNode; at?: string | Date; tone?: Tone; icon?: LucideIcon; href?: string;
  /** stock in/out, shown as +12 / −3 with the running balance beside it */
  delta?: number; balance?: number;
};

const ago = (at: string | Date) => {
  try { return formatDistanceToNowStrict(new Date(at), { addSuffix: true }); } catch { return ""; }
};

export function Timeline({ items, current, dense, showAll, animate = true, className }: { items: TimelineItem[]; current?: string; dense?: boolean; showAll?: { limit: number; label?: string }; animate?: boolean; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const { reduced, dur } = useMotionSafe();
  const hidden = showAll && !expanded && items.length > showAll.limit ? items.length - showAll.limit : 0;
  const shown = hidden ? [...items.slice(0, Math.max(1, showAll!.limit - 1)), null, items[items.length - 1]] : items;
  const move = animate && !reduced;

  return (
    <div className={cn("relative", className)}>
      <m.span
        aria-hidden
        initial={move ? { scaleY: 0 } : false}
        animate={{ scaleY: 1 }}
        transition={{ duration: dur(400) / 1000, ease: "easeOut" }}
        className={cn("absolute top-2 bottom-2 w-0.5 origin-top bg-foreground/15", dense ? "left-[3px]" : "left-[5px]")}
      />
      <ol className={cn(dense ? "space-y-2" : "space-y-4")}>
        {shown.map((item, index) =>
          item === null ? (
            <li key="more" className={cn("relative", dense ? "pl-5" : "pl-7")}>
              <Button variant="link" size="xs" className="h-5 px-0 text-muted-foreground" onClick={() => setExpanded(true)}>
                {showAll?.label ?? `Show all ${items.length}`}
              </Button>
            </li>
          ) : (
            <m.li
              key={item.id}
              initial={move ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              transition={{ duration: dur(200) / 1000, delay: (index * 60) / 1000 }}
              style={toneStyle(item.tone ?? (item.id === current ? "terracotta" : "neutral"))}
              className={cn("relative flex gap-3", dense ? "pl-5" : "pl-7")}
            >
              {item.icon && !dense ? (
                <IconTile icon={item.icon} tone={item.tone ?? "neutral"} size="sm" className="absolute -left-2 top-0 bg-background" />
              ) : (
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-1.5 rounded-full ring-4 ring-background",
                    TONE_CLASS.dot,
                    dense ? "left-0 size-2" : "left-0.5 size-2.5",
                    item.id === current && "animate-[pulse_2s_ease-in-out_infinite] shadow-[0_0_0_4px_color-mix(in_oklch,var(--terracotta)_35%,transparent)]",
                  )}
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <p className={cn("text-sm", item.id === current ? "font-semibold" : "font-medium")}>
                    {item.href ? <Link href={item.href} className="underline-offset-4 hover:underline">{item.title}</Link> : item.title}
                    {item.delta !== undefined ? (
                      <span className={cn("ledger ml-2 text-xs font-semibold", item.delta >= 0 ? "text-success" : "text-destructive")}>
                        {item.delta >= 0 ? "+" : "−"}{Math.abs(item.delta)}
                        {item.balance !== undefined ? <span className="ml-1 font-normal text-muted-foreground">→ {item.balance}</span> : null}
                      </span>
                    ) : null}
                  </p>
                  {item.at ? (
                    <p className="flex items-baseline gap-2 text-xs text-muted-foreground">
                      <span title={formatDateTime(item.at)}>{ago(item.at)}</span>
                      {!dense ? <span className="font-mono text-[11px]">{formatDateTime(item.at)}</span> : null}
                    </p>
                  ) : null}
                </div>
                {item.description ? <div className={cn("text-pretty text-muted-foreground", dense ? "text-xs" : "mt-0.5 text-sm")}>{item.description}</div> : null}
              </div>
            </m.li>
          ),
        )}
      </ol>
    </div>
  );
}
