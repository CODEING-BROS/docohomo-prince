"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, Trash2, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { getTimeZone } from "@/lib/timezone";
import { ButtonSpinner } from "@/components/custom/loaders";
import { cn } from "@/lib/utils";

// Row checkboxes, "export" and "delete selected" for every admin table.
// The server decides what may really go: rows that are a record of money or of care are kept, and
// the answer says how many were kept and why.

/** Which rows are ticked. The selection is kept while moving between pages. */
export function useSelection(pageIds: number[]) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const toggle = useCallback((id: number) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const pageState = useMemo(() => {
    const ticked = pageIds.filter((id) => selected.has(id)).length;
    return ticked === 0 ? false : ticked === pageIds.length ? true : ("indeterminate" as const);
  }, [pageIds, selected]);

  /** Ticks every row on this page, or unticks them if they all are already. */
  const togglePage = useCallback(() => {
    setSelected((current) => {
      const next = new Set(current);
      const allTicked = pageIds.length > 0 && pageIds.every((id) => next.has(id));
      pageIds.forEach((id) => (allTicked ? next.delete(id) : next.add(id)));
      return next;
    });
  }, [pageIds]);

  const clear = useCallback(() => setSelected(new Set()), []);

  return { ids: [...selected], count: selected.size, has: (id: number) => selected.has(id), toggle, togglePage, pageState, clear };
}

export type Selection = ReturnType<typeof useSelection>;

/** Header checkbox: selects or clears the whole page. */
export function SelectPage({ selection, noun }: { selection: Selection; noun: string }) {
  return <Checkbox aria-label={`Select all ${noun} on this page`} checked={selection.pageState} onCheckedChange={selection.togglePage} />;
}

/** "Select all" with its words, for lists that are cards and have no header row. */
export function SelectAll({ selection, noun, className }: { selection: Selection; noun: string; className?: string }) {
  return (
    <label className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}>
      <SelectPage selection={selection} noun={noun} /> Select all
    </label>
  );
}

/** Row checkbox. Clicking it does not open the row. */
export function SelectRow({ selection, id, label }: { selection: Selection; id: number; label: string }) {
  return (
    <span onClick={(event) => event.stopPropagation()} className="flex items-center">
      <Checkbox aria-label={`Select ${label}`} checked={selection.has(id)} onCheckedChange={() => selection.toggle(id)} />
    </span>
  );
}

type Query = Record<string, string | number | undefined | null>;

const download = (table: string, query: Query) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...query, tz: getTimeZone() })) {
    if (value !== undefined && value !== null && value !== "" && key !== "page" && key !== "pageSize") params.set(key, String(value));
  }
  const link = document.createElement("a");
  link.href = `/api/admin/${table}/export?${params}`;
  link.download = "";
  document.body.appendChild(link);
  link.click();
  link.remove();
};

/**
 * Sits in a table's toolbar. With nothing ticked it offers "Export" for everything the filters
 * match; with rows ticked it offers export and delete for just those rows.
 */
export function BulkActions({
  table, noun, selection, filters = {}, refresh = [], deleteNote, exportable = true, deletable = true, onDeleted, className,
}: {
  table: string; // path under /api/admin: "orders", "discounts/rules", "streams/4/questions"…
  noun: string; // "orders", "products"…
  selection: Pick<Selection, "ids" | "count" | "clear">;
  filters?: Query;
  refresh?: string[]; // query keys to reload after a delete
  deleteNote?: string; // extra line in the confirmation
  exportable?: boolean; // false where the table has no spreadsheet export
  deletable?: boolean; // false where rows are records that are never removed
  onDeleted?: () => void;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const remove = useMutation({
    mutationFn: () => api<{ deleted: number; skipped: number; reason?: string }>(`/admin/${table}/bulk-delete`, { method: "POST", body: { ids: selection.ids } }),
    onSuccess: (result) => {
      if (result.deleted) toast.success(`Deleted ${formatNumber(result.deleted)} ${noun}`);
      if (result.skipped) toast.warning(`${formatNumber(result.skipped)} not deleted. ${result.reason ?? ""}`.trim());
      setConfirming(false);
      selection.clear();
      refresh.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
      onDeleted?.();
    },
    onError: (err) => toast.error(err.message),
  });

  if (selection.count === 0) {
    if (!exportable) return null;
    return (
      <Button variant="outline" className={cn("ml-auto h-9", className)} onClick={() => download(table, filters)}>
        <Download /> Export
      </Button>
    );
  }

  return (
    <div className={cn("ml-auto flex flex-wrap items-center gap-2", className)}>
      <span className="text-sm font-medium ledger">{formatNumber(selection.count)} selected</span>
      {exportable ? (
        <Button variant="outline" className="h-9" onClick={() => download(table, { ids: selection.ids.join(",") })}>
          <Download /> Export selected
        </Button>
      ) : null}
      {deletable ? (
        <Button variant="destructive" className="h-9" onClick={() => setConfirming(true)}>
          <Trash2 /> Delete
        </Button>
      ) : null}
      <Button variant="ghost" size="icon" aria-label="Clear selection" onClick={selection.clear}>
        <X />
      </Button>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {formatNumber(selection.count)} {noun}?</DialogTitle>
            <DialogDescription>
              This cannot be undone. {deleteNote} {exportable ? "Consider exporting them first if you may need the details later." : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>Cancel</Button>
            <Button variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>
              {remove.isPending ? <ButtonSpinner /> : null}Delete {formatNumber(selection.count)} {noun}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
