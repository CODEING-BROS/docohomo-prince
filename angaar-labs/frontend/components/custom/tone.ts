import type { CSSProperties } from "react";

// A "tone" is the one colour a component speaks in: a status pill, a callout, a dot on a timeline.
// Components set the --tone variable once (toneStyle) and use the constant classes below, so every
// class is spelled out for Tailwind and no colour is built from a template string.

export type Tone = "neutral" | "success" | "warning" | "info" | "danger" | "terracotta" | "plum" | "primary";

export const TONE_LIST: Tone[] = ["neutral", "success", "warning", "info", "danger", "terracotta", "plum", "primary"];

const TONE_VAR: Record<Tone, string> = {
  neutral: "var(--muted-foreground)",
  success: "var(--success)",
  warning: "var(--warning)",
  info: "var(--info)",
  danger: "var(--destructive)",
  terracotta: "var(--terracotta)",
  plum: "var(--plum)",
  primary: "var(--primary)",
};

export const toneStyle = (tone: Tone): CSSProperties => ({ "--tone": TONE_VAR[tone] } as CSSProperties);

/** Classes that read the --tone variable set by toneStyle. */
export const TONE_CLASS = {
  text: "text-(--tone)",
  /** a 14% tint of the tone with the tone itself as text: readable in both themes, never white on colour */
  tint: "bg-[color-mix(in_oklch,var(--tone)_14%,transparent)] text-(--tone)",
  dot: "bg-(--tone)",
  /** the 3px margin-note rule on the left edge */
  rule: "shadow-[inset_3px_0_0_var(--tone)]",
  ring: "ring-(--tone)",
  border: "border-[color-mix(in_oklch,var(--tone)_25%,transparent)]",
} as const;

/** Up is good unless told otherwise; no change is neutral, never green. */
export const toneFromChange = (change: number | null | undefined, lowerIsBetter = false): Tone => {
  if (change === null || change === undefined || change === 0) return "neutral";
  const good = lowerIsBetter ? change < 0 : change > 0;
  return good ? "success" : "danger";
};
