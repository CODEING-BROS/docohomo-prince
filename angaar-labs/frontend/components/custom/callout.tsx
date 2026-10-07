import { CircleCheck, Info, type LucideIcon, OctagonX, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconTile } from "./icon-tile";
import { TONE_CLASS, type Tone, toneStyle } from "./tone";
import { cn } from "@/lib/utils";

// A margin note, not a coloured box: paper with a 3px rule on the left in the tone's colour, so
// three of them on one page still read calm.

const DEFAULT_ICON: Record<Tone, LucideIcon> = {
  info: Info, success: CircleCheck, warning: TriangleAlert, danger: OctagonX, neutral: Info, plum: Info, terracotta: Info, primary: Info,
};

export function Callout({
  tone = "info", title, icon, action, dismissible, onDismiss, compact, role, className, children,
}: {
  tone?: Tone; title?: React.ReactNode; icon?: LucideIcon | null; action?: React.ReactNode; dismissible?: boolean; onDismiss?: () => void;
  compact?: boolean; role?: "status" | "alert"; className?: string; children?: React.ReactNode;
}) {
  const Icon = icon === null ? null : (icon ?? DEFAULT_ICON[tone]);
  return (
    <div
      role={role ?? (tone === "danger" ? "alert" : "status")}
      style={toneStyle(tone)}
      className={cn(
        "relative flex gap-3 rounded-lg border border-foreground/18 bg-card text-sm",
        TONE_CLASS.rule,
        compact ? "min-h-9 items-center px-3 py-1.5" : "items-start px-3.5 py-3",
        className,
      )}
    >
      {Icon ? (compact ? <Icon className={cn("size-4 shrink-0", TONE_CLASS.text)} /> : <IconTile icon={Icon} tone={tone} size="sm" className="mt-0.5" />) : null}
      <div className="min-w-0 flex-1">
        {title ? <p className="font-display text-base/snug italic">{title}</p> : null}
        {children ? <div className={cn("text-pretty text-foreground/85", title && "mt-0.5", compact && "truncate")}>{children}</div> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-1 self-center">{action}</div> : null}
      {dismissible ? (
        <Button type="button" variant="ghost" size="icon-xs" aria-label="Dismiss" onClick={onDismiss} className="shrink-0 self-center text-muted-foreground">
          <X />
        </Button>
      ) : null}
    </div>
  );
}
