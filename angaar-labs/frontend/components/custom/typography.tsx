import { cn } from "@/lib/utils";

// The only file (besides the shadcn title slots) that sets the serif. Everything else is Public Sans.

/** Small caps line above a block: "Sales · Orders · 1,284". */
export function Eyebrow({ as: Tag = "p", className, children, ...props }: { as?: "p" | "span" | "div" | "th" | "dt" } & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={cn("text-[0.6875rem]/none font-semibold tracking-[0.12em] text-muted-foreground uppercase", className)} {...props}>
      {children}
    </Tag>
  );
}

/** Page titles (level 1) and big figures (level 2) in the display serif. */
export function Display({ level = 1, as, className, children, ...props }: { level?: 1 | 2; as?: "h1" | "h2" | "p" | "span" | "div" } & React.HTMLAttributes<HTMLElement>) {
  const Tag = as ?? (level === 1 ? "h1" : "p");
  return (
    <Tag
      className={cn(
        "font-display font-medium",
        level === 1
          ? "text-4xl/[1.1] tracking-[-0.015em] text-balance [font-variation-settings:'opsz'_72]"
          : "ledger text-[1.75rem]/[1.15] [font-variation-settings:'opsz'_48]",
        className,
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}

/** Section and card titles. */
export function Title({ as: Tag = "h2", className, children, ...props }: { as?: "h2" | "h3" | "h1" | "div" | "p" } & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={cn("font-display text-lg/[1.3] font-medium text-balance", className)} {...props}>
      {children}
    </Tag>
  );
}

/** The folio corner of a sheet: "No. 0421". */
export function Folio({ prefix = "No.", value, className }: { prefix?: string; value: string; className?: string }) {
  return (
    <p className={cn("flex items-baseline gap-1.5", className)}>
      <Eyebrow as="span">{prefix}</Eyebrow>
      <span className="font-display ledger text-lg italic">{value}</span>
    </p>
  );
}

/** Order numbers, SKUs, references, tracking ids. */
export function Mono({ upper, className, children, ...props }: { upper?: boolean } & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn("font-mono text-[0.8125rem]", upper && "font-medium uppercase", className)} {...props}>
      {children}
    </span>
  );
}

/** An eyebrow row with an optional action on the right, for dividing a sheet or a form. */
export function SectionLabel({ children, action, className }: { children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <Eyebrow as="div">{children}</Eyebrow>
      {action ? <div className="flex items-center gap-1">{action}</div> : null}
    </div>
  );
}
