"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TONE_CLASS, type Tone, toneStyle } from "./tone";
import { Eyebrow } from "./typography";
import { cn } from "@/lib/utils";

// Label and value pairs set like a ledger: dotted leaders, figures on the right, a double rule
// above the total. With columns it becomes the eyebrow-and-value grid used on detail pages.

export type DetailItem = { label: React.ReactNode; value: React.ReactNode; mono?: boolean; copyable?: string | boolean; tone?: Tone; hint?: string; strong?: boolean; span?: 1 | 2 };

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button" variant="ghost" size="icon-xs" aria-label="Copy" className="-my-1 text-muted-foreground"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        toast.success("Copied");
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <Check className="text-success" /> : <Copy />}
    </Button>
  );
}

const COLUMNS = { 1: "", 2: "grid gap-x-6 gap-y-4 sm:grid-cols-2", 3: "grid gap-x-6 gap-y-4 sm:grid-cols-3", 4: "grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4" };

export function DetailList({
  items, columns = 1, leaders = columns === 1, total, savings, dense, className,
}: { items: DetailItem[]; columns?: 1 | 2 | 3 | 4; leaders?: boolean; total?: { label: string; value: React.ReactNode; note?: string }; savings?: React.ReactNode; dense?: boolean; className?: string }) {
  const valueClass = (item: DetailItem) => cn("ledger min-w-0 text-right", item.mono && "font-mono text-[0.8125rem]", item.strong && "font-semibold", item.tone && TONE_CLASS.text);
  const copyText = (item: DetailItem) => (typeof item.copyable === "string" ? item.copyable : item.copyable && typeof item.value === "string" ? item.value : null);

  if (columns > 1) {
    return (
      <dl className={cn(COLUMNS[columns], className)}>
        {items.map((item, i) => (
          <div key={i} className={cn("min-w-0", item.span === 2 && "sm:col-span-2")} style={item.tone ? toneStyle(item.tone) : undefined}>
            <Eyebrow as="dt">{item.label}</Eyebrow>
            <dd className={cn("mt-1 flex items-center gap-1 text-sm font-medium", item.mono && "font-mono text-[0.8125rem]", item.tone && TONE_CLASS.text)}>
              <span className="min-w-0 break-words">{item.value}</span>
              {copyText(item) ? <CopyButton text={copyText(item)!} /> : null}
            </dd>
            {item.hint ? <p className="mt-0.5 text-xs text-muted-foreground">{item.hint}</p> : null}
          </div>
        ))}
      </dl>
    );
  }

  return (
    <div className={cn("text-sm", className)}>
      <dl className={cn(dense ? "space-y-1" : "space-y-2")}>
        {items.map((item, i) => (
          <div key={i} className="flex items-baseline gap-2" style={item.tone ? toneStyle(item.tone) : undefined}>
            <dt className={cn("shrink-0 text-muted-foreground", item.strong && "font-medium text-foreground")}>
              {item.label}
              {item.hint ? <span className="ml-1 text-xs text-muted-foreground/80">{item.hint}</span> : null}
            </dt>
            {leaders ? <span aria-hidden className="mx-2 mb-1 flex-1 border-b border-dotted border-foreground/30" /> : <span className="flex-1" />}
            <dd className={cn("flex items-center gap-1", valueClass(item))}>
              {item.value}
              {copyText(item) ? <CopyButton text={copyText(item)!} /> : null}
            </dd>
          </div>
        ))}
      </dl>
      {savings ? <div className="mt-3 flex justify-end"><span className="rounded-sm bg-(image:--gradient-terracotta) px-2 py-0.5 text-xs font-medium text-terracotta-foreground">{savings}</span></div> : null}
      {total ? (
        <div className="mt-3 flex items-baseline justify-between gap-3 border-t-[3px] border-double border-foreground/30 pt-2">
          <span className="font-medium">
            {total.label}
            {total.note ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">{total.note}</span> : null}
          </span>
          <span className="font-display ledger text-[1.75rem]/[1.15] font-medium [font-variation-settings:'opsz'_48]">{total.value}</span>
        </div>
      ) : null}
    </div>
  );
}
