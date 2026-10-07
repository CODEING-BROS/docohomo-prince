"use client";

import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import { PaginationBar } from "@/components/custom/data-table";
import { EmptyState as CustomEmptyState } from "@/components/custom/empty-state";
import { SearchField } from "@/components/custom/form-field";
import { PageHero } from "@/components/custom/page-hero";
import { StatCard as CustomStatCard } from "@/components/custom/stat-card";
import { StatusDot, StatusPill } from "@/components/custom/status-pill";
import { cn } from "@/lib/utils";

// The old shared admin pieces, now thin wrappers over components/custom with the same props,
// so pages can move over one at a time. New code should import from components/custom directly.

export function PageHeader({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return <PageHero title={title} description={description} actions={children} />;
}

export function StatCard({ label, value, change, icon, hint }: { label: string; value: string; change?: number | null; icon: LucideIcon; hint?: string }) {
  return <CustomStatCard label={label} value={value} change={change} icon={icon} hint={hint} note={change !== null && change !== undefined ? "vs previous period" : undefined} />;
}

export { StatusDot };

export function StatusBadge({ status, label, className }: { status: string; label?: string; className?: string }) {
  return <StatusPill status={status} label={label} className={className} />;
}

export function SearchInput(props: { value: string; onChange: (value: string) => void; placeholder: string; className?: string }) {
  return <SearchField {...props} />;
}

export { PaginationBar };

export function EmptyState({ icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return <CustomEmptyState icon={icon} title={title} description={description} />;
}

/** Small square image with a letter fallback, for product and brand rows. */
export function Thumb({ src, name, className }: { src: string | null; name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={cn("flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-card text-sm font-medium text-muted-foreground", className)}>
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote catalog images of unknown size
        <img src={src} alt="" loading="lazy" className="size-full object-cover" onError={() => setFailed(true)} />
      ) : (
        name.trim().charAt(0).toUpperCase()
      )}
    </span>
  );
}
