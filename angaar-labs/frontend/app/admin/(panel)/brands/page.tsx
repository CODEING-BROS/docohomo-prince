"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Tags, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BulkActions, SelectPage, SelectRow, useSelection } from "@/components/admin/bulk";
import { ImageField } from "@/components/admin/image-field";
import { EmptyState, PageHeader, PaginationBar, StatusBadge, Thumb } from "@/components/admin/parts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { formatNumber, titleCase } from "@/lib/format";
import type { BrandRow } from "@/lib/types";
import { SectionCard } from "@/components/custom/section-card";
import { ButtonSpinner } from "@/components/custom/loaders";

type Draft = { id: number | null; name: string; logoUrl: string; description: string; isActive: boolean };
const emptyDraft: Draft = { id: null, name: "", logoUrl: "", description: "", isActive: true };

export default function BrandsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<BrandRow | null>(null);

  const { data, isPending, isError } = useQuery({ queryKey: ["brands"], queryFn: () => api<{ items: BrandRow[] }>("/admin/brands") });
  const brands = useMemo(
    () => (data?.items ?? []).filter((b) => b.name.toLowerCase().includes(search.trim().toLowerCase())),
    [data, search],
  );
  // there are few brands, so they are all loaded and paged here
  const pageCount = Math.max(1, Math.ceil(brands.length / pageSize));
  const current = Math.min(page, pageCount);
  const shown = brands.slice((current - 1) * pageSize, current * pageSize);
  const selection = useSelection(shown.map((b) => b.id));

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["brands"] });
    queryClient.invalidateQueries({ queryKey: ["product-lookups"] });
  };

  const save = useMutation({
    mutationFn: (d: Draft) =>
      api(d.id ? `/admin/brands/${d.id}` : "/admin/brands", {
        method: d.id ? "PATCH" : "POST",
        body: { name: d.name, logoUrl: d.logoUrl, description: d.description, isActive: d.isActive },
      }),
    onSuccess: (_r, d) => {
      toast.success(d.id ? "Brand updated" : "Brand added");
      setDraft(null);
      refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: (brand: BrandRow) => api(`/admin/brands/${brand.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Brand deleted");
      setDeleting(null);
      refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <>
      <PageHeader title="Brands" description="The manufacturers your products belong to">
        <Button className="h-9" onClick={() => setDraft(emptyDraft)}><Plus /> Add brand</Button>
      </PageHeader>

      <SectionCard flush>
        <div className="flex flex-wrap items-center gap-2 border-b border-foreground/18 bg-surface-2 px-3 py-2">
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search brands"
            className="h-9 w-full sm:w-64"
          />
          <BulkActions table="brands" noun="brands" selection={selection} filters={{ q: search.trim() }} refresh={["brands", "product-lookups"]} deleteNote="Brands that still have products are kept." />
        </div>

        {isError ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Could not load brands. Check that the backend is running.</p>
        ) : isPending ? (
          <div className="grid gap-2 p-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-11" />)}</div>
        ) : brands.length === 0 ? (
          <EmptyState icon={Tags} title="No brands match" description="Try a different search, or add a new brand." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 pl-4"><SelectPage selection={selection} noun="brands" /></TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Web address</TableHead>
                <TableHead className="text-right">Products</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24 pr-4"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((brand) => (
                <TableRow key={brand.id} data-state={selection.has(brand.id) ? "selected" : undefined}>
                  <TableCell className="pl-4"><SelectRow selection={selection} id={brand.id} label={brand.name} /></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Thumb src={brand.logoUrl} name={brand.name} className="bg-card [&_img]:object-contain" />
                      <span className="font-medium">{titleCase(brand.name)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{brand.slug}</TableCell>
                  <TableCell className="text-right ledger">
                    {brand.productCount ? (
                      <Link href={`/admin/products?brandId=${brand.id}`} className="text-primary hover:underline">{formatNumber(brand.productCount)}</Link>
                    ) : "0"}
                  </TableCell>
                  <TableCell><StatusBadge status={brand.isActive ? "ACTIVE" : "ARCHIVED"} label={brand.isActive ? "Active" : "Hidden"} /></TableCell>
                  <TableCell className="pr-4 text-right">
                    <Button
                      variant="ghost" size="icon-sm" aria-label={`Edit ${brand.name}`}
                      onClick={() => setDraft({ id: brand.id, name: brand.name, logoUrl: brand.logoUrl ?? "", description: brand.description ?? "", isActive: brand.isActive })}
                    >
                      <Pencil />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Delete ${brand.name}`} onClick={() => setDeleting(brand)}>
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {data ? (
          <PaginationBar
            page={current} pageCount={pageCount} pageSize={pageSize} total={brands.length} noun="brands"
            onPage={setPage} onPageSize={(size) => { setPageSize(size); setPage(1); }}
          />
        ) : null}
      </SectionCard>

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit brand" : "Add brand"}</DialogTitle>
            <DialogDescription>Brands appear as a filter on the store and on every product.</DialogDescription>
          </DialogHeader>
          {draft ? (
            <form id="brand-form" className="grid gap-4" onSubmit={(e) => { e.preventDefault(); save.mutate(draft); }}>
              <div className="grid gap-1.5">
                <Label htmlFor="brand-name">Name</Label>
                <Input id="brand-name" required autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>
              <ImageField label="Logo" folder="brands" value={draft.logoUrl} onChange={(logoUrl) => setDraft({ ...draft, logoUrl })} />
              <div className="grid gap-1.5">
                <Label htmlFor="brand-description">Description</Label>
                <Textarea id="brand-description" rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={draft.isActive} onCheckedChange={(checked) => setDraft({ ...draft, isActive: checked === true })} />
                Show on the store
              </label>
            </form>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
            <Button type="submit" form="brand-form" loading={save.isPending}>{draft?.id ? "Save changes" : "Add brand"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleting ? titleCase(deleting.name) : ""}?</DialogTitle>
            <DialogDescription>
              {deleting?.productCount
                ? `${deleting.productCount} products use this brand, so it cannot be deleted. Hide it instead, or move those products first.`
                : "This cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="destructive" disabled={!deleting || deleting.productCount > 0 || remove.isPending} onClick={() => deleting && remove.mutate(deleting)}>
              {remove.isPending ? <ButtonSpinner /> : null}Delete brand
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
