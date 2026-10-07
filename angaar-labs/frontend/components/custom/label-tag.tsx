import type { LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

// Little printed labels: "18% OFF" stickers, the Rx stamp, TEST MODE ribbons, "(you)" tags.
// There is deliberately no "soon" tone: nothing doctor-facing says "coming soon".

type TagTone = "ink" | "terracotta" | "primary" | "danger" | "plum" | "neutral";
const TONE_VAR: Record<TagTone, string> = {
  ink: "var(--foreground)", terracotta: "var(--terracotta)", primary: "var(--primary)", danger: "var(--destructive)", plum: "var(--plum)", neutral: "var(--muted-foreground)",
};

export function LabelTag({
  children, tone = "ink", variant = "tag", size = "xs", icon: Icon, tilt, className,
}: { children: React.ReactNode; tone?: TagTone; variant?: "tag" | "sticker" | "ribbon" | "stamp"; size?: "xs" | "sm"; icon?: LucideIcon; tilt?: boolean; className?: string }) {
  const style = { "--tone": TONE_VAR[tone] } as CSSProperties;
  const base = cn("inline-flex shrink-0 items-center gap-1 font-semibold tracking-[0.08em] whitespace-nowrap uppercase", size === "xs" ? "h-5 px-1.5 text-[10px]/none" : "h-6 px-2 text-[11px]/none");
  const fill = tone === "neutral" ? "bg-surface-3 text-foreground" : "bg-(--tone) text-paper";

  if (variant === "stamp") {
    return (
      <span style={style} className={cn("font-display inline-flex h-6 shrink-0 items-center rounded-md border-2 border-double border-(--tone) bg-transparent px-2 text-sm normal-case italic text-(--tone)", (tilt ?? true) && "rotate-[-6deg]", className)}>
        {children}
      </span>
    );
  }
  if (variant === "ribbon") {
    return (
      <span className={cn(base, "rounded-sm border border-foreground/30 bg-[repeating-linear-gradient(-45deg,var(--terracotta-soft)_0_10px,var(--background)_10px_20px)] text-ink", className)}>
        {Icon ? <Icon className="size-3" /> : null}
        {children}
      </span>
    );
  }
  return (
    <span
      style={style}
      className={cn(
        base, fill,
        variant === "sticker" ? "rounded-sm [clip-path:polygon(0_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%)]" : "rounded-sm",
        (variant === "sticker" ? (tilt ?? true) : tilt) && "rotate-[-3deg]",
        className,
      )}
    >
      {Icon ? <Icon className="size-3" /> : null}
      {children}
    </span>
  );
}
