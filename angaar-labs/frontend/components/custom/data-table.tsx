"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableHead, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState } from "./empty-state";
import { Shortcut } from "./kbd";
import { TableSkeleton } from "./loaders";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

// The shell around every list: one place for loading, failed, empty and stale, eyebrow column
// heads, rows that open on click or Enter, and a pagination bar whose controls all match.

export function DataTable({ isPending, isError, isEmpty, onRetry, empty, skeletonRows = 8, skeletonCols = 5, dense, isStale, className, children }: {
  isPending: boolean; isError: boolean; isEmpty: boolean; onRetry?: () => void; empty: React.ComponentProps<typeof EmptyState>;
  skeletonRows?: number; skeletonCols?: number; dense?: boolean; isStale?: boolean; className?: string; children: React.ReactNode;
}) {
  if (isError) return <EmptyState variant="error" title="Could not load this list" description="Check that the backend is running, then try again." onRetry={onRetry} />;
  if (isPending) return <TableSkeleton rows={skeletonRows} cols={skeletonCols} dense={dense} />;
  if (isEmpty) return <EmptyState {...empty} />;
  return (
    <div
      className={cn(
        "transition-opacity duration-150",
        isStale && "opacity-60",
        "[&_th]:h-9 [&_th]:bg-surface-3 [&_th]:text-[0.6875rem]/none [&_th]:font-semibold [&_th]:tracking-[0.12em] [&_th]:text-muted-foreground [&_th]:uppercase",
        "[&_tr]:border-foreground/10 [&_td]:py-0 [&_td]:text-[0.8125rem]/[1.4]",
        dense ? "[&_tbody_tr]:h-8" : "[&_tbody_tr]:h-10 patient:[&_tbody_tr]:h-12",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** The strip above the table: search on the left, filters, actions on the right. */
export function DataTableToolbar({ search, filters, actions, hasFilters, onClear, className }: { search?: React.ReactNode; filters?: React.ReactNode; actions?: React.ReactNode; hasFilters?: boolean; onClear?: () => void; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2 border-b border-foreground/18 bg-surface-2 px-3 py-2", className)}>
      {search ? <div className="w-full min-w-48 sm:w-64">{search}</div> : null}
      {filters}
      {hasFilters && onClear ? (
        <Button variant="ghost" size="sm" onClick={onClear} className="text-muted-foreground"><X data-icon="inline-start" /> Clear filters</Button>
      ) : null}
      {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

const INTERACTIVE = "a,button,input,select,textarea,label,[role=menuitem],[role=checkbox],[role=switch],[data-slot=dropdown-menu-content],[data-slot=popover-content]";

/** A row that opens something. Clicks on a button or link inside the row are left to that control. */
export function DataTableRow({ onOpen, href, selected, className, children, ...props }: { onOpen?: () => void; href?: string; selected?: boolean } & React.ComponentProps<"tr">) {
  const router = useRouter();
  const open = () => (href ? router.push(href) : onOpen?.());
  const fromControl = (target: EventTarget | null, row: HTMLElement) => target instanceof Element && target.closest(INTERACTIVE) !== null && target.closest(INTERACTIVE) !== row;
  return (
    <TableRow
      data-clickable=""
      tabIndex={0}
      role={href ? "link" : "button"}
      aria-selected={selected}
      onClick={(e) => { if (!fromControl(e.target, e.currentTarget)) open(); }}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !fromControl(e.target, e.currentTarget)) { e.preventDefault(); open(); }
      }}
      className={cn(
        "transition-[box-shadow,background-color] duration-150 outline-none hover:bg-surface-3 hover:shadow-[inset_3px_0_0_var(--terracotta)] focus-visible:bg-surface-3 focus-visible:shadow-[inset_3px_0_0_var(--terracotta)]",
        selected && "bg-muted",
        className,
      )}
      {...props}
    >
      {children}
    </TableRow>
  );
}

export function ColHead({ align = "left", sortable, sorted, onSort, className, children, ...props }: { align?: "left" | "right" | "center"; sortable?: boolean; sorted?: "asc" | "desc" | null; onSort?: () => void } & React.ComponentProps<"th">) {
  const alignment = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <TableHead className={cn(alignment, align === "right" && "ledger", className)} aria-sort={sorted ? (sorted === "asc" ? "ascending" : "descending") : undefined} {...props}>
      {sortable ? (
        <button type="button" onClick={onSort} className={cn("inline-flex items-center gap-1 rounded-sm uppercase hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none", sorted && "text-foreground")}>
          {children}
          {sorted === "asc" ? <ArrowUp className="size-3" /> : sorted === "desc" ? <ArrowDown className="size-3" /> : <ArrowUpDown className="size-3 opacity-50" />}
        </button>
      ) : children}
    </TableHead>
  );
}

export const PAGE_SIZES = [20, 50, 100, 250, 500, 1000, 2000];

export function PaginationBar({ page, pageCount, pageSize, total, noun, onPage, onPageSize, sizes = PAGE_SIZES, className }: {
  page: number; pageCount: number; pageSize: number; total: number; noun: string; onPage: (page: number) => void; onPageSize: (size: number) => void; sizes?: number[]; className?: string;
}) {
  const [typed, setTyped] = useState<string | null>(null);
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  const go = (next: number) => onPage(Math.max(1, Math.min(Math.max(1, pageCount), next)));
  const jump = (label: string, keys: string[], target: number, disabled: boolean, icon: React.ReactNode) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" size="icon-sm" aria-label={label} disabled={disabled} onClick={() => go(target)}>{icon}</Button>
      </TooltipTrigger>
      <TooltipContent className="flex items-center gap-2">{label} <Shortcut keys={keys} size="xs" /></TooltipContent>
    </Tooltip>
  );
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3 border-t border-foreground/18 px-3 py-2 text-sm", className)}>
      <p className="ledger text-muted-foreground">
        {total === 0 ? `No ${noun}` : `${formatNumber(first)}–${formatNumber(last)} of ${formatNumber(total)} ${noun}`}
      </p>
      <div className="flex items-center gap-1.5">
        <Select value={String(pageSize)} onValueChange={(v) => onPageSize(Number(v))}>
          <SelectTrigger size="sm" className="w-32" aria-label="Rows per page"><SelectValue /></SelectTrigger>
          <SelectContent align="end">
            {sizes.map((size) => <SelectItem key={size} value={String(size)}>{size} per page</SelectItem>)}
          </SelectContent>
        </Select>
        {jump("First page", ["Home"], 1, page <= 1, <ChevronsLeft />)}
        {jump("Previous page", ["←"], page - 1, page <= 1, <ChevronLeft />)}
        <span className="ledger flex items-center gap-1 text-muted-foreground">
          <Input
            aria-label="Page number"
            value={typed ?? String(page)}
            onChange={(e) => setTyped(e.target.value.replace(/\D/g, ""))}
            onBlur={() => { if (typed) go(Number(typed)); setTyped(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") { if (typed) go(Number(typed)); setTyped(null); } }}
            className="h-7 w-12 px-1 text-center text-sm"
          />
          / {Math.max(1, pageCount)}
        </span>
        {jump("Next page", ["→"], page + 1, page >= pageCount, <ChevronRight />)}
        {jump("Last page", ["End"], pageCount, page >= pageCount, <ChevronsRight />)}
      </div>
    </div>
  );
}
