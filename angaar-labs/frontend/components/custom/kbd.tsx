import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

// Key caps for the shortcuts that exist but are invisible today (⌘B for the sidebar, ← → on pages).

/** The modifier key as this computer names it; read on the client, "Ctrl" on the server. */
export const KEYS = {
  get mod() {
    return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
  },
  enter: "↵",
  esc: "Esc",
  left: "←",
  right: "→",
};

export function Shortcut({ keys, label, size = "sm", inline, className }: { keys: string[]; label?: string; size?: "xs" | "sm"; inline?: boolean; className?: string }) {
  return (
    <span className={cn("items-center gap-1.5", inline ? "inline-flex" : "flex", className)}>
      {label ? <span className={cn("text-muted-foreground", size === "xs" ? "text-[10px]" : "text-xs")}>{label}</span> : null}
      <KbdGroup aria-label={label ? undefined : keys.join(" ")}>
        {keys.map((key, index) => (
          <Kbd
            key={`${key}-${index}`}
            className={cn(
              "border border-foreground/18 bg-surface-2 font-mono text-muted-foreground shadow-[inset_0_-1px_0_var(--border)]",
              size === "xs" ? "h-4 min-w-4 px-0.5 text-[10px]" : "h-5 text-[11px]",
            )}
          >
            {key}
          </Kbd>
        ))}
      </KbdGroup>
    </span>
  );
}
