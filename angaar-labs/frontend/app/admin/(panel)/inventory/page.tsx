"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, Download, History, X } from "lucide-react";
import { Suspense, useMemo, useState } from "react";
import { toast } from "sonner";
import { SelectPage, SelectRow, useSelection } from "@/components/admin/bulk";
import { Combobox } from "@/components/admin/combobox";
import { EmptyState, PageHeader, PaginationBar, SearchInput, StatusBadge, Thumb } from "@/components/admin/parts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useUrlState } from "@/hooks/use-url-state";
import { api } from "@/lib/api";
import { formatDateTime, formatNumber, humanize, titleCase } from "@/lib/format";
import type { Lookups, Paged } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SectionCard } from "@/components/custom/section-card";

type StockState = "in" | "low" | "out";

/** One sellable pack of a product and how many are on the shelf. */
type InventoryRow = {
  id: number; productId: number; productName: string; productStatus: string; title: string; sku: string;
  brand: { id: number; name: string } | null; imageUrl: string | null;
  stockQuantity: number; lowStockThreshold: number; state: StockState;
};
type InventoryList = Paged<InventoryRow> & { summary: { units: number; low: number; out: number } };

type Movement = { id: number; type: string; quantity: number; balanceAfter: number; note: string | null; createdAt: string };
type MovementList = {
  variant: { id: number; sku: string; title: string; productName: string; stockQuantity: number; lowStockThreshold: number };
  items: Movement[];
};

type Mode = "add" | "remove" | "set";
type Reason = "PURCHASE" | "RETURN" | "DAMAGE" | "EXPIRED" | "ADJUSTMENT";
type AdjustResult = { id: number; stockQuantity: number; lowStockThreshold: number; moved: number; limitChanged: boolean };

const STATE: Record<StockState, { label: string; tone: string }> = {
  in: { label: "In stock", tone: "ACTIVE" },
  low: { label: "Running low", tone: "PENDING" },
  out: { label: "Out of stock", tone: "CANCELLED" },
};

const MODES: { value: Mode; label: string; quantityLabel: string; reason: Reason }[] = [
  { value: "add", label: "Add stock", quantityLabel: "How many to add", reason: "PURCHASE" },
  { value: "remove", label: "Remove stock", quantityLabel: "How many to remove", reason: "DAMAGE" },
  { value: "set", label: "Set exact quantity", quantityLabel: "New quantity on hand", reason: "ADJUSTMENT" },
];

const REASONS: { value: Reason; label: string }[] = [
  { value: "PURCHASE", label: "Purchase" },
  { value: "RETURN", label: "Return" },
  { value: "DAMAGE", label: "Damage" },
  { value: "EXPIRED", label: "Expired" },
  { value: "ADJUSTMENT", label: "Correction" },
];

const MOVEMENT_LABEL: Record<string, string> = {
  OPENING: "Opening stock", PURCHASE: "Purchase", SALE: "Sale", RETURN: "Return",
  ADJUSTMENT: "Correction", DAMAGE: "Damage", EXPIRED: "Expired",
};

const describe = (row: { productName: string; title: string; sku: string }) =>
  [titleCase(row.productName), row.title, row.sku].filter(Boolean).join(" · ");

/** A whole number of zero or more, or null when the box is empty or holds something else. */
const wholeNumber = (text: string) => (/^\d{1,7}$/.test(text.trim()) ? Number(text.trim()) : null);

type Query = Record<string, string | number | undefined | null>;

// Stock is never deleted from this page, so it has its own export button instead of the shared bulk actions.
const download = (query: Query) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "" && key !== "page" && key !== "pageSize") params.set(key, String(value));
  }
  const link = document.createElement("a");
  link.href = `/api/admin/inventory/export?${params}`;
  link.download = "";
  document.body.appendChild(link);
  link.click();
  link.remove();
};

function AdjustDialog({ row, onClose }: { row: InventoryRow; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>("add");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState<Reason>("PURCHASE");
  const [note, setNote] = useState("");
  const [limit, setLimit] = useState(String(row.lowStockThreshold));

  const current = MODES.find((m) => m.value === mode)!;
  const before = row.stockQuantity;
  const amount = wholeNumber(quantity);
  const after = amount === null ? before : mode === "add" ? before + amount : mode === "remove" ? before - amount : amount;
  const newLimit = wholeNumber(limit);

  const quantityError =
    quantity.trim() === "" ? null
    : amount === null ? "Enter a whole number, like 12."
    : mode !== "set" && amount === 0 ? "Enter 1 or more."
    : after < 0 ? `Only ${formatNumber(before)} in stock, so you cannot remove ${formatNumber(amount)}.`
    : null;
  const limitError = newLimit === null ? "Enter a whole number, 0 or more." : null;
  const stockChanges = amount !== null && !quantityError && after !== before;
  const limitChanges = newLimit !== null && newLimit !== row.lowStockThreshold;

  const save = useMutation({
    mutationFn: () =>
      api<AdjustResult>(`/admin/inventory/${row.id}/adjust`, {
        method: "POST",
        body: {
          ...(stockChanges ? { change: { mode, quantity: amount, reason, note } } : {}),
          ...(limitChanges ? { lowStockThreshold: newLimit } : {}),
        },
      }),
    onSuccess: (result) => {
      toast.success(result.moved !== 0 ? `Stock is now ${formatNumber(result.stockQuantity)}` : "Low-stock limit updated");
      ["inventory", "inventory-history", "products", "product", "dashboard", "notifications"].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
          <DialogDescription>{describe(row)}</DialogDescription>
        </DialogHeader>

        <form id="adjust-form" className="grid gap-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
            <span className="text-muted-foreground">In stock now</span>
            <span className="text-base font-semibold ledger">{formatNumber(before)}</span>
          </div>

          <div className="grid gap-1.5">
            <Label id="adjust-mode">What do you want to do?</Label>
            <div role="radiogroup" aria-labelledby="adjust-mode" className="grid grid-cols-3 gap-1.5">
              {MODES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={mode === option.value}
                  onClick={() => { setMode(option.value); setReason(option.reason); }}
                  className={cn(
                    "min-h-9 rounded-md border px-2 py-1 text-sm leading-tight transition-colors",
                    mode === option.value ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-surface-2",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="adjust-quantity">{current.quantityLabel}</Label>
              <Input
                id="adjust-quantity" inputMode="numeric" autoFocus autoComplete="off" value={quantity}
                aria-invalid={quantityError ? true : undefined}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="adjust-reason">Reason</Label>
              <Select value={reason} onValueChange={(v) => setReason(v as Reason)}>
                <SelectTrigger id="adjust-reason" className="h-9 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REASONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {quantityError ? (
            <p className="-mt-2 text-sm text-destructive">{quantityError}</p>
          ) : stockChanges ? (
            <p className="-mt-2 text-sm text-muted-foreground">
              Stock will go from {formatNumber(before)} to <span className="font-medium text-foreground">{formatNumber(after)}</span>.
            </p>
          ) : amount !== null ? (
            <p className="-mt-2 text-sm text-muted-foreground">Stock is already {formatNumber(before)}, so nothing will change.</p>
          ) : null}

          <div className="grid gap-1.5">
            <Label htmlFor="adjust-note">Note (optional)</Label>
            <Textarea id="adjust-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: supplier bill number, or what was damaged" />
          </div>

          <div className="grid gap-1.5 border-t pt-4">
            <Label htmlFor="adjust-limit">Low-stock limit</Label>
            <Input
              id="adjust-limit" inputMode="numeric" autoComplete="off" className="sm:w-32" value={limit}
              aria-invalid={limitError ? true : undefined}
              onChange={(e) => setLimit(e.target.value)}
            />
            <p className={cn("text-xs", limitError ? "text-destructive" : "text-muted-foreground")}>
              {limitError ?? "This variant is marked as running low when its stock is at or under this number."}
            </p>
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="adjust-form" loading={save.isPending} disabled={Boolean(quantityError) || Boolean(limitError) || (!stockChanges && !limitChanges)}>Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistoryPanel({ row, onClose }: { row: InventoryRow | null; onClose: () => void }) {
  const { data, isPending, isError } = useQuery({
    queryKey: ["inventory-history", row?.id],
    queryFn: () => api<MovementList>(`/admin/inventory/${row?.id}/movements`),
    enabled: row !== null,
  });

  return (
    <Sheet open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-xl">
        <SheetHeader className="border-b">
          <SheetTitle className="pr-6 leading-snug">Stock history</SheetTitle>
          <SheetDescription>{row ? describe(row) : ""}</SheetDescription>
        </SheetHeader>

        {isError ? (
          <p className="px-4 py-16 text-center text-sm text-muted-foreground">Could not load the history. Close this panel and try again.</p>
        ) : isPending || !data ? (
          <div className="grid gap-3 p-4"><Skeleton className="h-16" /><Skeleton className="h-40" /></div>
        ) : (
          <div className="grid gap-4 p-4 text-sm">
            <dl className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-surface-2 p-3">
                <dt className="text-xs text-muted-foreground">In stock now</dt>
                <dd className="mt-0.5 text-lg font-semibold ledger">{formatNumber(data.variant.stockQuantity)}</dd>
              </div>
              <div className="rounded-lg bg-surface-2 p-3">
                <dt className="text-xs text-muted-foreground">Low-stock limit</dt>
                <dd className="mt-0.5 text-lg font-semibold ledger">{formatNumber(data.variant.lowStockThreshold)}</dd>
              </div>
            </dl>

            {data.items.length === 0 ? (
              <EmptyState icon={History} title="No stock changes yet" description="Every time stock is added, removed or sold, it is listed here." />
            ) : (
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Change</TableHead>
                      <TableHead className="text-right">Balance after</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.map((movement) => (
                      <TableRow key={movement.id}>
                        <TableCell className="align-top whitespace-normal text-muted-foreground">{formatDateTime(movement.createdAt)}</TableCell>
                        <TableCell className="max-w-48 align-top whitespace-normal">
                          <div className="font-medium">{MOVEMENT_LABEL[movement.type] ?? humanize(movement.type)}</div>
                          {movement.note ? <div className="text-xs break-words text-muted-foreground">{movement.note}</div> : null}
                        </TableCell>
                        <TableCell className={cn("text-right align-top font-medium ledger", movement.quantity > 0 ? "text-success" : movement.quantity < 0 ? "text-destructive" : "")}>
                          {movement.quantity > 0 ? "+" : movement.quantity < 0 ? "−" : ""}{formatNumber(Math.abs(movement.quantity))}
                        </TableCell>
                        <TableCell className="text-right align-top ledger">{formatNumber(movement.balanceAfter)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {data.items.length >= 200 ? <p className="text-xs text-muted-foreground">Showing the latest 200 changes.</p> : null}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function InventoryView() {
  const url = useUrlState();
  const [adjusting, setAdjusting] = useState<InventoryRow | null>(null);
  const [history, setHistory] = useState<InventoryRow | null>(null);

  const filters = {
    q: url.get("q"), brandId: url.get("brandId"), stock: url.get("stock"),
    page: url.get("page") || "1", pageSize: url.get("pageSize") || "20",
  };
  const { data, isPending, isError } = useQuery({
    queryKey: ["inventory", filters],
    queryFn: () => api<InventoryList>("/admin/inventory", { query: filters }),
    placeholderData: (previous) => previous,
  });
  const { data: lookups } = useQuery({
    queryKey: ["product-lookups"],
    queryFn: () => api<Lookups>("/admin/products/lookups"),
    staleTime: 5 * 60_000,
  });

  const selection = useSelection((data?.items ?? []).map((row) => row.id));
  const brandOptions = useMemo(
    () => (lookups?.brands ?? []).map((b) => ({ value: String(b.id), label: titleCase(b.name) })),
    [lookups],
  );

  // the cards follow the search and the brand, so they describe the same products as the table
  const summary = data?.summary;
  const cards: { label: string; value: number | undefined; hint: string; stock?: StockState }[] = [
    { label: "Units in stock", value: summary?.units, hint: filters.q || filters.brandId ? "In the products you searched for" : "Added up across every variant" },
    { label: "Running low", value: summary?.low, hint: "Variants at or under their limit", stock: "low" },
    { label: "Out of stock", value: summary?.out, hint: "Variants with nothing left", stock: "out" },
  ];

  return (
    <>
      <PageHeader title="Inventory" description="How many of each pack size you have on the shelf" />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardContent className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">{card.label}</p>
                {card.value === undefined ? (
                  <Skeleton className="mt-1 h-8 w-20" />
                ) : (
                  <p className="mt-1 text-2xl font-semibold tracking-tight ledger">{formatNumber(card.value)}</p>
                )}
                <p className="mt-1 truncate text-xs text-muted-foreground">{card.hint}</p>
              </div>
              {card.stock && card.value ? (
                <Button
                  variant={filters.stock === card.stock ? "secondary" : "outline"} size="sm"
                  onClick={() => url.set({ stock: filters.stock === card.stock ? "" : card.stock })}
                >
                  {filters.stock === card.stock ? "Show all" : "Show these"}
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>

      <SectionCard flush>
        <div className="flex flex-wrap items-center gap-2 border-b border-foreground/18 bg-surface-2 px-3 py-2">
          <SearchInput value={filters.q} onChange={(q) => url.set({ q })} placeholder="Product name or SKU" className="w-full sm:w-64" />
          <Combobox value={filters.brandId} onChange={(brandId) => url.set({ brandId })} options={brandOptions} allLabel="All brands" searchPlaceholder="Search brands…" className="w-44" />
          <Select value={filters.stock || "all"} onValueChange={(v) => url.set({ stock: v === "all" ? "" : v })}>
            <SelectTrigger className="h-9 w-36" aria-label="Stock"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any stock</SelectItem>
              <SelectItem value="in">In stock</SelectItem>
              <SelectItem value="low">Running low</SelectItem>
              <SelectItem value="out">Out of stock</SelectItem>
            </SelectContent>
          </Select>
          {url.hasAny ? <Button variant="ghost" className="h-9" onClick={url.clear}>Clear filters</Button> : null}

          {selection.count === 0 ? (
            <Button variant="outline" className="ml-auto h-9" onClick={() => download(filters)}>
              <Download /> Export
            </Button>
          ) : (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-sm font-medium ledger">{formatNumber(selection.count)} selected</span>
              <Button variant="outline" className="h-9" onClick={() => download({ ids: selection.ids.join(",") })}>
                <Download /> Export selected
              </Button>
              <Button variant="ghost" size="icon" aria-label="Clear selection" onClick={selection.clear}>
                <X />
              </Button>
            </div>
          )}
        </div>

        {isError ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Could not load the inventory. Check that the backend is running.</p>
        ) : isPending || !data ? (
          <div className="grid gap-2 p-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : data.items.length === 0 ? (
          <EmptyState icon={Boxes} title="Nothing matches" description="Try a different search, or clear the filters to see every variant." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 pl-4"><SelectPage selection={selection} noun="variants" /></TableHead>
                <TableHead>Product</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead className="text-right">Stock on hand</TableHead>
                <TableHead className="text-right">Low-stock limit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-4"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((row) => (
                <TableRow key={row.id} data-state={selection.has(row.id) ? "selected" : undefined}>
                  <TableCell className="pl-4"><SelectRow selection={selection} id={row.id} label={`${row.productName} ${row.title}`} /></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Thumb src={row.imageUrl} name={row.productName} />
                      <div className="min-w-0">
                        <div className="max-w-80 truncate font-medium">{titleCase(row.productName)}</div>
                        <div className="max-w-80 truncate text-xs text-muted-foreground">{row.title}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{row.sku}</TableCell>
                  <TableCell className="max-w-36 truncate">{row.brand ? titleCase(row.brand.name) : "—"}</TableCell>
                  <TableCell className="text-right font-medium ledger">{formatNumber(row.stockQuantity)}</TableCell>
                  <TableCell className="text-right text-muted-foreground ledger">{formatNumber(row.lowStockThreshold)}</TableCell>
                  <TableCell><StatusBadge status={STATE[row.state].tone} label={STATE[row.state].label} /></TableCell>
                  <TableCell className="pr-4">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="outline" size="sm" onClick={() => setAdjusting(row)}>Adjust stock</Button>
                      <Button variant="ghost" size="sm" onClick={() => setHistory(row)}><History /> History</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {data ? (
          <PaginationBar
            page={data.page} pageCount={data.pageCount} pageSize={data.pageSize} total={data.total} noun="variants"
            onPage={(page) => url.set({ page })} onPageSize={(pageSize) => url.set({ pageSize })}
          />
        ) : null}
      </SectionCard>

      {adjusting ? <AdjustDialog key={adjusting.id} row={adjusting} onClose={() => setAdjusting(null)} /> : null}
      <HistoryPanel row={history} onClose={() => setHistory(null)} />
    </>
  );
}

export default function InventoryPage() {
  return (
    <Suspense>
      <InventoryView />
    </Suspense>
  );
}
