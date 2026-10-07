"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useId, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { LayoutGroup, m, useMotionSafe } from "./motion";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
  { value: "dark", label: "Dark", icon: Moon },
];

/** Light / dark / system. A menu behind one icon in panel headers, a three-way pill on sign-in pages. */
export function ThemeToggle({ variant = "menu", size = "md", align = "end", label = "Change theme", className }: { variant?: "menu" | "segmented"; size?: "sm" | "md"; align?: "start" | "end"; label?: string; className?: string }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  // false on the server and during hydration, true once in the browser: avoids a theme flicker
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const groupId = useId();
  const { dur } = useMotionSafe();

  const current = mounted ? (theme ?? "system") : "system";
  const dark = mounted && resolvedTheme === "dark";

  if (variant === "segmented") {
    return (
      <LayoutGroup id={groupId}>
        <ToggleGroup
          type="single"
          value={current}
          onValueChange={(v) => v && setTheme(v)}
          aria-label={`Theme: ${OPTIONS.find((o) => o.value === current)?.label ?? "System"}`}
          spacing={0}
          className={cn("rounded-full bg-surface-2 p-0.5", className)}
        >
          {OPTIONS.map((option) => (
            <ToggleGroupItem
              key={option.value}
              value={option.value}
              aria-label={option.label}
              className={cn("relative rounded-full! bg-transparent data-[state=on]:bg-transparent hover:bg-transparent", size === "sm" ? "size-7" : "size-8")}
            >
              {current === option.value && mounted ? (
                <m.span layoutId="thumb" transition={{ duration: dur(200) / 1000 }} className="absolute inset-0 rounded-full bg-card shadow-float" />
              ) : null}
              <option.icon className="relative" />
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </LayoutGroup>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size={size === "sm" ? "icon" : "icon-lg"} aria-label={label} title={label} className={cn("relative", className)}>
          <m.span
            key={dark ? "dark" : "light"}
            initial={{ rotate: -90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            transition={{ duration: dur(200) / 1000 }}
            className="inline-flex"
          >
            {dark ? <Moon /> : <Sun />}
          </m.span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-36">
        <DropdownMenuRadioGroup value={current} onValueChange={setTheme}>
          {OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value} className="h-9">
              <option.icon className="size-4" /> {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
