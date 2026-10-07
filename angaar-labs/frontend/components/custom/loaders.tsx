import { Skeleton } from "@/components/ui/skeleton";
import { Spinner as UiSpinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

// Spinners and skeletons shaped like the real thing, so content lands without a jump.

const SPINNER_SIZE = { xs: "size-3", sm: "size-4", md: "size-5", lg: "size-7" };

export function Spinner({ size = "sm", label = "Loading", className }: { size?: keyof typeof SPINNER_SIZE; label?: string; className?: string }) {
  return <UiSpinner aria-label={label} className={cn(SPINNER_SIZE[size], className)} />;
}

/** Drop-in for `{isPending ? <Loader2 className="animate-spin" /> : null}` inside a button. */
export function ButtonSpinner({ className }: { className?: string }) {
  return <UiSpinner data-icon="inline-start" className={cn("size-3.5", className)} />;
}

const Bar = ({ className }: { className?: string }) => <Skeleton className={cn("h-3 rounded-sm bg-surface-3", className)} />;

export function TableSkeleton({ rows = 8, cols = 5, dense }: { rows?: number; cols?: number; dense?: boolean }) {
  const widths = ["w-[40%]", "w-[25%]", "w-[15%]", "w-[20%]", "w-[12%]", "w-[18%]"];
  return (
    <div role="status" aria-label="Loading" className="w-full">
      <div className="flex h-9 items-center gap-4 border-b border-foreground/18 bg-surface-3 px-4">
        {Array.from({ length: cols }, (_, i) => <Bar key={i} className={cn("h-2", widths[i % widths.length])} />)}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className={cn("flex items-center gap-4 border-b border-foreground/10 px-4", dense ? "h-8" : "h-10")}>
          {Array.from({ length: cols }, (_, c) => <Bar key={c} className={widths[(c + r) % widths.length]} />)}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={cn("rounded-xl border bg-card p-4", className)}>
      <Bar className="mb-4 h-4 w-1/3" />
      {Array.from({ length: lines }, (_, i) => <Bar key={i} className={cn("mb-2.5", i % 3 === 2 ? "w-2/3" : "w-full")} />)}
    </div>
  );
}

export function StatSkeleton({ className }: { className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={cn("rounded-xl border bg-card p-4", className)}>
      <Bar className="h-2 w-1/3" />
      <div className="my-3 border-t border-foreground/10" />
      <Skeleton className="h-8 w-1/2 rounded-sm bg-surface-3" />
      <Skeleton className="mt-3 h-5 w-16 rounded-full bg-surface-3" />
    </div>
  );
}

export function ListSkeleton({ rows = 5, avatar, className }: { rows?: number; avatar?: boolean; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={cn("divide-y divide-foreground/10", className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 py-3">
          {avatar ? <Skeleton className="size-9 shrink-0 rounded-full bg-surface-3" /> : null}
          <div className="flex-1 space-y-2">
            <Bar className="w-1/2" />
            <Bar className="h-2 w-1/3" />
          </div>
          <Bar className="w-12" />
        </div>
      ))}
    </div>
  );
}

export function FormSkeleton({ fields = 4, className }: { fields?: number; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={cn("space-y-5", className)}>
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="space-y-2">
          <Bar className="h-2.5 w-24" />
          <Skeleton className="h-9 w-full rounded-lg bg-surface-3" />
        </div>
      ))}
    </div>
  );
}

export function ProductGridSkeleton({ count = 8, className }: { count?: number; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4", className)}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-xl border bg-card p-3">
          <Skeleton className="aspect-square w-full rounded-lg bg-surface-3" />
          <Bar className="mt-3 w-3/4" />
          <Bar className="mt-2 h-2 w-1/2" />
          <Skeleton className="mt-3 h-5 w-20 rounded-sm bg-surface-3" />
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton({ hero = true, stats = 4, table = true }: { hero?: boolean; stats?: number; table?: boolean }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-5">
      {hero ? (
        <div className="border-b-[3px] border-double border-foreground/30 pb-4">
          <Bar className="h-2 w-32" />
          <Skeleton className="mt-3 h-9 w-64 rounded-sm bg-surface-3" />
        </div>
      ) : null}
      {stats ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: stats }, (_, i) => <StatSkeleton key={i} />)}</div> : null}
      {table ? <div className="overflow-hidden rounded-xl border bg-card"><TableSkeleton /></div> : null}
    </div>
  );
}
