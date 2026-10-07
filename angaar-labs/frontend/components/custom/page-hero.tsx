import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Display, Eyebrow } from "./typography";
import { cn } from "@/lib/utils";

// The top of every page: a folio eyebrow, the title in the display serif, actions on the right,
// closed by a double rule. tone="ink" turns it into the green band used on dashboards; with `overlap`
// the block that follows must be `relative` so it paints over the band.

export function PageHero({
  eyebrow, title, description, backHref, avatar, meta, actions, tone = "paper", as = "h1", overlap, className, children,
}: {
  eyebrow?: React.ReactNode; title: React.ReactNode; description?: React.ReactNode; backHref?: string; avatar?: React.ReactNode; meta?: React.ReactNode; actions?: React.ReactNode;
  tone?: "paper" | "ink"; as?: "h1" | "h2"; overlap?: boolean; className?: string; children?: React.ReactNode;
}) {
  const ink = tone === "ink";
  return (
    <header
      className={cn(
        "mb-5",
        ink ? cn("grain rounded-xl bg-(image:--gradient-brand) p-6 text-paper md:p-8", overlap && "-mb-6 pb-12") : "border-b-[3px] border-double border-foreground/30 pb-4",
        className,
      )}
    >
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 items-center gap-4">
          {backHref ? (
            <Button asChild variant="ghost" size="icon-lg" aria-label="Back" className={cn("-ml-2 shrink-0", ink && "text-paper hover:bg-paper/10 hover:text-paper")}>
              <Link href={backHref}><ArrowLeft /></Link>
            </Button>
          ) : null}
          {avatar ? <div className="shrink-0">{avatar}</div> : null}
          <div className="min-w-0">
            {eyebrow ? <Eyebrow className={cn("mb-1.5", ink && "text-paper/70")}>{eyebrow}</Eyebrow> : null}
            <Display level={1} as={as} className={cn(ink && "text-paper")}>{title}</Display>
            {description ? <p className={cn("mt-1.5 max-w-prose text-sm text-pretty", ink ? "text-paper/75" : "text-muted-foreground")}>{description}</p> : null}
            {meta ? <div className={cn("mt-2.5 flex flex-wrap items-center gap-2", ink && "[&_[data-slot=badge]]:bg-paper/15")}>{meta}</div> : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children ? <div className="mt-4 flex flex-wrap items-center gap-2 text-foreground">{children}</div> : null}
    </header>
  );
}
