import type { LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { TONE_CLASS, type Tone, toneStyle } from "./tone";
import { cn } from "@/lib/utils";

// The small tinted square an icon sits in: stat cards, callouts, empty states, menu rows.
// tone="panel" follows the panel's accent (green in admin and doctor, terracotta for patients).

const SIZE = { sm: "size-7 [&_svg]:size-4", md: "size-9 [&_svg]:size-[18px]", lg: "size-11 [&_svg]:size-[22px]" };
const PANEL_STYLE = { "--tone": "var(--panel-accent)" } as CSSProperties;

export function IconTile({ icon: Icon, tone = "primary", size = "md", className }: { icon: LucideIcon; tone?: Tone | "panel"; size?: "sm" | "md" | "lg"; className?: string }) {
  return (
    <span
      aria-hidden
      style={tone === "panel" ? PANEL_STYLE : toneStyle(tone)}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-md border", TONE_CLASS.tint, TONE_CLASS.border, SIZE[size], className)}
    >
      <Icon />
    </span>
  );
}
