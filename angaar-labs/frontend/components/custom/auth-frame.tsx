"use client";

import type { LucideIcon } from "lucide-react";
import { Illustration, type IllustrationName } from "./illustration";
import { m, useMotionSafe } from "./motion";
import { ThemeToggle } from "./theme-toggle";
import { Display, Eyebrow } from "./typography";
import type { Panel } from "./panel-shell";
import { cn } from "@/lib/utils";

// The page around every sign-in form: an ink (or sage, for patients) aside with three points and
// a drawing, the form on paper. Purely presentational; each sign-in keeps its own flow.

const EYEBROW: Record<Panel, string> = { admin: "Staff sign-in", doctor: "Doctor sign-in", patient: "Patient sign-in" };

export function AuthFrame({ panel, title, description, eyebrow, width = "sm", aside, header, footer, children }: {
  panel: Panel; title: string; description?: React.ReactNode; eyebrow?: string; width?: "sm" | "lg";
  aside?: { headline: string; points: { icon: LucideIcon; text: string }[]; illustration: IllustrationName; note?: string };
  header?: React.ReactNode; footer?: React.ReactNode; children: React.ReactNode;
}) {
  const { reduced } = useMotionSafe();
  const sage = panel === "patient";
  const logo = (
    <span className="flex size-9 items-center justify-center rounded-md bg-card p-1 ring-1 ring-foreground/10">
      {/* eslint-disable-next-line @next/next/no-img-element -- small static logo */}
      <img src="/logo-mark.png" alt="DocHomoeo" className="size-full object-contain" />
    </span>
  );

  return (
    <div data-panel={panel} className="grid min-h-dvh bg-background lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className={cn("hidden flex-col justify-between p-10 lg:flex", sage ? "bg-[oklch(0.90_0.04_150)] text-ink dark:bg-[oklch(0.25_0.04_155)] dark:text-paper" : "grain bg-(image:--gradient-brand) text-paper")}>
        <div className="flex items-center gap-3">
          {logo}
          <span className="font-display text-xl/none font-medium">DocHomoeo</span>
        </div>
        {aside ? (
          <div className="my-10">
            <Display level={1} as="p" className="max-w-md">{aside.headline}</Display>
            <ul className={cn("mt-8 max-w-md divide-y", sage ? "divide-foreground/15" : "divide-paper/20")}>
              {aside.points.map((point) => (
                <li key={point.text} className="flex items-center gap-3 py-3 text-sm">
                  <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-md", sage ? "bg-terracotta/15 text-terracotta" : "bg-paper/10 text-paper")}>
                    <point.icon className="size-4" />
                  </span>
                  {point.text}
                </li>
              ))}
            </ul>
            {aside.note ? <p className={cn("mt-6 text-xs", sage ? "text-foreground/60" : "text-paper/60")}>{aside.note}</p> : null}
          </div>
        ) : <div />}
        <div className="flex items-end justify-between gap-4">
          <p className={cn("text-xs", sage ? "text-foreground/60" : "text-paper/60")}>Homeopathy, delivered with care.</p>
          {aside ? (
            <m.div animate={reduced ? undefined : { y: [0, -6, 0] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}>
              <Illustration name={aside.illustration} size={160} className={sage ? "text-terracotta" : "text-paper/90"} />
            </m.div>
          ) : null}
        </div>
      </aside>

      <div className="flex min-h-dvh flex-col">
        <div className="flex h-14 items-center justify-between px-4 sm:px-8">
          <div className="flex items-center gap-2 lg:invisible">{logo}<span className="font-display text-lg font-medium">DocHomoeo</span></div>
          <ThemeToggle variant="segmented" size="sm" />
        </div>
        <div className="flex flex-1 flex-col justify-center px-4 py-8 sm:px-8">
          <div className={cn("mx-auto w-full", width === "lg" ? "max-w-2xl" : "max-w-sm")}>
            {header ? <div className="mb-6">{header}</div> : null}
            <Eyebrow className="mb-2">{eyebrow ?? EYEBROW[panel]}</Eyebrow>
            <Display level={1}>{title}</Display>
            {description ? <p className="mt-2 text-sm text-pretty text-muted-foreground">{description}</p> : null}
            <div className="mt-8">{children}</div>
            {footer ? <div className="mt-8 text-sm text-muted-foreground">{footer}</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
