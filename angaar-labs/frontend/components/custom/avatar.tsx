"use client";

import type { CSSProperties } from "react";
import { Avatar, AvatarBadge, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TONE_CLASS, type Tone, toneStyle } from "./tone";
import { cn } from "@/lib/utils";

// One avatar for staff, doctors, patients and customers: a photo when there is one, otherwise two
// initials on a duotone picked from the name, so the same person always gets the same colours.

const DUOTONES = [
  ["oklch(0.45 0.11 153)", "oklch(0.72 0.12 120)"],
  ["oklch(0.60 0.15 42)", "oklch(0.80 0.11 85)"],
  ["oklch(0.50 0.08 240)", "oklch(0.70 0.10 190)"],
  ["oklch(0.52 0.10 330)", "oklch(0.70 0.13 20)"],
  ["oklch(0.40 0.09 170)", "oklch(0.62 0.14 42)"],
  ["oklch(0.55 0.12 85)", "oklch(0.42 0.10 153)"],
];

export const cleanName = (name: string | null | undefined) => (name ?? "").replace(/^dr\.?\s*/i, "").trim();

const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");

export const avatarGradient = (name: string) => {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const [from, to] = DUOTONES[hash % DUOTONES.length];
  return `linear-gradient(135deg, ${from}, ${to})`;
};

const SIZE = { xs: "size-6 text-[10px]", sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-14 text-base", xl: "size-20 text-xl", hero: "size-28 text-3xl" };

export function GradientAvatar({
  name, src, size = "md", shape = "circle", ring, status, stripDoctorPrefix = true, className,
}: { name: string | null | undefined; src?: string | null; size?: keyof typeof SIZE; shape?: "circle" | "square"; ring?: Tone | null; status?: Tone; stripDoctorPrefix?: boolean; className?: string }) {
  const shown = stripDoctorPrefix ? cleanName(name) : (name ?? "").trim();
  const initials = initialsOf(shown) || "?";
  const round = shape === "circle" ? "rounded-full" : "rounded-md";
  const style = { background: avatarGradient(shown || "?"), ...(ring ? toneStyle(ring) : {}) } as CSSProperties;
  return (
    <Avatar
      style={ring ? toneStyle(ring) : undefined}
      className={cn(SIZE[size], round, "after:hidden", ring && cn("ring-2 ring-offset-2 ring-offset-background", TONE_CLASS.ring), className)}
    >
      {src ? <AvatarImage src={src} alt="" className={round} /> : null}
      <AvatarFallback style={style} className={cn(round, "font-display font-medium text-primary-foreground")} aria-label={shown || undefined}>
        {initials}
      </AvatarFallback>
      {status ? <AvatarBadge style={toneStyle(status)} className={cn("size-2.5 ring-background", TONE_CLASS.dot)} /> : null}
    </Avatar>
  );
}
