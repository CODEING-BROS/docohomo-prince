"use client";

import { useQuery } from "@tanstack/react-query";
import { Pencil, Plus, Upload } from "lucide-react";
import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { BulkActions, SelectPage, SelectRow, useSelection } from "@/components/admin/bulk";
import { Combobox } from "@/components/admin/combobox";
import { Thumb } from "@/components/admin/parts";
import { ColHead, DataTable, DataTableRow, DataTableToolbar, PaginationBar } from "@/components/custom/data-table";
import { DetailList } from "@/components/custom/detail-list";
import { DetailSheet } from "@/components/custom/dialogs";
import { SearchField } from "@/components/custom/form-field";
import { LabelTag } from "@/components/custom/label-tag";
import { PageHero } from "@/components/custom/page-hero";
import { SectionCard } from "@/components/custom/section-card";
import { StatusPill } from "@/components/custom/status-pill";
import { Mono, SectionLabel } from "@/components/custom/typography";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { useUrlState } from "@/hooks/use-url-state";
import { api } from "@/lib/api";
import { formatMoney, formatNumber, titleCase } from "@/lib/format";
import type { Lookups, Paged, ProductDetail, ProductRow } from "@/lib/types";

function StockBadge({ stock }: { stock: number }) {
  if (stock <= 0) return <StatusPill status="OUT_OF_STOCK" />;
  if (stock <= 5) return <StatusPill status="LOW_STOCK" label={`Low · ${stock}`} />;
  return <span className="ledger">{formatNumber(stock)}</span>;
}

function ProductPanel({ productId, onClose }: { productId: number | null; onClose: () => void }) {
  const { data: product, isPending, isError, refetch } = useQuery({
    queryKey: ["product", productId],
    queryFn: () => api<ProductDetail>(`/admin/products/${productId}`),
    enabled: productId !== null,
  });

  return (
    <DetailSheet
      open={productId !== null}
      onClose={onClose}
      wide
      title={product ? titleCase(product.name) : "Product"}
      description={product ? [product.brand ? titleCase(product.brand.name) : null, product.form, product.legacyCode].filter(Boolean).join(" · ") : undefined}
      status={product ? { status: product.status, kind: "inventory" } : undefined}
      actions={product ? <Button asChild size="sm" variant="outline"><Link href={`/admin/products/${product.id}`}><Pencil data-icon="inline-start" /> Edit product</Link></Button> : undefined}
      loading={isPending}
      failed={isError}
      onRetry={() => refetch()}
    >
      {product ? (
        <div className="grid gap-6 text-sm">
          {product.images.length ? (
            <div className="flex gap-2 overflow-x-auto">
              {product.images.map((image) => <Thumb key={image.id} src={image.url} name={product.name} className="size-20" />)}
            </div>
          ) : null}

          <DetailList
            columns={3}
            items={[
              { label: "Category", value: product.category ? titleCase([product.category.parent?.name, product.category.name].filter(Boolean).join(" › ")) : "—" },
              { label: "Times ordered", value: formatNumber(product._count.orderItems) },
              { label: "Reviews", value: formatNumber(product._count.reviews) },
            ]}
          />

          <section>
            <SectionLabel className="mb-2">Variants ({product.variants.length})</SectionLabel>
            <div className="overflow-hidden rounded-lg border">
              <DataTable isPending={false} isError={false} isEmpty={false} empty={{ title: "" }} dense>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <ColHead>Variant</ColHead>
                      <ColHead>SKU</ColHead>
                      <ColHead align="right">MRP</ColHead>
                      <ColHead align="right">Price</ColHead>
                      <ColHead align="right">Stock</ColHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {product.variants.map((variant) => (
                      <TableRow key={variant.id} className="h-auto!">
                        <TableCell className="max-w-56 py-2!">
                          <span className="line-clamp-2 whitespace-normal">{variant.title}</span>
                          {variant.isDefault && product.variants.length > 1 ? <LabelTag tone="neutral" className="mt-1">Default</LabelTag> : null}
                        </TableCell>
                        <TableCell><Mono>{variant.sku}</Mono></TableCell>
                        <TableCell className="ledger text-right text-muted-foreground">{formatMoney(variant.mrp)}</TableCell>
                        <TableCell className="ledger text-right font-medium">{formatMoney(variant.sellingPrice)}</TableCell>
                        <TableCell className="text-right"><StockBadge stock={variant.stockQuantity} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </DataTable>
            </div>
          </section>

          {product.shortDescription || product.description ? (
            <section>
              <SectionLabel className="mb-2">Description</SectionLabel>
              <p className="whitespace-pre-line text-pretty text-muted-foreground">
                {(product.shortDescription ?? product.description ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 900)}
              </p>
            </section>
          ) : null}
        </div>
      ) : null}
    </DetailSheet>
  );
}

function ProductsView() {
  const url = useUrlState();
  const [openId, setOpenId] = useState<number | null>(null);

  const filters = {
    q: url.get("q"), brandId: url.get("brandId"), categoryId: url.get("categoryId"), status: url.get("status"),
    stock: url.get("stock"), sort: url.get("sort"), page: url.get("page") || "1", pageSize: url.get("pageSize") || "20",
  };
  const { data, isPending, isError, isPlaceholderData, refetch } = useQuery({
    queryKey: ["products", filters],
    queryFn: () => api<Paged<ProductRow>>("/admin/products", { query: filters }),
    placeholderData: (previous) => previous,
  });
  const { data: lookups } = useQuery({
    queryKey: ["product-lookups"],
    queryFn: () => api<Lookups>("/admin/products/lookups"),
    staleTime: 5 * 60_000,
  });

  const selection = useSelection((data?.items ?? []).map((product) => product.id));

  const brandOptions = useMemo(() => (lookups?.brands ?? []).map((b) => ({ value: String(b.id), label: titleCase(b.name) })), [lookups]);
  const categoryOptions = useMemo(() => {
    const byId = new Map((lookups?.categories ?? []).map((c) => [c.id, c]));
    return (lookups?.categories ?? []).map((c) => ({
      value: String(c.id),
      label: titleCase(c.name),
      hint: c.parentId ? titleCase(byId.get(c.parentId)?.name ?? "") : "Main",
    }));
  }, [lookups]);

  return (
    <>
      <PageHero
        eyebrow={`Catalog · Products${data ? ` · ${formatNumber(data.total)}` : ""}`}
        title="Products"
        description="Every product and its pack sizes, prices and stock."
        actions={
          <>
            <Button asChild variant="outline" size="lg"><Link href="/admin/products/import"><Upload data-icon="inline-start" /> Bulk upload</Link></Button>
            <Button asChild size="lg"><Link href="/admin/products/new"><Plus data-icon="inline-start" /> Add product</Link></Button>
          </>
        }
      />

      <SectionCard flush>
        <DataTableToolbar
          search={<SearchField value={filters.q} onChange={(q) => url.set({ q })} placeholder="Product name or SKU" />}
          hasFilters={url.hasAny}
          onClear={url.clear}
          filters={
            <>
              <Combobox value={filters.brandId} onChange={(brandId) => url.set({ brandId })} options={brandOptions} allLabel="All brands" searchPlaceholder="Search brands…" className="w-40" />
              <Combobox value={filters.categoryId} onChange={(categoryId) => url.set({ categoryId })} options={categoryOptions} allLabel="All categories" searchPlaceholder="Search categories…" className="w-44" />
              <Select value={filters.stock || "all"} onValueChange={(v) => url.set({ stock: v === "all" ? "" : v })}>
                <SelectTrigger className="h-9 w-36" aria-label="Stock"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any stock</SelectItem>
                  <SelectItem value="in">In stock</SelectItem>
                  <SelectItem value="low">Running low</SelectItem>
                  <SelectItem value="out">Out of stock</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filters.status || "all"} onValueChange={(v) => url.set({ status: v === "all" ? "" : v })}>
                <SelectTrigger className="h-9 w-32" aria-label="Status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any status</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="ARCHIVED">Archived</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filters.sort || "newest"} onValueChange={(v) => url.set({ sort: v === "newest" ? "" : v })}>
                <SelectTrigger className="h-9 w-40" aria-label="Sort"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest first</SelectItem>
                  <SelectItem value="oldest">Oldest first</SelectItem>
                  <SelectItem value="name">Name A–Z</SelectItem>
                  <SelectItem value="updated">Recently updated</SelectItem>
                </SelectContent>
              </Select>
            </>
          }
          actions={<BulkActions table="products" noun="products" refresh={["products", "dashboard", "brands", "categories"]} deleteNote="All their variants, images and reviews go too; past orders keep their own copy." selection={selection} filters={filters} />}
        />

        <DataTable
          isPending={isPending || !data}
          isError={isError}
          isEmpty={data?.items.length === 0}
          isStale={isPlaceholderData}
          onRetry={() => refetch()}
          skeletonCols={7}
          empty={{ illustration: "inventory", title: "No products match", description: "Try a different search, or clear the filters to see the whole catalog.", action: url.hasAny ? <Button variant="outline" onClick={url.clear}>Clear filters</Button> : undefined }}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <ColHead className="w-10 pl-4"><SelectPage selection={selection} noun="products" /></ColHead>
                <ColHead>Product</ColHead>
                <ColHead>Brand</ColHead>
                <ColHead>Category</ColHead>
                <ColHead>Variants</ColHead>
                <ColHead align="right">Price</ColHead>
                <ColHead align="right">Stock</ColHead>
                <ColHead className="pr-4">Status</ColHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.items.map((product) => (
                <DataTableRow key={product.id} selected={selection.has(product.id)} onOpen={() => setOpenId(product.id)} className="h-14!">
                  <TableCell className="pl-4"><SelectRow selection={selection} id={product.id} label={product.name} /></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Thumb src={product.imageUrl} name={product.name} />
                      <div className="min-w-0">
                        <div className="max-w-80 truncate font-medium">{titleCase(product.name)}</div>
                        <div className="text-xs text-muted-foreground">{[product.sku, product.form].filter(Boolean).join(" · ")}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-32 truncate">{product.brand ? titleCase(product.brand.name) : "—"}</TableCell>
                  <TableCell className="max-w-40 truncate">{product.category ? titleCase(product.category.name) : "—"}</TableCell>
                  <TableCell>
                    {product.variantCount > 1 ? (
                      <div className="flex max-w-56 flex-wrap gap-1">
                        {product.variantTitles.slice(0, 3).map((title, index) => (
                          <Badge key={index} variant="outline" className="max-w-28 truncate font-normal">{title}</Badge>
                        ))}
                        {product.variantCount > 3 ? <Badge variant="outline" className="font-normal">+{product.variantCount - 3}</Badge> : null}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">{product.variantTitles[0] === "Standard" ? "Single" : product.variantTitles[0]}</span>
                    )}
                  </TableCell>
                  <TableCell className="ledger text-right font-medium">
                    {product.priceMin === product.priceMax ? formatMoney(product.priceMin) : `${formatMoney(product.priceMin)} – ${formatMoney(product.priceMax)}`}
                  </TableCell>
                  <TableCell className="text-right"><StockBadge stock={product.stock} /></TableCell>
                  <TableCell className="pr-4"><StatusPill status={product.status} kind="inventory" /></TableCell>
                </DataTableRow>
              ))}
            </TableBody>
          </Table>
        </DataTable>

        {data ? (
          <PaginationBar
            page={data.page} pageCount={data.pageCount} pageSize={data.pageSize} total={data.total} noun="products"
            onPage={(page) => url.set({ page })} onPageSize={(pageSize) => url.set({ pageSize })}
          />
        ) : null}
      </SectionCard>

      <ProductPanel productId={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

export default function ProductsPage() {
  return (
    <Suspense>
      <ProductsView />
    </Suspense>
  );
}
