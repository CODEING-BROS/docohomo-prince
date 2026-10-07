"use client";

import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Eyebrow, Title } from "./typography";
import { cn } from "@/lib/utils";

// A sheet of paper on the desk: hairline between header and body, no shadow, optional step number.

export function SectionCard({
  title, description, number, eyebrow, action, footer, flush, collapsible, defaultOpen = true, tone = "default", className, bodyClassName, children,
}: {
  title?: React.ReactNode; description?: React.ReactNode; number?: number | string; eyebrow?: string; action?: React.ReactNode; footer?: React.ReactNode;
  /** body without padding, for a table that runs edge to edge */
  flush?: boolean; collapsible?: boolean; defaultOpen?: boolean; tone?: "default" | "muted" | "dashed" | "plum"; className?: string; bodyClassName?: string; children?: React.ReactNode;
}) {
  const hasHeader = title || description || action || eyebrow;
  const header = hasHeader ? (
    <div className={cn("flex items-start justify-between gap-3 px-4 py-3", tone === "plum" && "bg-plum-soft/60", children && "border-b border-foreground/18", tone === "muted" && "border-b-0 pb-0")}>
      <div className="flex min-w-0 items-start gap-3">
        {number !== undefined ? (
          <span aria-hidden className="font-display flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-medium text-primary italic">{number}</span>
        ) : null}
        <div className="min-w-0">
          {eyebrow ? <Eyebrow className="mb-1">{eyebrow}</Eyebrow> : null}
          {title ? <Title as="h2">{title}</Title> : null}
          {description ? <p className="mt-0.5 text-sm text-pretty text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {action}
        {collapsible ? (
          <CollapsibleTrigger asChild>
            <button type="button" aria-label="Show or hide" className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-2 [&[data-state=open]>svg]:rotate-180">
              <ChevronDown className="size-4 transition-transform" />
            </button>
          </CollapsibleTrigger>
        ) : null}
      </div>
    </div>
  ) : null;

  const body = children ? <div className={cn(flush ? "" : "px-4 py-4", bodyClassName)}>{children}</div> : null;
  const frame = cn(
    "min-w-0 rounded-xl bg-card", // min-w-0: a grid column never widens for long content inside
    tone === "default" && "border border-border",
    tone === "plum" && "border border-plum/30",
    tone === "dashed" && "border border-dashed border-foreground/25 bg-transparent",
    tone === "muted" && "bg-surface-2",
    className,
  );

  if (collapsible) {
    return (
      <Collapsible defaultOpen={defaultOpen} className={frame}>
        {header}
        <CollapsibleContent>{body}{footer ? <div className="border-t border-foreground/18 bg-surface-2 px-4 py-3 text-sm">{footer}</div> : null}</CollapsibleContent>
      </Collapsible>
    );
  }
  return (
    <section className={frame}>
      {header}
      {body}
      {footer ? <div className="rounded-b-xl border-t border-foreground/18 bg-surface-2 px-4 py-3 text-sm">{footer}</div> : null}
    </section>
  );
}
