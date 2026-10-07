"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, ChevronsDownUp, ChevronsUpDown, FolderTree, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BulkActions, SelectPage, SelectRow, useSelection } from "@/components/admin/bulk";
import { Combobox } from "@/components/admin/combobox";
import { ImageField } from "@/components/admin/image-field";
import { EmptyState, PageHeader, PaginationBar, StatusBadge, Thumb } from "@/components/admin/parts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { formatNumber, titleCase } from "@/lib/format";
import type { CategoryRow } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SectionCard } from "@/components/custom/section-card";
import { ButtonSpinner } from "@/components/custom/loaders";

/** A category with what the table needs worked out: its level, where it sits, and its totals. */
type Row = CategoryRow & { depth: number; path: string[]; ancestorIds: number[]; childIds: number[]; totalProducts: number };
type Draft = { id: number | null; parentId: string; name: string; imageUrl: string; isActive: boolean };

const LEVEL = ["Main category", "Category", "Subcategory"];

const prepare = (items: CategoryRow[]): Row[] => {
  const byId = new Map(items.map((c) => [c.id, c]));
  const children = new Map<number, number[]>();
  for (const c of items) if (c.parentId) children.set(c.parentId, [...(children.get(c.parentId) ?? []), c.id]);

  const chainOf = (c: CategoryRow) => {
    const path = [c.name];
    const ancestorIds: number[] = [];
    for (let parent = c.parentId ? byId.get(c.parentId) : undefined; parent; parent = parent.parentId ? byId.get(parent.parentId) : undefined) {
      path.unshift(parent.name);
      ancestorIds.unshift(parent.id);
    }
    return { path, ancestorIds };
  };
  const totalOf = (id: number): number =>
    (byId.get(id)?.productCount ?? 0) + (children.get(id) ?? []).reduce((sum, child) => sum + totalOf(child), 0);

  return items
    .map((c) => {
      const { path, ancestorIds } = chainOf(c);
      return { ...c, path, ancestorIds, depth: path.length - 1, childIds: children.get(c.id) ?? [], totalProducts: totalOf(c.id) };
    })
    // parents first, each followed by what is inside it
    .sort((a, b) => a.path.join("\u0000").toLowerCase().localeCompare(b.path.join("\u0000").toLowerCase()));
};

export default function CategoriesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState("all");
  const [mainId, setMainId] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [expanded, setExpanded] = useState<Set<number>>(new Set()); // parents whose contents are showing
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);

  const { data, isPending, isError } = useQuery({ queryKey: ["categories"], queryFn: () => api<{ items: CategoryRow[] }>("/admin/categories") });
  const rows = useMemo(() => prepare(data?.items ?? []), [data]);
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  const text = search.trim().toLowerCase();
  const mainName = mainId ? byId.get(Number(mainId))?.name : undefined;
  const filtered = useMemo(
    () => rows.filter((r) =>
      (!text || r.name.toLowerCase().includes(text)) &&
      (level === "all" || r.depth === Number(level)) &&
      (!mainName || r.path[0] === mainName)),
    [rows, text, level, mainName],
  );
  const filtering = Boolean(text) || level !== "all" || Boolean(mainId);

  // while searching or filtering every match is listed; otherwise a row shows only if all its parents are open
  const visible = useMemo(
    () => (filtering ? filtered : filtered.filter((r) => r.ancestorIds.every((id) => expanded.has(id)))),
    [filtering, filtered, expanded],
  );
  const parentIds = useMemo(() => rows.filter((r) => r.childIds.length).map((r) => r.id), [rows]);
  const allOpen = parentIds.length > 0 && parentIds.every((id) => expanded.has(id));
  const toggle = (id: number) =>
    setExpanded((open) => {
      const next = new Set(open);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const counts = [0, 1, 2].map((depth) => rows.filter((r) => r.depth === depth).length);

  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const current = Math.min(page, pageCount);
  const shown = visible.slice((current - 1) * pageSize, current * pageSize);
  const selection = useSelection(shown.map((r) => r.id));

  const mainOptions = useMemo(() => rows.filter((r) => r.depth === 0).map((r) => ({ value: String(r.id), label: titleCase(r.name) })), [rows]);
  // a new category can go at the top, or inside any main category or category
  const parentOptions = useMemo(
    () => rows.filter((r) => r.depth < 2).map((r) => ({
      value: String(r.id),
      label: titleCase(r.name),
      hint: r.depth === 0 ? "Main category" : `in ${titleCase(r.path[0])}`,
    })),
    [rows],
  );

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["categories"] });
    queryClient.invalidateQueries({ queryKey: ["product-lookups"] });
  };
  const resetPage = () => setPage(1);

  const save = useMutation({
    mutationFn: (d: Draft) =>
      api(d.id ? `/admin/categories/${d.id}` : "/admin/categories", {
        method: d.id ? "PATCH" : "POST",
        body: { name: d.name, imageUrl: d.imageUrl, isActive: d.isActive, ...(d.id ? {} : { parentId: d.parentId ? Number(d.parentId) : null }) },
      }),
    onSuccess: (_r, d) => {
      toast.success(d.id ? "Category updated" : "Category added");
      setDraft(null);
      refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: (row: Row) => api(`/admin/categories/${row.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Category deleted");
      setDeleting(null);
      refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  const add = (parentId = "") => setDraft({ id: null, parentId, name: "", imageUrl: "", isActive: true });
  const editing = draft?.id ? byId.get(draft.id) : undefined;
  const blockedReason = deleting
    ? deleting.childIds.length
      ? `It has ${deleting.childIds.length} categories inside. Delete those first.`
      : deleting.productCount
        ? `${deleting.productCount} products are in it. Move them first, or hide the category instead.`
        : null
    : null;

  return (
    <>
      <PageHeader
        title="Categories"
        description={`${formatNumber(rows.length)} in total: ${counts[0]} main categories, ${counts[1]} categories and ${counts[2]} subcategories. Click an arrow to open one.`}
      >
        <Button variant="outline" className="h-9" disabled={filtering} onClick={() => { setExpanded(allOpen ? new Set() : new Set(parentIds)); resetPage(); }}>
          {allOpen ? <ChevronsDownUp /> : <ChevronsUpDown />}
          {allOpen ? "Collapse all" : "Expand all"}
        </Button>
        <Button className="h-9" onClick={() => add()}><Plus /> Add category</Button>
      </PageHeader>

      <SectionCard flush>
        <div className="flex flex-wrap items-center gap-2 border-b border-foreground/18 bg-surface-2 px-3 py-2">
          <Input value={search} onChange={(e) => { setSearch(e.target.value); resetPage(); }} placeholder="Search categories" className="h-9 w-full sm:w-64" />
          <Select value={level} onValueChange={(v) => { setLevel(v); resetPage(); }}>
            <SelectTrigger className="h-9 w-44" aria-label="Level"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All levels</SelectItem>
              <SelectItem value="0">Main categories</SelectItem>
              <SelectItem value="1">Categories</SelectItem>
              <SelectItem value="2">Subcategories</SelectItem>
            </SelectContent>
          </Select>
          <Combobox value={mainId} onChange={(v) => { setMainId(v); resetPage(); }} options={mainOptions} allLabel="In any main category" searchPlaceholder="Search main categories…" className="w-52" />
          {filtering ? (
            <Button variant="ghost" className="h-9" onClick={() => { setSearch(""); setLevel("all"); setMainId(""); resetPage(); }}>Clear filters</Button>
          ) : null}
          <BulkActions
            table="categories" noun="categories" selection={selection}
            filters={filtering ? { ids: filtered.map((r) => r.id).join(",") } : {}}
            refresh={["categories", "product-lookups"]}
            deleteNote="Categories that still contain products or other categories are kept."
          />
        </div>

        {isError ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Could not load categories. Check that the backend is running.</p>
        ) : isPending ? (
          <div className="grid gap-2 p-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-11" />)}</div>
        ) : visible.length === 0 ? (
          <EmptyState icon={FolderTree} title="No categories match" description="Try a different search, or clear the filters." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 pl-4"><SelectPage selection={selection} noun="categories" /></TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Level</TableHead>
                <TableHead>Inside</TableHead>
                <TableHead className="text-right">Products</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-28 pr-4"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((row) => (
                <TableRow key={row.id} data-state={selection.has(row.id) ? "selected" : undefined}>
                  <TableCell className="pl-4"><SelectRow selection={selection} id={row.id} label={row.name} /></TableCell>
                  <TableCell>
                    {/* indented by level so the list still reads as a tree */}
                    <div className="flex items-center gap-2" style={{ paddingLeft: `${row.depth * 1.5}rem` }}>
                      {row.childIds.length && !filtering ? (
                        <button
                          type="button"
                          aria-expanded={expanded.has(row.id)}
                          aria-label={`${expanded.has(row.id) ? "Close" : "Open"} ${row.name}`}
                          onClick={() => toggle(row.id)}
                          className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <ChevronRight className={cn("size-4 transition-transform", expanded.has(row.id) && "rotate-90")} />
                        </button>
                      ) : (
                        <span className="size-6 shrink-0" />
                      )}
                      <span title={row.imageUrl ? undefined : row.fallbackImageUrl ? "No image uploaded yet. Showing a product photo from this category." : "No image uploaded yet"}>
                        <Thumb src={row.imageUrl ?? row.fallbackImageUrl} name={row.name} className="size-9" />
                      </span>
                      <div className="min-w-0">
                        <div className={cn("max-w-64 truncate", row.depth === 0 ? "font-semibold" : "font-medium")}>{titleCase(row.name)}</div>
                        {row.childIds.length ? <div className="text-xs text-muted-foreground">{row.childIds.length} inside</div> : null}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="outline" className="font-normal">{LEVEL[row.depth]}</Badge></TableCell>
                  <TableCell className="max-w-56 truncate text-muted-foreground">
                    {row.depth === 0 ? "—" : row.path.slice(0, -1).map(titleCase).join(" › ")}
                  </TableCell>
                  <TableCell className="text-right ledger">
                    {row.totalProducts ? (
                      <Link href={`/admin/products?categoryId=${row.id}`} className="text-primary hover:underline">{formatNumber(row.totalProducts)}</Link>
                    ) : "0"}
                  </TableCell>
                  <TableCell><StatusBadge status={row.isActive ? "ACTIVE" : "ARCHIVED"} label={row.isActive ? "Active" : "Hidden"} /></TableCell>
                  <TableCell className="pr-4 text-right">
                    {row.depth < 2 ? (
                      <Button variant="ghost" size="icon-sm" aria-label={`Add a category inside ${row.name}`} title="Add inside" onClick={() => add(String(row.id))}><Plus /></Button>
                    ) : null}
                    <Button
                      variant="ghost" size="icon-sm" aria-label={`Edit ${row.name}`} title="Edit"
                      onClick={() => setDraft({ id: row.id, parentId: row.parentId ? String(row.parentId) : "", name: row.name, imageUrl: row.imageUrl ?? "", isActive: row.isActive })}
                    >
                      <Pencil />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Delete ${row.name}`} title="Delete" onClick={() => setDeleting(row)}><Trash2 /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {data ? (
          <PaginationBar
            page={current} pageCount={pageCount} pageSize={pageSize} total={visible.length} noun={filtering ? "matching categories" : "rows showing"}
            onPage={setPage} onPageSize={(size) => { setPageSize(size); resetPage(); }}
          />
        ) : null}
      </SectionCard>

      <Dialog open={draft !== null} onOpenChange={(isOpen) => !isOpen && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit category" : "Add category"}</DialogTitle>
            <DialogDescription>
              {editing
                ? editing.depth === 0 ? "A main category, at the top of the store menu." : `Inside ${editing.path.slice(0, -1).map(titleCase).join(" › ")}.`
                : "Leave “Inside” empty to make a main category, or pick where it belongs."}
            </DialogDescription>
          </DialogHeader>
          {draft ? (
            <form id="category-form" className="grid gap-4" onSubmit={(e) => { e.preventDefault(); save.mutate(draft); }}>
              <div className="grid gap-1.5">
                <Label htmlFor="category-name">Name</Label>
                <Input id="category-name" required autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>
              {draft.id ? null : (
                <div className="grid gap-1.5">
                  <Label>Inside</Label>
                  <Combobox
                    value={draft.parentId} onChange={(parentId) => setDraft({ ...draft, parentId })} options={parentOptions}
                    allLabel="Nothing (make it a main category)" searchPlaceholder="Search categories…" className="w-full"
                  />
                </div>
              )}
              <ImageField label="Image" folder="categories" value={draft.imageUrl} onChange={(imageUrl) => setDraft({ ...draft, imageUrl })} />
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={draft.isActive} onCheckedChange={(checked) => setDraft({ ...draft, isActive: checked === true })} />
                Show on the store
              </label>
            </form>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
            <Button type="submit" form="category-form" loading={save.isPending}>{draft?.id ? "Save changes" : "Add category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(isOpen) => !isOpen && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleting ? titleCase(deleting.name) : ""}?</DialogTitle>
            <DialogDescription>{blockedReason ? `This category cannot be deleted yet. ${blockedReason}` : "This cannot be undone."}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="destructive" disabled={!deleting || Boolean(blockedReason) || remove.isPending} onClick={() => deleting && remove.mutate(deleting)}>
              {remove.isPending ? <ButtonSpinner /> : null}Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
