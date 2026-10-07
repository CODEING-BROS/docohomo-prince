import { cn } from "@/lib/utils";

// Small ink drawings for empty states and sign-in pages. Lines in the text colour, two flat tints:
// green for leaves, bottles and paper, terracotta for the one thing that matters in the picture.

export const ILLUSTRATION_NAMES = [
  "orders", "returns", "doctors", "patients", "prescriptions", "inventory", "cart", "search", "locked", "caught-up",
  "mail", "calendar", "payouts", "reviews", "error", "welcome", "wholesale", "delivery",
] as const;
export type IllustrationName = (typeof ILLUSTRATION_NAMES)[number];

const GREEN = "var(--primary)";
const CLAY = "var(--terracotta)";
const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const tint = (color: string) => ({ fill: color, fillOpacity: 0.18, stroke: "none" });

const Leaf = ({ x, y, flip }: { x: number; y: number; flip?: boolean }) => (
  <g transform={`translate(${x} ${y})${flip ? " scale(-1 1)" : ""}`}>
    <path d="M0 0c6-14 20-16 28-10-2 12-14 20-28 10z" {...tint(GREEN)} />
    <path d="M0 0c6-14 20-16 28-10-2 12-14 20-28 10z M0 0c8-4 16-6 24-8" {...stroke} />
  </g>
);

const DRAWINGS: Record<IllustrationName, React.ReactNode> = {
  orders: (
    <>
      <path d="M36 44l44-16 44 16v40l-44 16-44-16z" {...tint(GREEN)} />
      <path d="M36 44l44-16 44 16v40l-44 16-44-16z M36 44l44 16 44-16 M80 60v40" {...stroke} />
      <path d="M58 36l44 16v14l-8-3V56l-44-16z" {...tint(CLAY)} />
      <path d="M58 36l44 16v14l-8-3" {...stroke} />
      <Leaf x={118} y={96} />
    </>
  ),
  returns: (
    <>
      <rect x="44" y="48" width="72" height="44" rx="4" {...tint(GREEN)} />
      <rect x="44" y="48" width="72" height="44" rx="4" {...stroke} />
      <path d="M44 62h72" {...stroke} />
      <path d="M90 26c-20 0-34 10-38 24M50 44l2-10M50 44l10 2" {...stroke} />
      <circle cx="90" cy="26" r="7" {...tint(CLAY)} />
      <circle cx="90" cy="26" r="7" {...stroke} />
    </>
  ),
  doctors: (
    <>
      <path d="M52 30c0 24 8 40 24 40s24-16 24-40" {...stroke} />
      <path d="M48 30a4 4 0 1 0 8 0a4 4 0 1 0-8 0M96 30a4 4 0 1 0 8 0a4 4 0 1 0-8 0" {...stroke} />
      <path d="M76 70v12c0 10 8 16 18 16h8c10 0 16-8 16-18" {...stroke} />
      <circle cx="118" cy="72" r="9" {...tint(CLAY)} />
      <circle cx="118" cy="72" r="9" {...stroke} />
      <circle cx="118" cy="72" r="3" {...stroke} />
      <Leaf x={22} y={100} />
    </>
  ),
  patients: (
    <>
      <circle cx="64" cy="44" r="16" {...tint(GREEN)} />
      <circle cx="64" cy="44" r="16" {...stroke} />
      <path d="M30 100c4-20 16-30 34-30s30 10 34 30" {...stroke} />
      <circle cx="108" cy="52" r="12" {...stroke} />
      <path d="M90 100c2-14 10-22 20-24" {...stroke} />
      <path d="M104 52h8M108 48v8" {...stroke} stroke={CLAY} />
    </>
  ),
  prescriptions: (
    <>
      <path d="M46 20h56l16 16v68H46z" {...tint(GREEN)} />
      <path d="M46 20h56l16 16v68H46z M102 20v16h16" {...stroke} />
      <path d="M58 44h30M58 56h40M58 68h36M58 80h24" {...stroke} />
      <circle cx="106" cy="86" r="10" {...tint(CLAY)} />
      <path d="M101 80v12M101 80h5a3 3 0 0 1 0 6h-5M106 86l5 6" {...stroke} />
    </>
  ),
  inventory: (
    <>
      <path d="M40 92h80M48 92V60h20v32M70 92V46h20v46M92 92V70h20v22" {...stroke} />
      <rect x="48" y="60" width="20" height="32" {...tint(GREEN)} />
      <rect x="70" y="46" width="20" height="46" {...tint(GREEN)} />
      <rect x="92" y="70" width="20" height="22" {...tint(CLAY)} />
      <path d="M44 36c10 2 18 2 28 0" {...stroke} />
    </>
  ),
  cart: (
    <>
      <path d="M30 32h14l10 44h52l10-30H52" {...stroke} />
      <path d="M52 46h66l-10 30H54z" {...tint(GREEN)} />
      <circle cx="62" cy="92" r="5" {...stroke} />
      <circle cx="98" cy="92" r="5" {...stroke} />
      <path d="M76 36v-10M70 30l6-6 6 6" {...stroke} stroke={CLAY} />
    </>
  ),
  search: (
    <>
      <circle cx="70" cy="52" r="26" {...tint(GREEN)} />
      <circle cx="70" cy="52" r="26" {...stroke} />
      <path d="M90 72l24 24" {...stroke} strokeWidth={3} />
      <path d="M58 44c4-6 14-8 20-2" {...stroke} />
      <circle cx="116" cy="30" r="5" {...tint(CLAY)} />
    </>
  ),
  locked: (
    <>
      <rect x="48" y="54" width="64" height="44" rx="6" {...tint(GREEN)} />
      <rect x="48" y="54" width="64" height="44" rx="6" {...stroke} />
      <path d="M60 54V40a20 20 0 0 1 40 0v14" {...stroke} />
      <circle cx="80" cy="74" r="5" {...tint(CLAY)} />
      <path d="M80 74v10" {...stroke} />
    </>
  ),
  "caught-up": (
    <>
      <circle cx="80" cy="60" r="34" {...tint(GREEN)} />
      <circle cx="80" cy="60" r="34" {...stroke} />
      <path d="M62 62l12 12 24-28" {...stroke} strokeWidth={2.5} />
      <Leaf x={116} y={96} />
      <Leaf x={44} y={28} flip />
    </>
  ),
  mail: (
    <>
      <rect x="36" y="38" width="88" height="56" rx="5" {...tint(GREEN)} />
      <rect x="36" y="38" width="88" height="56" rx="5" {...stroke} />
      <path d="M36 44l44 30 44-30" {...stroke} />
      <circle cx="118" cy="40" r="8" {...tint(CLAY)} />
      <circle cx="118" cy="40" r="8" {...stroke} />
    </>
  ),
  calendar: (
    <>
      <rect x="40" y="34" width="80" height="64" rx="5" {...tint(GREEN)} />
      <rect x="40" y="34" width="80" height="64" rx="5" {...stroke} />
      <path d="M40 50h80M58 26v14M102 26v14" {...stroke} />
      <rect x="86" y="62" width="18" height="16" rx="3" {...tint(CLAY)} />
      <path d="M54 66h8M68 66h8M54 80h8M68 80h8" {...stroke} />
    </>
  ),
  payouts: (
    <>
      <rect x="34" y="42" width="92" height="50" rx="6" {...tint(GREEN)} />
      <rect x="34" y="42" width="92" height="50" rx="6" {...stroke} />
      <circle cx="80" cy="67" r="13" {...tint(CLAY)} />
      <circle cx="80" cy="67" r="13" {...stroke} />
      <path d="M75 61h10M75 66h10M78 61c6 0 6 10 0 12l5 6" {...stroke} />
      <path d="M44 52h6M110 82h6" {...stroke} />
    </>
  ),
  reviews: (
    <>
      <path d="M80 26l14 28 30 4-22 21 5 30-27-15-27 15 5-30-22-21 30-4z" {...tint(CLAY)} />
      <path d="M80 26l14 28 30 4-22 21 5 30-27-15-27 15 5-30-22-21 30-4z" {...stroke} />
      <path d="M80 44l6 12 14 2-10 9 2 14-12-6" {...stroke} strokeOpacity={0.4} />
    </>
  ),
  error: (
    <>
      <path d="M80 22l50 86H30z" {...tint(CLAY)} />
      <path d="M80 22l50 86H30z" {...stroke} />
      <path d="M80 52v26" {...stroke} strokeWidth={2.5} />
      <circle cx="80" cy="90" r="2.5" fill="currentColor" />
    </>
  ),
  welcome: (
    <>
      <path d="M44 100c0-30 14-54 36-70 22 16 36 40 36 70" {...tint(GREEN)} />
      <path d="M44 100c0-30 14-54 36-70 22 16 36 40 36 70M80 30v70" {...stroke} />
      <path d="M80 56c-10-2-18-10-20-20 10 0 18 8 20 20zM80 74c10-2 18-10 20-20-10 0-18 8-20 20z" {...tint(CLAY)} />
      <path d="M80 56c-10-2-18-10-20-20 10 0 18 8 20 20zM80 74c10-2 18-10 20-20-10 0-18 8-20 20z" {...stroke} />
    </>
  ),
  wholesale: (
    <>
      <path d="M28 70l20-12 20 12v26H28zM68 58l20-12 20 12v38H68zM108 70l20-12v38h-20z" {...tint(GREEN)} />
      <path d="M28 70l20-12 20 12v26H28zM68 58l20-12 20 12v38H68zM108 70l20-12v38h-20z" {...stroke} />
      <rect x="82" y="78" width="12" height="18" {...tint(CLAY)} />
      <path d="M82 78h12v18" {...stroke} />
    </>
  ),
  delivery: (
    <>
      <path d="M28 44h60v40H28z" {...tint(GREEN)} />
      <path d="M28 44h60v40H28zM88 56h22l14 14v14H88z" {...stroke} />
      <path d="M88 56h22l14 14v14H88z" {...tint(CLAY)} />
      <circle cx="46" cy="90" r="7" {...stroke} />
      <circle cx="108" cy="90" r="7" {...stroke} />
      <path d="M14 60h8M10 70h12" {...stroke} />
    </>
  ),
};

export function Illustration({ name, size = 112, className, title }: { name: IllustrationName; size?: number; className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 160 120"
      width={size}
      height={size * 0.75}
      className={cn("shrink-0 text-foreground/80", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      {DRAWINGS[name] ?? DRAWINGS.orders}
    </svg>
  );
}
