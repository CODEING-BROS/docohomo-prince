"use client";

import type { LucideIcon } from "lucide-react";
import { useId } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { LayoutGroup, m, useMotionSafe } from "./motion";
import { TONE_CLASS, type Tone, toneStyle } from "./tone";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

// Every row of filter pills (order statuses, time ranges, Mobile / Password) is this one control.
// Built on a toggle group, so arrow keys move between the chips and the state is announced.

export type ChipOption = { value: string; label: string; count?: number; tone?: Tone; icon?: LucideIcon; disabled?: boolean };

type Props = {
  options: ChipOption[]; ariaLabel: string; size?: "sm" | "md"; variant?: "chips" | "segmented"; scrollable?: boolean; className?: string;
} & ({ multiple?: false; value: string; onChange: (value: string) => void } | { multiple: true; value: string[]; onChange: (value: string[]) => void });

export function FilterChips({ options, ariaLabel, size = "sm", variant = "chips", scrollable = true, className, ...rest }: Props) {
  const id = useId();
  const { dur } = useMotionSafe();
  const height = size === "sm" ? "h-8" : "h-9";
  const segmented = variant === "segmented";
  const isActive = (value: string) => (rest.multiple ? rest.value.includes(value) : rest.value === value);

  const items = options.map((option) => {
    const active = isActive(option.value);
    return (
      <ToggleGroupItem
        key={option.value}
        value={option.value}
        disabled={option.disabled}
        aria-label={option.count !== undefined ? `${option.label}, ${option.count}` : undefined}
        style={option.tone ? toneStyle(option.tone) : undefined}
        className={cn(
          "relative shrink-0 gap-1.5 px-3 text-sm font-medium whitespace-nowrap transition-colors",
          height,
          segmented
            ? "rounded-md! bg-transparent text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=on]:bg-transparent data-[state=on]:text-foreground"
            : "rounded-full! border border-foreground/18 bg-card text-foreground hover:bg-surface-2 data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground",
        )}
      >
        {segmented && active ? <m.span layoutId="thumb" transition={{ duration: dur(200) / 1000 }} className="absolute inset-0 rounded-md bg-card shadow-float" /> : null}
        {option.tone && !segmented ? <span aria-hidden className={cn("relative size-1.5 rounded-full", active ? "bg-primary-foreground/80" : TONE_CLASS.dot)} /> : null}
        {option.icon ? <option.icon className="relative size-4" /> : null}
        <span className="relative">{option.label}</span>
        {option.count !== undefined ? (
          <span className={cn("ledger relative inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px]", active && !segmented ? "bg-primary-foreground/20" : "bg-surface-3 text-muted-foreground")}>
            {formatNumber(option.count)}
          </span>
        ) : null}
      </ToggleGroupItem>
    );
  });

  const group = rest.multiple ? (
    <ToggleGroup type="multiple" value={rest.value} onValueChange={rest.onChange} aria-label={ariaLabel} spacing={segmented ? 0 : 1} className={cn("flex-nowrap", segmented && "rounded-lg bg-surface-2 p-0.5")}>
      {items}
    </ToggleGroup>
  ) : (
    <ToggleGroup type="single" value={rest.value} onValueChange={(v) => v && rest.onChange(v)} aria-label={ariaLabel} spacing={segmented ? 0 : 1} className={cn("flex-nowrap", segmented && "rounded-lg bg-surface-2 p-0.5")}>
      {items}
    </ToggleGroup>
  );

  return (
    <LayoutGroup id={id}>
      <div className={cn(scrollable && !segmented ? "scroll-fade-x no-scrollbar max-w-full overflow-x-auto py-1" : "max-w-full", className)}>{group}</div>
    </LayoutGroup>
  );
}
