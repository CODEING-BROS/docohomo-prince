"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

// Tap-to-choose pills for a short list of answers: languages, how long, symptoms.
// Easier than a dropdown on a phone, and every choice is visible at once.

type Option = string | { value: string; label: string; hint?: string };
type Props = {
  options: Option[]; ariaLabel: string; tone?: "terracotta" | "primary"; size?: "sm" | "md"; className?: string;
} & ({ multiple: true; value: string[]; onChange: (value: string[]) => void; max?: number } | { multiple?: false; value: string; onChange: (value: string) => void });

export function ChipPicker({ options, ariaLabel, tone = "terracotta", size = "md", className, ...rest }: Props) {
  const chosen = (value: string) => (rest.multiple ? rest.value.includes(value) : rest.value === value);
  const toggle = (value: string) => {
    if (!rest.multiple) return rest.onChange(rest.value === value ? "" : value);
    if (rest.value.includes(value)) return rest.onChange(rest.value.filter((v) => v !== value));
    if (rest.max && rest.value.length >= rest.max) return;
    rest.onChange([...rest.value, value]);
  };
  const full = rest.multiple && rest.max ? rest.value.length >= rest.max : false;

  return (
    <div role="group" aria-label={ariaLabel} className={cn("flex flex-wrap gap-2", className)}>
      {options.map((option) => {
        const { value, label, hint } = typeof option === "string" ? { value: option, label: option, hint: undefined } : option;
        const on = chosen(value);
        return (
          <button
            key={value} type="button" role={rest.multiple ? "checkbox" : "radio"} aria-checked={on} disabled={!on && full} title={hint}
            onClick={() => toggle(value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border font-medium transition-[background-color,border-color,color,box-shadow] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-40",
              size === "sm" ? "h-8 px-3 text-sm" : "h-10 px-4 text-sm",
              on
                ? tone === "terracotta" ? "border-terracotta bg-terracotta text-terracotta-foreground shadow-float" : "border-primary bg-primary text-primary-foreground shadow-float"
                : "border-foreground/18 bg-card text-foreground not-disabled:hover:border-foreground/40 not-disabled:hover:bg-surface-2",
            )}
          >
            {on ? <Check className="size-3.5" /> : null}
            {label}
          </button>
        );
      })}
    </div>
  );
}
