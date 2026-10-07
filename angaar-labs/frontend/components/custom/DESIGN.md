# DocHomoeo design system — FINAL SPEC: "Dispensary Ledger" (with grafts)

Winner: **Dispensary Ledger** (34 + 33 from the two judges). Grafted from the other two directions exactly as the judges named them, with every conflict resolved below. Every file path and line number here was verified by reading `D:/Docomo/angaar-labs/frontend` (Next 16.3.8, React 19.2.8, Tailwind v4, shadcn ^4.21.1 "radix-nova", `cn` package, `radix-ui` ^1.6.7, cmdk ^1.1.1, motion ^14 and @number-flow/react ^0.6.2 already in `package.json` and imported nowhere).

## 0. Decisions (what changed from the Dispensary draft and why)

| Topic | Decision | Source |
|---|---|---|
| Cursor layering | Rules 1-4 inside `@layer base`; only the hard-coded `cursor-default` slots (`select-item`, `select-scroll-*`, `dropdown-menu-item/checkbox-item/radio-item/sub-trigger`, `command-item`) unlayered. The brittle `[class~="cursor-*"]` exclusion list and the `sidebar-rail` exclusion are deleted: utilities live in the later `utilities` layer, so `cursor-text` (input-group.tsx:26), `cursor-grab`, and the rail's variant-prefixed `cursor-w-resize` (sidebar.tsx:292-293) win by layer order. Verified by compiling the file with the project's `@tailwindcss/postcss`: layer order is `theme, base, components, utilities`, the four rules land in `base`, rule 5 outside. | Glasshouse, both judges |
| Disabled cursors | Fixed at the primitive, matching the codebase's own precedent (checkbox.tsx:16, switch.tsx:19, radio-group.tsx:28, textarea.tsx:9, select.tsx:46 already use `disabled:cursor-not-allowed`). Dispensary's global `pointer-events: auto` restore is **dropped**; the exact primitive edits are listed in §5.2. | Judge 2, Glasshouse, Mother Tincture |
| `::file-selector-button`, `data-disabled="false"` guard, `fieldset:disabled` descendants, explicit `data-slot` list, `aria-busy`/`draggable` | All in the rule. | Glasshouse, Mother Tincture |
| `[role="combobox"]` | `[role="combobox"]:not(input)` — cmdk's CommandInput is `<input role="combobox">` and must keep the I-beam; SelectTrigger is a `<button role="combobox">` and gets the hand from `button` anyway. | Mother Tincture |
| Button `loading` | Adds `aria-busy="true"` so rule 4 (`cursor: progress`) fires on pending submits; rule 4 is later in source than rule 3, so a loading **and** disabled button shows `progress`, not `not-allowed`. | Judge 2 |
| Row hover | Hover tint and the 3px terracotta inset rule move to `DataTableRow` (`data-clickable`); `hover:bg-muted/50` is removed from `components/ui/table.tsx:59` **in the same PR** that migrates the 10 clickable `<TableRow onClick>` sites (§8.3), so no row loses feedback in between. | Mother Tincture, Judge 2 |
| Inner-control clicks in clickable rows | Instead of auditing `stopPropagation` in 10 pages, `DataTableRow` ignores clicks/Enter whose target is inside an interactive descendant (`closest('a,button,input,select,textarea,label,[role="menuitem"],[role="checkbox"],[data-slot="dropdown-menu-content"]')`). One guard, zero per-page audits. | Glasshouse risk, resolved centrally |
| B2B channel colour | New `--plum` / `--plum-foreground` / `--plum-soft` tokens; StatusPill tone `plum` is reserved for `B2B`, wholesale accounts, tier cards and the B2B order header. `D2C` stays neutral. | Mother Tincture |
| LabelTag | Added (`tag` / `sticker` / `ribbon` / `stamp`), rendered in ink + terracotta, never mustard. There is **no `SOON` tone** and no "coming soon" label anywhere doctor-facing (product memory). | Mother Tincture |
| QuantityStepper, CheckboxRow / SwitchRow (44px, bordered checked state), ProgressBar beside ProgressRing | Added. | Mother Tincture |
| ReasonDialog | Separate component with `minLength`; `ConfirmDialog` has no `reason` prop. | Judge 2 |
| IconTile | Own component with `tone="panel"` reading `--panel-accent` (green in admin/doctor, terracotta in patient). StatCard, Callout, EmptyState and AuthFrame use it. | Glasshouse |
| parts.tsx | `components/admin/parts.tsx` becomes thin re-exports with the **same prop signatures** (61 files import it; see §8.1). | Glasshouse |
| Motion switch | `components/providers.tsx` wraps children in one `MotionRoot` = `LazyMotion features={domAnimation} strict` + `MotionConfig reducedMotion="user"`. Every segmented `FilterChips` / `ThemeToggle` wraps its thumb in its own `LayoutGroup id={useId()}`, so two on one page (reports: channel + range) never animate between each other. | Glasshouse |
| Grain | **Not** on `body`. Only on ink bands (`.grain` on PageHero tone=ink and the AuthFrame aside). Removes the fixed full-viewport blend layer both judges flagged. | Both judges' paint-cost risk |
| Glass | Only the sticky panel header (`.glass-header`), with `@supports not (backdrop-filter)` and `prefers-reduced-transparency` fallbacks. | Glasshouse |
| Fraunces weight | `axes: ['opsz']` only (SOFT dropped until LCP on `/admin/login` is measured; add `'SOFT'` afterwards if the font stays under ~150 KB). | Both judges |
| Serif floor | Serif never below 1.125rem. Because `font-heading` is already used by `card.tsx:40`, `dialog.tsx:133`, `sheet.tsx:117`, `alert-dialog.tsx:126`, `empty.tsx:62`, those five title slots move to `text-lg` (and the `size="sm"` Card title falls back to `font-sans text-sm`) in the companion edits (§5.3). | Dispensary rule + verified font-heading sites |
| Contrast retune | Dispensary's terracotta (L 0.625) and warning (L 0.690) fail 4.5:1 as text on paper; both are re-tuned (terracotta L 0.565, warning L 0.555) and chart-3 to L 0.66. Every text-on-tint pair must pass the dataviz palette validator before merge (§2.4). | Judge 2 / Glasshouse |
| `--border` | Never repointed to ink: `globals.css` applies `border-border` to `*`. Strong/hairline rules use `border-foreground/30` and `/18` utilities instead. | Mother Tincture |
| Panel scoping | `data-panel="admin|doctor|patient"` goes on the PanelShell root and the AuthFrame root (not `<html>`, which nested layouts cannot set without an effect). Three `@custom-variant`s (`admin:` `doctor:` `patient:`) and the sidebar token overrides key off it. | Resolves Dispensary's `html[data-panel]` |

## 1. Tokens — `app/globals.css` (complete file)

The complete file is returned in `globalsCss` and reproduced here. It keeps every token name the shadcn primitives rely on (background, foreground, card, popover, primary, secondary, muted, accent, destructive, border, input, ring, chart-1..5, sidebar-*, radius, success, warning, info), keeps `@custom-variant dark`, `[data-radix-select-viewport]` and `.scroll-thin`, and compiles with the project's Tailwind pipeline (verified).

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));
/* Panel scopes. PanelShell and AuthFrame put data-panel on their root element, so
   `patient:h-12`-style tweaks and the sidebar token overrides below work without
   per-panel component variants. */
@custom-variant admin (&:is([data-panel="admin"] *));
@custom-variant doctor (&:is([data-panel="doctor"] *));
@custom-variant patient (&:is([data-panel="patient"] *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-sans);
  /* next/font exposes --font-fraunces and --font-plex-mono (app/layout.tsx); the theme
     keys use different names so no key references itself. */
  --font-display: var(--font-fraunces), Georgia, "Times New Roman", serif;
  --font-heading: var(--font-fraunces), Georgia, "Times New Roman", serif;
  --font-mono: var(--font-plex-mono), ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar: var(--sidebar);
  --color-chart-5: var(--chart-5);
  --color-chart-4: var(--chart-4);
  --color-chart-3: var(--chart-3);
  --color-chart-2: var(--chart-2);
  --color-chart-1: var(--chart-1);
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary: var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover: var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);
  /* status tones (badges, charts, callouts) */
  --color-success: var(--success);
  --color-warning: var(--warning);
  --color-info: var(--info);
  /* Dispensary Ledger additions */
  --color-surface-2: var(--surface-2);
  --color-surface-3: var(--surface-3);
  --color-primary-soft: var(--primary-soft);
  --color-terracotta: var(--terracotta);
  --color-terracotta-foreground: var(--terracotta-foreground);
  --color-terracotta-soft: var(--terracotta-soft);
  --color-plum: var(--plum);
  --color-plum-foreground: var(--plum-foreground);
  --color-plum-soft: var(--plum-soft);
  --color-panel-accent: var(--panel-accent);
  --color-panel-accent-soft: var(--panel-accent-soft);
  --color-paper: var(--background);
  --color-ink: var(--foreground);
  --shadow-float: var(--float-shadow);
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);
}

/* LIGHT: warm paper, botanical-green ink, terracotta reserved for "now". */
:root {
  --background: oklch(0.975 0.010 85);
  --foreground: oklch(0.215 0.018 160);
  --card: oklch(0.992 0.005 85);
  --card-foreground: oklch(0.215 0.018 160);
  --popover: oklch(0.992 0.005 85);
  --popover-foreground: oklch(0.215 0.018 160);
  --surface-2: oklch(0.950 0.014 82);
  --surface-3: oklch(0.930 0.016 80);
  --primary: oklch(0.405 0.105 153);
  --primary-foreground: oklch(0.975 0.010 85);
  --primary-soft: oklch(0.925 0.035 150);
  --secondary: oklch(0.925 0.035 150);
  --secondary-foreground: oklch(0.300 0.070 155);
  --muted: oklch(0.950 0.014 82);
  --muted-foreground: oklch(0.470 0.020 90);
  --accent: oklch(0.940 0.030 60);
  --accent-foreground: oklch(0.215 0.018 160);
  --destructive: oklch(0.545 0.205 27);
  --border: oklch(0.875 0.014 80);
  --input: oklch(0.845 0.016 80);
  --ring: oklch(0.550 0.120 153);
  --success: oklch(0.515 0.125 150);
  --warning: oklch(0.555 0.135 70);
  --info: oklch(0.520 0.090 240);
  --terracotta: oklch(0.565 0.145 42);
  --terracotta-foreground: oklch(0.985 0.008 85);
  --terracotta-soft: oklch(0.935 0.040 50);
  --plum: oklch(0.500 0.120 330);
  --plum-foreground: oklch(0.985 0.008 330);
  --plum-soft: oklch(0.940 0.030 330);
  --panel-accent: var(--primary);
  --panel-accent-soft: var(--primary-soft);
  --chart-1: oklch(0.470 0.110 153);
  --chart-2: oklch(0.600 0.150 42);
  --chart-3: oklch(0.660 0.140 78);
  --chart-4: oklch(0.560 0.080 240);
  --chart-5: oklch(0.560 0.100 330);
  --radius: 0.5rem;
  --float-shadow: 0 1px 2px oklch(0.2 0.02 160 / 0.06), 0 16px 40px -16px oklch(0.2 0.02 160 / 0.22);
  --gradient-brand: linear-gradient(160deg, oklch(0.285 0.070 160) 0%, oklch(0.405 0.105 153) 60%, oklch(0.355 0.090 170) 100%);
  --gradient-terracotta: linear-gradient(90deg, oklch(0.565 0.145 42), oklch(0.700 0.130 60));
  /* admin sidebar = ink band */
  --sidebar: oklch(0.255 0.050 157);
  --sidebar-foreground: oklch(0.925 0.018 85);
  --sidebar-primary: oklch(0.720 0.140 42);
  --sidebar-primary-foreground: oklch(0.985 0.008 85);
  --sidebar-accent: oklch(0.315 0.055 157);
  --sidebar-accent-foreground: oklch(0.985 0.008 85);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.720 0.140 42);
}

/* DARK: the same ledger by lamplight. Tone text stays the tone colour, never white on tone. */
.dark {
  --background: oklch(0.165 0.012 160);
  --foreground: oklch(0.935 0.014 85);
  --card: oklch(0.205 0.012 160);
  --card-foreground: oklch(0.935 0.014 85);
  --popover: oklch(0.205 0.012 160);
  --popover-foreground: oklch(0.935 0.014 85);
  --surface-2: oklch(0.250 0.012 160);
  --surface-3: oklch(0.290 0.012 160);
  --primary: oklch(0.720 0.130 153);
  --primary-foreground: oklch(0.165 0.040 155);
  --primary-soft: oklch(0.270 0.045 155);
  --secondary: oklch(0.270 0.045 155);
  --secondary-foreground: oklch(0.900 0.050 150);
  --muted: oklch(0.250 0.012 160);
  --muted-foreground: oklch(0.700 0.016 85);
  --accent: oklch(0.280 0.020 70);
  --accent-foreground: oklch(0.935 0.014 85);
  --destructive: oklch(0.700 0.180 25);
  --border: oklch(1 0 0 / 11%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.650 0.120 153);
  --success: oklch(0.740 0.135 152);
  --warning: oklch(0.800 0.130 78);
  --info: oklch(0.720 0.100 240);
  --terracotta: oklch(0.730 0.130 45);
  --terracotta-foreground: oklch(0.180 0.040 40);
  --terracotta-soft: oklch(0.300 0.050 45);
  --plum: oklch(0.760 0.110 330);
  --plum-foreground: oklch(0.200 0.050 330);
  --plum-soft: oklch(0.300 0.050 330);
  --chart-1: oklch(0.720 0.130 153);
  --chart-2: oklch(0.740 0.130 45);
  --chart-3: oklch(0.820 0.110 88);
  --chart-4: oklch(0.700 0.090 240);
  --chart-5: oklch(0.700 0.100 330);
  --float-shadow: 0 1px 2px oklch(0 0 0 / 0.4), 0 16px 40px -16px oklch(0 0 0 / 0.7);
  --gradient-brand: linear-gradient(160deg, oklch(0.205 0.045 160) 0%, oklch(0.300 0.080 153) 60%, oklch(0.255 0.065 170) 100%);
  --gradient-terracotta: linear-gradient(90deg, oklch(0.730 0.130 45), oklch(0.800 0.120 62));
  --sidebar: oklch(0.135 0.012 160);
  --sidebar-foreground: oklch(0.900 0.014 85);
  --sidebar-primary: oklch(0.730 0.130 45);
  --sidebar-primary-foreground: oklch(0.180 0.040 40);
  --sidebar-accent: oklch(0.215 0.030 157);
  --sidebar-accent-foreground: oklch(0.985 0.008 85);
  --sidebar-border: oklch(1 0 0 / 8%);
  --sidebar-ring: oklch(0.730 0.130 45);
}

/* PANEL OVERRIDES. Doctor and patient sidebars are paper, not ink; the patient panel's accent is terracotta, the doctor's stays green. */
[data-panel="doctor"],
[data-panel="patient"] {
  --sidebar: oklch(0.965 0.012 85);
  --sidebar-foreground: var(--foreground);
  --sidebar-accent-foreground: var(--foreground);
  --sidebar-border: var(--border);
  --sidebar-ring: var(--ring);
}
[data-panel="doctor"] {
  --sidebar-accent: oklch(0.925 0.035 150);
  --sidebar-primary: var(--primary);
  --sidebar-primary-foreground: var(--primary-foreground);
}
[data-panel="patient"] {
  --sidebar-accent: oklch(0.935 0.040 50);
  --sidebar-primary: var(--terracotta);
  --sidebar-primary-foreground: var(--terracotta-foreground);
  --panel-accent: var(--terracotta);
  --panel-accent-soft: var(--terracotta-soft);
}
.dark [data-panel="doctor"],
.dark [data-panel="patient"] {
  --sidebar: oklch(0.185 0.012 160);
  --sidebar-border: oklch(1 0 0 / 10%);
}
.dark [data-panel="doctor"] { --sidebar-accent: oklch(0.270 0.045 155); }
.dark [data-panel="patient"] { --sidebar-accent: oklch(0.300 0.050 45); }

@layer base {
  * { @apply border-border outline-ring/50; }
  body { @apply bg-background text-foreground; }
  html { @apply font-sans; font-variant-numeric: lining-nums; }
}

/* ============================================================================
   CURSOR POLICY  (see §5 for the explanatory comment that ships in the file)
   ========================================================================== */
@layer base {
  /* 1. Pointer on everything a person can click, toggle, pick or open. */
  :where(
    button, select, summary, a[href], area[href],
    label[for],
    label:has(input, select, textarea, button, [role="checkbox"], [role="radio"], [role="switch"]),
    input:is([type="button"], [type="submit"], [type="reset"], [type="image"], [type="checkbox"], [type="radio"], [type="range"], [type="file"], [type="color"]),
    [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"],
    [role="option"], [role="checkbox"], [role="radio"], [role="switch"], [role="treeitem"], [role="slider"],
    [role="combobox"]:not(input),
    [data-slot="checkbox"], [data-slot="switch"], [data-slot="radio-group-item"],
    [data-slot="tabs-trigger"], [data-slot="toggle"], [data-slot="toggle-group-item"],
    [data-slot="accordion-trigger"], [data-slot="collapsible-trigger"],
    [data-slot="sidebar-menu-button"], [data-slot="sidebar-menu-action"], [data-slot="sidebar-group-action"], [data-slot="sidebar-menu-sub-button"],
    [data-slot="select-item"], [data-slot="select-scroll-up-button"], [data-slot="select-scroll-down-button"],
    [data-slot="dropdown-menu-item"], [data-slot="dropdown-menu-checkbox-item"], [data-slot="dropdown-menu-radio-item"], [data-slot="dropdown-menu-sub-trigger"],
    [data-slot="command-item"], [cmdk-item],
    [data-clickable]
  ):not(:disabled, [aria-disabled="true"], [data-disabled]:not([data-disabled="false"])) {
    cursor: pointer;
  }
  ::file-selector-button { cursor: pointer; }

  /* 2. Typing surfaces keep the I-beam, even inside a pointer label or a clickable row. */
  :where(
    input:not([type="button"], [type="submit"], [type="reset"], [type="image"], [type="checkbox"], [type="radio"], [type="range"], [type="file"], [type="color"]),
    textarea,
    [contenteditable]:not([contenteditable="false"]),
    [role="textbox"], [role="searchbox"]
  ):not(:disabled, [aria-disabled="true"]) {
    cursor: text;
  }

  /* 3. Disabled things say so. */
  :where(
    button, input, select, textarea, summary, a, label,
    [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"],
    [role="option"], [role="checkbox"], [role="radio"], [role="switch"], [role="combobox"], [role="treeitem"], [role="slider"],
    [data-slot], [cmdk-item], [data-clickable]
  ):is(:disabled, [aria-disabled="true"], [data-disabled]:not([data-disabled="false"])),
  :where(fieldset:disabled) :where(button, input, select, textarea, label, [role="button"], [role="checkbox"], [role="radio"], [role="switch"]),
  :where(label, [data-slot="field-label"]):has(:disabled, [aria-disabled="true"], [data-disabled]:not([data-disabled="false"])) {
    cursor: not-allowed;
  }

  /* 4. Busy and draggable. */
  :where(button, [role="button"], a[href], [data-clickable], form)[aria-busy="true"] { cursor: progress; }
  :where([draggable="true"]) { cursor: grab; }
  :where([draggable="true"]):active { cursor: grabbing; }
}

/* 5. Unlayered: these slots carry a hard-coded `cursor-default` utility. */
:where(
  [data-slot="select-item"], [data-slot="select-scroll-up-button"], [data-slot="select-scroll-down-button"],
  [data-slot="dropdown-menu-item"], [data-slot="dropdown-menu-checkbox-item"], [data-slot="dropdown-menu-radio-item"], [data-slot="dropdown-menu-sub-trigger"],
  [data-slot="command-item"]
):not([aria-disabled="true"], [data-disabled]:not([data-disabled="false"])) {
  cursor: pointer;
}

/* Ledger helpers */
@utility ledger {
  font-variant-numeric: tabular-nums lining-nums;
  font-feature-settings: "tnum", "lnum";
}
.grain { position: relative; isolation: isolate; }
.grain::after {
  content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none;
  opacity: 0.14; mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='160' height='160' filter='url(%23n)'/></svg>");
  background-size: 160px 160px;
}
.dark .grain::after { opacity: 0.1; mix-blend-mode: screen; }
.glass-header {
  background: color-mix(in oklch, var(--background) 85%, transparent);
  backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
  border-bottom: 1px solid color-mix(in oklch, var(--foreground) 18%, transparent);
}
@supports not (backdrop-filter: blur(1px)) { .glass-header { background: var(--background); } }
@media (prefers-reduced-transparency: reduce) {
  .glass-header { background: var(--background); backdrop-filter: none; -webkit-backdrop-filter: none; }
  .grain::after { display: none; }
}
.cn-toast { font-family: var(--font-sans); border: 1px solid var(--border); box-shadow: var(--float-shadow); }
[data-radix-select-viewport] { scrollbar-width: thin !important; scrollbar-color: var(--border) transparent; }
.scroll-thin { scrollbar-width: thin; scrollbar-color: color-mix(in oklab, var(--foreground) 22%, transparent) transparent; }
@media (prefers-reduced-motion: reduce) {
  *, ::before, ::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }
}
@media print {
  [data-slot="sidebar"], [data-slot="sidebar-gap"], [data-slot="panel-header"], [data-sonner-toaster], .print-hidden, .grain::after { display: none !important; }
  body { background: #fff; }
  main { padding: 0 !important; }
  .glass-header { position: static; backdrop-filter: none; }
}
```

### 1.1 Token notes
- **Paper, not white.** `--background` is warm paper; `--card`/`--popover` are a shade lighter so cards read as sheets on a desk without shadows. `--surface-2` (= `--muted`) is table-head / wells; `--surface-3` is row hover and the toolbar strip.
- **`--secondary`, `--accent`, `--muted` are now three different tints** (today all three are `oklch(0.97 0 0)` at globals.css:60-65): sage for secondary buttons, warm sand for Radix menu focus/ghost hover, paper-grey for muted. Review the messages editor and bulk toolbar where all three sit together, and the Calendar (react-day-picker 10) and Command palette that rely on `--accent` for selection.
- **Terracotta = "now / look here"** (active nav marker, current Stepper node, next appointment, savings ribbon, patient CTAs). **Destructive = danger only** (hue 27 vs 42; never map `danger` to terracotta). **Plum = B2B/wholesale** only. **Green = ink, primary actions, verified**.
- **Tints are always `color-mix(in oklch, var(--tone) 14%, transparent)` with the tone colour as text** — never white on tone. This replaces today's `text-white on bg-success` (shop Stars pill, streams correct-answer chips), which fails contrast in dark mode where `--success` is L 0.74.
- `--gradient-brand` / `--gradient-terracotta` are plain custom properties; use them with `bg-(image:--gradient-brand)` (Tailwind v4 has no background-image theme namespace).
- `--radius` goes 0.625rem → 0.5rem (sm 0.3 / md 0.4 / lg 0.5 / xl 0.7 / 2xl 0.9rem through the existing calc chain). Badge keeps `rounded-4xl` (a pill), small buttons clamp to ≤12px; Checkbox's fixed `rounded-[4px]` now matches md, so no change needed.
- **Never repoint `--border` to the ink colour**: `@layer base * { border-border }` would turn every divider black. Hairline rules are `border-foreground/18`, strong rules `border-foreground/30`, double rules `border-b-[3px] border-double border-foreground/30`.

### 1.2 Avatar duotones (6 pairs, picked by name hash, 135°)
`[oklch(0.45 0.11 153)→oklch(0.72 0.12 120)]`, `[oklch(0.60 0.15 42)→oklch(0.80 0.11 85)]`, `[oklch(0.50 0.08 240)→oklch(0.70 0.10 190)]`, `[oklch(0.52 0.10 330)→oklch(0.70 0.13 20)]`, `[oklch(0.40 0.09 170)→oklch(0.62 0.14 42)]`, `[oklch(0.55 0.12 85)→oklch(0.42 0.10 153)]`; initials always `--primary-foreground`-paper in Fraunces 500.

### 1.3 Contrast verification (ships before tokens merge)
Run these pairs through the `dataviz` skill's palette validator, light and dark: `--muted-foreground` on `--background`, `--card`, `--surface-2`, `--surface-3`; each tone's text on its own 14% tint (`success`, `warning`, `info`, `destructive`, `terracotta`, `plum`, `neutral`); `--primary-foreground` on `--primary`; `--terracotta-foreground` on `--terracotta`; `--plum-foreground` on `--plum`; `--sidebar-foreground` on `--sidebar` and `--sidebar-accent`; `chart-1..5` ≥ 3:1 on `--card`. Targets: 4.5:1 text, 3:1 marks. The L values above are tuned to pass (terracotta L 0.565 ≈ 5:1 on paper; warning L 0.555 ≈ 4.9:1; success L 0.515 ≈ 5:1; info ≈ 5:1; plum ≈ 5.5:1), but validate, do not assume.

## 2. Typography

### 2.1 `app/layout.tsx`
```tsx
import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono, Public_Sans } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const publicSans = Public_Sans({ variable: "--font-sans", subsets: ["latin"], display: "swap" });
// Display face: titles, hero numbers, folio numerals. Only the optical-size axis is
// loaded; add "SOFT" after measuring LCP on /admin/login (see §9).
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], axes: ["opsz"], display: "swap" });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"], display: "swap" });

export const metadata: Metadata = { title: { default: "DocHomoeo", template: "%s · DocHomoeo" }, description: "DocHomoeo store management" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${publicSans.variable} ${fraunces.variable} ${plexMono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full"><Providers>{children}</Providers></body>
    </html>
  );
}
```
`axes` is an array of strings for `next/font/google` (verified in `node_modules/next/dist/docs/01-app/03-api-reference/02-components/font.md` §axes); variable fonts need no `weight`. The theme keys `--font-display`/`--font-heading`/`--font-mono` reference `--font-fraunces`/`--font-plex-mono` so no theme key references itself (today `--font-heading: var(--font-sans)` at globals.css:12 makes `font-heading` a no-op).

### 2.2 Scale (size/line, face, weight)
| Role | Recipe | Where |
|---|---|---|
| display-1 | `font-display text-4xl/[1.1] font-medium tracking-[-0.015em] [font-variation-settings:'opsz'_72]` (2.25rem) | PageHero titles, AuthFrame headline |
| display-2 | `font-display text-[1.75rem]/[1.15] font-medium [font-variation-settings:'opsz'_48]` | StatCard values, ProgressRing centre, DetailList totals |
| title | `font-display text-lg/[1.3] font-medium` (1.125rem) | SectionCard, dialog, sheet, empty titles |
| eyebrow | `text-[0.6875rem]/none font-semibold uppercase tracking-[0.12em] text-muted-foreground` | folio lines, table heads, section labels |
| body | `text-sm/normal` Public Sans 400 | everything |
| cell | `text-[0.8125rem]/[1.4]` | dense tables |
| small | `text-xs/[1.4]` | hints |
| mono | `font-mono text-[0.8125rem]` (uppercase codes `font-medium`) | order numbers, SKUs, references, tracking ids |
| numerals | `ledger` utility (tabular + lining) on every table, DetailList, StatCard and money cell; money cells `text-right ledger whitespace-nowrap` | |

Rules: serif never below 1.125rem; forms, tables, badges and buttons stay in Public Sans; only `components/custom/typography.tsx` and the five shadcn title slots may use `font-display`/`font-heading` (review checklist rejects it elsewhere). Headings `text-balance`, paragraphs `text-pretty`.

## 3. Shape, rules, surfaces, print
- Cards: `rounded-xl border border-border bg-card shadow-none` (ui/card.tsx's `ring-1 ring-foreground/10` stays on plain Card; SectionCard uses the border form). **No card shadows anywhere**; depth comes from rules. Floating layers only (popover, dropdown, dialog, sheet, command) get `shadow-float`.
- Rules: hairline `border-foreground/18` inside cards and between rows; strong `border-foreground/30` for section breaks; double `border-b-[3px] border-double border-foreground/30` under PageHero and above ledger totals; dotted leaders `flex-1 mx-2 mb-1 border-b border-dotted border-foreground/30` in DetailList.
- Margin-note rule: Callouts and the active sidebar item use a 3px left rule (`shadow-[inset_3px_0_0_var(--tone)]`) instead of a full tint; clickable rows show the same inset rule in terracotta on hover/focus-visible.
- Pills `rounded-full`; icon tiles `rounded-md`; the sticky header is `.glass-header`; ink bands are `bg-(image:--gradient-brand) text-paper grain`.
- Folio corner: eyebrow + Fraunces-italic number (`No. 0421`) on prescriptions, order sheets, invoices.
- Controls: one height per context — 36px toolbar (`Button size="lg"`, `SelectTrigger` default is 32px so toolbar selects get `className="h-9"`), 32px inline (`size="default"`), 28px in table cells (`size="sm"`). Patient panel: 40px controls, 48px rows via the `patient:` variant.
- Print: the `@media print` block hides `[data-slot="sidebar"]`, `[data-slot="sidebar-gap"]`, `[data-slot="panel-header"]` (PanelHeader sets this slot), the sonner toaster and grain; any new fixed chrome must be added there.

## 4. Motion
- `components/custom/motion.tsx` is the single entry: `MotionRoot` (`<LazyMotion features={domAnimation} strict><MotionConfig reducedMotion="user" transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>`), mounted once in `components/providers.tsx` inside `ThemeProvider`. Every custom component imports `m` (never `motion`) from `motion/react`; `strict` throws otherwise, which is the guard.
- Enter: `Reveal` / `Stagger` — `initial {opacity:0,y:6}` → `animate {opacity:1,y:0}`, 220ms, 35ms stagger, capped at 12 children, run once per mount keyed by route (never on refetch; `isPlaceholderData` is a 150ms opacity crossfade to .6). Tables never animate rows.
- Page transitions: new `app/admin/(panel)/template.tsx`, `app/doctor/(panel)/template.tsx`, `app/patient/(panel)/template.tsx` render `<Reveal>{children}</Reveal>` (180ms fade + 4px rise). Templates remount when their own segment changes (verified in `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/template.md`), so the fade fires per navigation and not on search-param changes.
- Hover: CSS only, 150ms `transition-[background-color,color,border-color,box-shadow]`; no scale/lift on cards; buttons keep `active:translate-y-px`; clickable rows slide in the 3px terracotta inset rule.
- Numbers: NumberFlow `transformTiming={{duration:600, easing:'cubic-bezier(.22,1,.36,1)'}}`, `spinTiming={{duration:500}}`, `respectMotionPreference` default on; used in StatCard, DetailList totals, ProgressRing centre, `Place order · ₹X` buttons, bell/cart counts. Static (`animate={false}`) inside table cells.
- Timeline rail `scaleY 0→1` 400ms, nodes 60ms apart; Stepper current node halo `animate-[pulse_2s_ease-in-out_infinite]` in terracotta/35; ProgressRing `stroke-dashoffset` 700ms; StatusPill in-flight dot pulses 2s; segmented thumbs use `m.span layoutId` inside a per-instance `LayoutGroup`.
- Reduced motion: `MotionConfig reducedMotion="user"` + `useMotionSafe()` in every custom component + the globals.css floor.

## 5. Cursor policy

### 5.1 What the rule does (the comment that ships in globals.css)
Tailwind v4 preflight gives `<button>` no cursor (verified: `node_modules/tailwindcss/preflight.css` sets none), and the shadcn menu/select/command items hard-code `cursor-default` (`components/ui/select.tsx` 114/150/169, `dropdown-menu.tsx` 75/97/141/228, `command.tsx` 158). Rules 1-4 live in `@layer base`; utilities sit in the later `utilities` layer, so a deliberate `cursor-text` (`input-group.tsx:26`), `cursor-grab`, or the sidebar rail's variant-prefixed `cursor-w-resize` (`sidebar.tsx` 292-293) wins on its own, and `:where()` keeps every selector at zero specificity so inline styles win too. Rule 5 is unlayered on purpose: unlayered author CSS beats every layer, the only way to beat the `cursor-default` utility without editing the primitives. cmdk writes `data-disabled="false"` on ENABLED items (`command.tsx:158` checks `=true` for that reason), so every disabled check excludes that value. Radix items disabled through `data-disabled` keep `pointer-events-none` and show the arrow — intentional; do not "fix" it or Radix will highlight disabled items.

Coverage: pointer on buttons, links, labels (with `for` or wrapping a control), summary, selects, clickable input types, ARIA roles, the Radix/cmdk item slots and scroll buttons, sidebar menu/action/group-action/sub buttons, tabs/toggle/accordion/collapsible triggers (belt-and-braces for `asChild` divs), `[data-clickable]` rows/items/cards; I-beam preserved on text inputs, textareas, contenteditable, textbox/searchbox roles (and `InputGroupAddon` keeps its own `cursor-text` utility); `not-allowed` on native/ARIA/Radix disabled, `fieldset:disabled` descendants and labels wrapping a disabled control; `progress` on `aria-busy` buttons/links/rows/forms; `grab`/`grabbing` on `draggable`.

### 5.2 Companion edits in `components/ui` (exact)
An element with `pointer-events: none` shows its parent's cursor, never its own, so `not-allowed` cannot render through it.
- `button.tsx:7`: `disabled:pointer-events-none` → `disabled:cursor-not-allowed`; `active:not-aria-[haspopup]:translate-y-px` → `not-disabled:active:not-aria-[haspopup]:translate-y-px`. Variants: `hover:bg-primary/80` → `not-disabled:hover:bg-primary/80`; outline `hover:bg-muted hover:text-foreground` → `not-disabled:hover:bg-muted not-disabled:hover:text-foreground`, `dark:hover:bg-input/50` → `dark:not-disabled:hover:bg-input/50`; secondary `hover:bg-[color-mix(...)]` → `not-disabled:hover:bg-[color-mix(...)]`; ghost `hover:bg-muted hover:text-foreground` → `not-disabled:hover:...`, `dark:hover:bg-muted/50` → `dark:not-disabled:hover:bg-muted/50`; destructive `hover:bg-destructive/20` → `not-disabled:hover:bg-destructive/20`, `dark:hover:bg-destructive/30` → `dark:not-disabled:hover:bg-destructive/30`; link `hover:underline` → `not-disabled:hover:underline`. Anchors via `asChild` keep hover (they are never `:disabled`). Add prop `loading?: boolean`: sets `aria-busy="true"`, `disabled`, and renders `<Spinner data-icon="inline-start" />` from `components/ui/spinner` before children. (`not-*` variants compile in this project: field.tsx:109 already uses `not-has-[...]`.)
- `tabs.tsx:65`: `disabled:pointer-events-none` → `disabled:cursor-not-allowed`; `hover:text-foreground` → `not-disabled:hover:text-foreground`.
- `toggle.tsx:9`: same swap; `hover:bg-muted hover:text-foreground` → `not-disabled:hover:bg-muted not-disabled:hover:text-foreground` (also the outline variant's `hover:bg-muted`).
- `accordion.tsx:44`: same swap; `hover:underline` → `not-disabled:hover:underline`.
- `sidebar.tsx:469` and `:669`: `disabled:pointer-events-none` → `disabled:cursor-not-allowed`, `aria-disabled:pointer-events-none` → `aria-disabled:cursor-not-allowed` (no hover guard needed: the nav has no disabled items once the "Soon" branch at app-sidebar.tsx:123-130 is removed).
- `input.tsx:10`: delete `disabled:pointer-events-none` (it already has `disabled:cursor-not-allowed`).
- `label.tsx:15`: `group-data-[disabled=true]:pointer-events-none` → `group-data-[disabled=true]:cursor-not-allowed`.
- `spinner.tsx`: replace `Loader2Icon` with an inline SVG ring (1.5px track `foreground/15`, terracotta arc, `animate-spin`, `role="status" aria-label="Loading"`), keeping `data-slot="spinner"` and `className`.
- `table.tsx:59`: remove `hover:bg-muted/50` **in the same PR** as the DataTableRow migration (§8.3). `data-[state=selected]:bg-muted` and `has-aria-expanded:bg-muted/50` stay.
- Leave `cursor-default` in select/dropdown/command untouched (rule 5 handles it, and the primitives stay in sync with upstream shadcn).

### 5.3 Title-size companion edits (serif floor)
- `card.tsx:40`: `"font-heading text-base leading-snug font-medium group-data-[size=sm]/card:text-sm"` → `"font-heading text-lg leading-snug font-medium group-data-[size=sm]/card:font-sans group-data-[size=sm]/card:text-sm"`.
- `dialog.tsx:133`: `text-base leading-none` → `text-lg leading-tight`. `sheet.tsx:117`, `alert-dialog.tsx:126`: `text-base` → `text-lg`. `empty.tsx:62`: `text-sm` → `text-lg`.

### 5.4 What still shows the arrow, by design
Radix items disabled with `data-disabled` (select/dropdown/command), `Kbd` (`pointer-events-none` at kbd.tsx:8), decorative SVGs, `SidebarMenuBadge`.

## 6. Component library — `components/custom/` (one file at a time, no circular imports)

Build in this order; each file imports only from `components/ui/*`, `lib/*`, `motion/react`, `@number-flow/react`, `lucide-react`, and files **above** it in the list. Full per-file contracts are in the `library` array; the highlights:

0. `tone.ts` — `Tone` type and class maps; every tone-aware component sets `style={toneStyle(tone)}` (a `--tone` variable) and uses constant classes (`text-(--tone)`, `bg-[color-mix(in_oklch,var(--tone)_14%,transparent)]`, `shadow-[inset_3px_0_0_var(--tone)]`).
1. `status-registry.ts` — one table mapping every status string in the three panels to `{ tone, label, inFlight }`, with per-kind overrides where the same string means different things.
2. `typography.tsx` → 3. `number.tsx` → 4. `kbd.tsx` → 5. `illustration.tsx` → 6. `icon-tile.tsx` → 7. `loaders.tsx` → 8. `kpi-sparkline.tsx` → 9. `label-tag.tsx` → 10. `avatar.tsx` → 11. `motion.tsx` → 12. `theme-toggle.tsx` (all level 0: no custom imports except `tone.ts`).
13. `status-pill.tsx` → 14. `callout.tsx` → 15. `empty-state.tsx` → 16. `progress-ring.tsx` → 17. `detail-list.tsx` → 18. `filter-chips.tsx` → 19. `timeline.tsx` → 20. `stepper.tsx` → 21. `section-card.tsx` → 22. `stat-card.tsx` → 23. `form-field.tsx` → 24. `page-hero.tsx` → 25. `dialogs.tsx` → 26. `data-table.tsx` → 27. `panel-shell.tsx` → 28. `auth-frame.tsx` (level 1-2: import level 0 and the ui primitives; `dialogs` imports `callout`/`status-pill`/`loaders`; `panel-shell` imports `avatar`/`status-pill`/`theme-toggle`/`loaders`/`kbd`; `data-table` imports `loaders`/`empty-state`/`kbd`/`typography`; none of those import back).
29. `components/admin/parts.tsx` → thin re-exports (§8.1). 30. `components/providers.tsx` → wrap in `MotionRoot`. 31. the three `template.tsx` files.

## 7. Panel signatures
- **Admin — the ledger room.** `data-panel="admin"`. Ink-green sidebar (`--sidebar` oklch(0.255 0.05 157)) with paper text and a 3px terracotta left rule + `sidebar-accent` fill on the active item; content on paper; `PageHero tone="paper"` with a folio eyebrow naming the area ("Sales · Orders · 1,284"); densest rhythm (40px rows, 32px inline controls, 36px toolbar); StatCards with sparklines and ticking totals; the dashboard alone uses `PageHero tone="ink"` with the four StatCards overlapping its bottom edge by 24px (never on list pages, or the first row drops below the fold on 768px laptops); timezone, notifications and theme are 36px `HeaderAction`s; every list is `DataTable` + `FilterChips` + `PaginationBar`; print hides the shell.
- **Doctor — the consulting room.** `data-panel="doctor"`. Paper sidebar with a hairline rule and sage active tint; green for verified/approved; the overview opens with an ink PageHero carrying the doctor's `GradientAvatar` (terracotta verification ring), level and rating `StatusPill`s and today's date; terracotta only for "now" (next appointment card, current Stepper node in onboarding and the stream test, the Join button within 10 minutes); earnings as a ledger (`DetailList` totals under a double rule, NumberFlow digits); `Timeline` for payouts; the wholesale shop reuses the shop pieces under a plum-tinted strip (`Callout tone="plum"`) stating tier and saving — plum, never a different layout.
- **Patient — the dispensary counter.** `data-panel="patient"`. Paper sidebar with a sand (`terracotta-soft`) active tint; roomier rhythm (48px rows, 40px controls via `patient:` variants); terracotta is the CTA accent for booking and paying ("Pay now", "Place order · ₹X") while green stays for confirmations and verified doctors; prescriptions render as a letterhead Rx sheet (double rule, `Folio` number, doctor registration line, numbered medicines in a ledger) that prints; orders and checkout use `Stepper`; empty states lean on the warm illustrations (cart, calendar, prescriptions); product cards wear `LabelTag`s (`% OFF` terracotta sticker, `Rx` ink stamp, `OUT OF STOCK` danger tag).
- **Logins — one AuthFrame, three moods.** Admin: ink aside on `--gradient-brand` with grain, "Staff sign-in" eyebrow, three points (stock, orders, reports), form on paper, `ThemeToggle` in a fixed 56px top bar. Doctor: same ink aside with a terracotta ruled strip and the `doctors` illustration; signup/register reuse `width="lg"` with the `Stepper` in the header. Patient: aside flips to sage `oklch(0.90 0.04 150)` with the terracotta `welcome` illustration; the Mobile/Password switch is `FilterChips variant="segmented"`; OTP uses `OtpField`. All three share `SidebarBrand`'s logo-mark on a paper tile (retires every `dark:bg-white` at app-sidebar.tsx 97/100, doctor-shell.tsx 83/86, patient-shell.tsx 73/76, admin login 49, patient login 102, doctor/auth-frame.tsx 21/40, app/page.tsx 11).

## 8. Migration

### 8.1 `components/admin/parts.tsx` becomes re-exports (same signatures, 61 importers keep compiling)
- `PageHeader({ title, description, children })` → `PageHero` with `tone="paper"`, children rendered as `actions`.
- `StatCard({ label, value: string, change, icon, hint })` → new `StatCard` (accepts `value: number | string | null`; a string renders static, a number ticks).
- `StatusBadge({ status, label, className })` → `StatusPill`; `StatusDot({ status })` → `StatusDot` export of status-pill.tsx.
- `SearchInput({ value, onChange, placeholder, className })` → `SearchField` (keeps the 350ms debounce and external-reset behaviour).
- `PaginationBar(...)` → data-table.tsx `PaginationBar` (same props, plus optional `sizes`).
- `EmptyState({ icon, title, description })` → new `EmptyState` (`icon` still accepted as a fallback when `illustration` is absent).
- `Thumb` stays in parts.tsx (product/brand thumbs) with `bg-white` → `bg-card`; brands/page.tsx:116 and components/site/product-card.tsx:18 lose `bg-white` the same way.

### 8.2 Hand-written `cursor-pointer` to retire (17 sites, 13 files)
TableRows: `app/admin/(panel)/orders/page.tsx:311`, `returns/page.tsx:513`, `products/page.tsx:220`, `enquiries/page.tsx:266`, `appointments/page.tsx:464`, `prescriptions/page.tsx:233`, `streams/page.tsx:134`, `messages/page.tsx:326` and `:937` → `DataTableRow`. Labels: `app/doctor/register/page.tsx:308`, `app/patient/(panel)/checkout/page.tsx:165/186`, `components/shop/checkout.tsx:112/149`, `components/shop/listing.tsx:85/220`, `app/admin/(panel)/doctors/[id]/page.tsx:145` → the global rule covers `label:has(...)`; delete the class when each moves to `CheckboxRow`/`FormField`.

### 8.3 DataTableRow migration (one PR, with the table.tsx:59 edit)
The 10 TableRow sites above gain keyboard access (`tabIndex=0`, `role`, Enter/Space) from `DataTableRow`; its inner-interactive guard means rows with inline buttons/links/checkboxes (orders, products, enquiries selection checkboxes; messages row switches) need no per-page `stopPropagation`.

### 8.4 StatusPill registry
Generate `KnownStatus` from the strings found in `lib/types.ts`, `lib/care.ts`, `lib/onboarding.ts` and the page files; unknown strings fall back to `neutral` **and log once in development** so a missing tone is caught. Borrowed statuses today (patient page 'DELIVERED' for Ordered, addresses 'CONFIRMED' for Usual, products/import/doctor-tiers/streams) migrate with the `tone`/`label` escape hatches so no colour silently changes.

## 9. Risks and guard rails
1. Fraunces (opsz axis, latin) must be measured on `/admin/login` (LCP, transfer size); add `'SOFT'` only if the file stays under ~150 KB; never load it for text under 1.125rem.
2. `--radius`, `--secondary`, `--accent`, `--muted`, `--border` changes restyle every shadcn primitive at once: do a visual pass on Calendar, Command palette, Select menus, Sheet and the messages editor.
3. Warm paper exposes hard-coded whites (`bg-white` at product-card.tsx:18 and brands/page.tsx:116; `dark:bg-white` logo tiles) — all must move to `bg-card`/`SidebarBrand` or they read as white stickers on cream.
4. NumberFlow renders transformed spans; StatCard value rows need `overflow-visible` and `min-w-[Nch]` (N = widest expected digit count), never `truncate` (parts.tsx:35 uses `truncate` today).
5. Terracotta (hue 42) vs destructive (hue 27): check side by side in dark mode where chroma drops; StatusPill/Callout never map `danger` to terracotta.
6. Only dashboards use `PageHero tone="ink"`.
7. `LazyMotion strict`: any `motion.div` (instead of `m.div`) throws at runtime — that is the intended guard; keep the import rule in the review checklist.
8. `ToggleGroup` (Radix) owns roving tabindex in FilterChips; the overflow strip uses shadcn's `scroll-fade-x` utility (verified at `node_modules/shadcn/dist/tailwind.css:238`) with `py-1` so focus rings are never clipped.
9. Print styles are new to the admin panel: any extra fixed chrome (toaster, future banners) must be added to the `@media print` block.
10. Doctor-facing UI never shows a "Soon"/"Coming soon" label (product memory): streams with `COMING_SOON` are filtered server-side or labelled "Not open yet" only in admin; `LabelTag` and `StatusPill` have no `soon` tone.
11. Auth flows stay separate (dh_session / dh_doctor / dh_user cookies, x-panel headers): `AuthFrame` is purely presentational.
