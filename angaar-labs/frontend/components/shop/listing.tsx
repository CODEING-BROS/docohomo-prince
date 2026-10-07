"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Search, SlidersHorizontal, Sparkles, Star, X } from "lucide-react";
import { Suspense, useState } from "react";
import { EmptyState } from "@/components/custom/empty-state";
import { ProductGridSkeleton } from "@/components/custom/loaders";
import { Display, Eyebrow } from "@/components/custom/typography";
import { ProductCard } from "@/components/site/product-card";
import { SearchBox } from "@/components/site/search-box";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useUrlState } from "@/hooks/use-url-state";
import { api } from "@/lib/api";
import { formatNumber, titleCase } from "@/lib/format";
import type { Listing } from "@/lib/shop";
import { cn } from "@/lib/utils";

const SORTS = [
  { value: "relevance", label: "Best match" },
  { value: "popular", label: "Most bought" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "discount", label: "Biggest discount" },
  { value: "newest", label: "Newest first" },
  { value: "rating", label: "Top rated" },
  { value: "name", label: "Name: A to Z" },
];
const MULTI = ["brand", "form", "potency", "pack"] as const; // several values, comma separated in the address
const FILTER_KEYS = ["category", ...MULTI, "minPrice", "maxPrice", "discount", "rating", "inStock"];

type UrlState = ReturnType<typeof useUrlState>;
const valuesOf = (url: UrlState, key: string) => url.get(key).split(",").filter(Boolean);
const toggle = (url: UrlState, key: string, value: string) => {
  const current = valuesOf(url, key);
  url.set({ [key]: (current.includes(value) ? current.filter((v) => v !== value) : [...current, value]).join(",") });
};

/** One section of the filter panel. Click the title to fold it away. */
function Group({ title, used = 0, startOpen = true, onClear, children }: { title: string; used?: number; startOpen?: boolean; onClear?: () => void; children: React.ReactNode }) {
  const [open, setOpen] = useState(startOpen || used > 0);
  return (
    <section className="border-b border-foreground/10 last:border-b-0">
      <div className="flex items-center gap-2">
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex min-w-0 flex-1 items-center gap-2 py-3 text-left">
          <Eyebrow as="span" className="truncate text-foreground">{title}</Eyebrow>
          {used > 0 ? <span className="ledger flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-terracotta px-1.5 text-[10px] font-semibold text-terracotta-foreground">{used}</span> : null}
        </button>
        {onClear ? <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={onClear}>Clear</button> : null}
        <button type="button" aria-label={open ? `Hide ${title}` : `Show ${title}`} onClick={() => setOpen(!open)} className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
          <ChevronDown className={cn("size-4 transition-transform", open ? "rotate-180" : "")} />
        </button>
      </div>
      {open ? <div className="pb-4">{children}</div> : null}
    </section>
  );
}

const rowClass = "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-surface-2";
const Count = ({ value }: { value: number }) => <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatNumber(value)}</span>;

/**
 * A list of options with counts. Short lists are shown whole; long ones show the first few with
 * "Show all", and get a "type to find" box. The page scrolls, not the list, until it is opened in full.
 */
function OptionList({ options, onToggle, searchable, limit = 6 }: { options: { value: string; label: string; count: number; selected: boolean }[]; onToggle: (value: string) => void; searchable?: boolean; limit?: number }) {
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const text = search.trim().toLowerCase();
  const matching = text ? options.filter((o) => o.label.toLowerCase().includes(text)) : options;
  const long = matching.length > limit + 2; // do not hide just one or two
  const visible = showAll || text || !long ? matching : matching.slice(0, limit);

  return (
    <div className="grid gap-1.5">
      {searchable && options.length > limit + 2 ? (
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Type to find" aria-label="Find in this list" className="h-8 pl-8 text-sm" />
        </div>
      ) : null}
      <div className={cn("grid", (showAll || text) && matching.length > 10 ? "scroll-thin max-h-64 overflow-y-auto pr-1" : "")}>
        {visible.map((option) => (
          <label key={option.value} className={cn(rowClass, option.selected ? "font-medium" : "", option.count === 0 && !option.selected ? "opacity-50" : "")}>
            <Checkbox checked={option.selected} onCheckedChange={() => onToggle(option.value)} />
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
            <Count value={option.count} />
          </label>
        ))}
        {visible.length === 0 ? <p className="px-2 py-1.5 text-sm text-muted-foreground">Nothing matches.</p> : null}
      </div>
      {!text && long ? (
        <button type="button" className="justify-self-start px-2 text-xs font-medium text-primary hover:underline" onClick={() => setShowAll(!showAll)}>
          {showAll ? "Show fewer" : `Show all ${matching.length}`}
        </button>
      ) : null}
    </div>
  );
}

/** Pick-one choices shown as small tiles: price bands, discount, rating. */
function Tiles({ options, onPick }: { options: { key: string; label: React.ReactNode; count: number; selected: boolean }[]; onPick: (key: string, selected: boolean) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {options.map((option) => (
        <button key={option.key} type="button" aria-pressed={option.selected} onClick={() => onPick(option.key, option.selected)}
          className={cn("flex flex-col rounded-lg border px-2.5 py-1.5 text-left text-sm transition-colors", option.selected ? "border-primary/40 bg-primary-soft font-medium text-primary" : "hover:border-foreground/30 hover:bg-surface-2")}>
          <span className="flex items-center gap-1">{option.label}</span>
          <span className={cn("text-[11px] tabular-nums", option.selected ? "text-primary/80" : "text-muted-foreground")}>{formatNumber(option.count)} products</span>
        </button>
      ))}
    </div>
  );
}

function PriceBox({ url, range }: { url: UrlState; range: { min: number; max: number } }) {
  const [min, setMin] = useState(url.get("minPrice"));
  const [max, setMax] = useState(url.get("maxPrice"));
  return (
    <form className="mt-2.5 flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); url.set({ minPrice: min, maxPrice: max }); }}>
      <Input aria-label="Lowest price" inputMode="numeric" placeholder={`₹${range.min}`} value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ""))} className="h-8 text-sm" />
      <span className="text-xs text-muted-foreground">to</span>
      <Input aria-label="Highest price" inputMode="numeric" placeholder={`₹${range.max}`} value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ""))} className="h-8 text-sm" />
      <Button type="submit" size="sm" variant="outline" className="h-8">Go</Button>
    </form>
  );
}

type CategoryNode = Listing["facets"]["categories"][number];

/**
 * Categories as a tree. The arrow opens a category's sub-categories in place, without changing
 * the results; clicking the name filters by it. The branch holding the chosen category starts open.
 */
function CategoryTree({ data, url }: { data: Listing; url: UrlState }) {
  const { categories } = data.facets;
  const chosenSlug = url.get("category");
  const childrenOf = new Map<number | null, CategoryNode[]>();
  for (const category of categories) childrenOf.set(category.parentId, [...(childrenOf.get(category.parentId) ?? []), category]);

  // the chosen category and everything above it
  const pathTo = (slug: string) => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    const ids: number[] = [];
    for (let c = categories.find((x) => x.slug === slug); c; c = c.parentId === null ? undefined : byId.get(c.parentId)) ids.push(c.id);
    return ids;
  };
  const [open, setOpen] = useState<Set<number>>(() => new Set(pathTo(chosenSlug)));
  const [showAll, setShowAll] = useState<Set<number>>(() => new Set());
  const flip = (set: Set<number>, id: number) => { const next = new Set(set); if (next.has(id)) next.delete(id); else next.add(id); return next; };

  const choose = (category: CategoryNode) => {
    const chosen = category.slug === chosenSlug;
    url.set({ category: chosen ? "" : category.slug });
    if (!chosen && childrenOf.has(category.id)) setOpen((current) => new Set(current).add(category.id)); // show what is inside it
  };

  const branch = (parentId: number | null, depth: number): React.ReactNode => {
    const list = childrenOf.get(parentId) ?? [];
    const key = parentId ?? 0;
    const long = depth > 0 && list.length > 10; // the main categories are always shown in full
    // a long branch shows its first few, but never hides the chosen one
    const visible = !long || showAll.has(key) ? list : list.filter((c, index) => index < 8 || c.slug === chosenSlug || open.has(c.id));
    return (
      <ul role={depth === 0 ? "tree" : "group"} className={cn("min-w-0", depth > 0 ? "ml-[13px] border-l pl-1.5" : "")}>
        {visible.map((category) => {
          const kids = childrenOf.get(category.id)?.length ?? 0;
          const isOpen = open.has(category.id);
          const chosen = category.slug === chosenSlug;
          return (
            <li key={category.id} role="treeitem" aria-expanded={kids ? isOpen : undefined} aria-selected={chosen} className="min-w-0">
              <div className={cn("flex items-center rounded-md text-sm transition-colors", chosen ? "bg-primary-soft text-primary shadow-[inset_3px_0_0_var(--primary)]" : "hover:bg-surface-2")}>
                {kids ? (
                  <button type="button" aria-label={`${isOpen ? "Hide" : "Show"} what is inside ${titleCase(category.name)}`} onClick={() => setOpen(flip(open, category.id))}
                    className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/10 hover:text-foreground">
                    <ChevronRight className={cn("size-4 transition-transform", isOpen ? "rotate-90" : "")} />
                  </button>
                ) : (
                  <span aria-hidden className="flex size-7 shrink-0 items-center justify-center"><span className={cn("size-1 rounded-full", chosen ? "bg-primary" : "bg-muted-foreground/40")} /></span>
                )}
                <button type="button" onClick={() => choose(category)} className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-2 text-left">
                  <span title={titleCase(category.name)} className={cn("min-w-0 flex-1 truncate", chosen ? "font-semibold" : "")}>{titleCase(category.name)}</span>
                  {chosen ? <Check className="size-3.5 shrink-0" /> : null}
                  <span className={cn("shrink-0 text-xs tabular-nums", chosen ? "text-primary/80" : "text-muted-foreground")}>{formatNumber(category.count)}</span>
                </button>
              </div>
              {kids && isOpen ? branch(category.id, depth + 1) : null}
            </li>
          );
        })}
        {long ? (
          <li>
            <button type="button" className="ml-7 py-1 text-xs font-medium text-primary hover:underline" onClick={() => setShowAll(flip(showAll, key))}>
              {showAll.has(key) ? "Show fewer" : `Show all ${list.length}`}
            </button>
          </li>
        ) : null}
      </ul>
    );
  };

  return branch(null, 0);
}

function Filters({ data, url }: { data: Listing; url: UrlState }) {
  const { facets } = data;
  const priceKey = `${url.get("minPrice")}-${url.get("maxPrice")}`;
  const plain = (options: { value: string; count: number; selected: boolean }[]) => options.map((o) => ({ ...o, label: o.value }));
  const used = (key: string) => valuesOf(url, key).length;
  const anyUsed = FILTER_KEYS.some((key) => url.get(key));

  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-foreground/18 bg-card py-3">
        <p className="font-display flex items-center gap-2 text-base font-medium"><SlidersHorizontal className="size-4 text-terracotta" /> Filters</p>
        {anyUsed ? <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => url.set(Object.fromEntries(FILTER_KEYS.map((key) => [key, ""])))}>Clear all</button> : null}
      </div>

      <label className="mt-3 flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm hover:bg-surface-2">
        <Checkbox checked={url.get("inStock") === "1"} onCheckedChange={(checked) => url.set({ inStock: checked ? "1" : "" })} />
        <span className="flex-1">In stock only</span>
      </label>

      <Group title="Category" used={url.get("category") ? 1 : 0} onClear={url.get("category") ? () => url.set({ category: "" }) : undefined}>
        <CategoryTree data={data} url={url} />
      </Group>

      {facets.brands.length ? (
        <Group title="Brand" used={used("brand")} onClear={url.get("brand") ? () => url.set({ brand: "" }) : undefined}>
          <OptionList searchable options={facets.brands.map((b) => ({ ...b, label: titleCase(b.label) }))} onToggle={(value) => toggle(url, "brand", value)} />
        </Group>
      ) : null}
      {facets.forms.length ? (
        <Group title="Type of medicine" used={used("form")} startOpen={false} onClear={url.get("form") ? () => url.set({ form: "" }) : undefined}>
          <OptionList options={plain(facets.forms)} onToggle={(value) => toggle(url, "form", value)} />
        </Group>
      ) : null}
      {facets.potencies.length ? (
        <Group title="Potency" used={used("potency")} startOpen={false} onClear={url.get("potency") ? () => url.set({ potency: "" }) : undefined}>
          <OptionList options={plain(facets.potencies)} onToggle={(value) => toggle(url, "potency", value)} />
        </Group>
      ) : null}
      {facets.packs.length ? (
        <Group title="Pack size" used={used("pack")} startOpen={false} onClear={url.get("pack") ? () => url.set({ pack: "" }) : undefined}>
          <OptionList searchable options={plain(facets.packs)} onToggle={(value) => toggle(url, "pack", value)} />
        </Group>
      ) : null}

      <Group title="Price" used={url.get("minPrice") || url.get("maxPrice") ? 1 : 0} startOpen={false} onClear={url.get("minPrice") || url.get("maxPrice") ? () => url.set({ minPrice: "", maxPrice: "" }) : undefined}>
        <Tiles
          options={facets.prices.map((band) => ({ key: band.key, label: band.label, count: band.count, selected: url.get("minPrice") === String(band.min) && url.get("maxPrice") === (band.max === null ? "" : String(band.max)) }))}
          onPick={(key, selected) => { const band = facets.prices.find((b) => b.key === key)!; url.set(selected ? { minPrice: "", maxPrice: "" } : { minPrice: band.min, maxPrice: band.max ?? "" }); }}
        />
        <PriceBox key={priceKey} url={url} range={facets.priceRange} />
      </Group>

      {facets.discounts.length ? (
        <Group title="Discount" used={url.get("discount") ? 1 : 0} startOpen={false} onClear={url.get("discount") ? () => url.set({ discount: "" }) : undefined}>
          <Tiles
            options={facets.discounts.map((step) => ({ key: String(step.value), label: `${step.value}% or more`, count: step.count, selected: url.get("discount") === String(step.value) }))}
            onPick={(key, selected) => url.set({ discount: selected ? "" : key })}
          />
        </Group>
      ) : null}

      {facets.ratings.length ? (
        <Group title="Customer rating" used={url.get("rating") ? 1 : 0} startOpen={false} onClear={url.get("rating") ? () => url.set({ rating: "" }) : undefined}>
          <Tiles
            options={facets.ratings.map((step) => ({ key: String(step.value), label: <>{step.value} <Star className="size-3.5 fill-warning text-warning" /> and up</>, count: step.count, selected: url.get("rating") === String(step.value) }))}
            onPick={(key, selected) => url.set({ rating: selected ? "" : key })}
          />
        </Group>
      ) : null}
    </div>
  );
}

/** Every filter in use, as a chip that removes it. */
function ActiveFilters({ data, url }: { data: Listing; url: UrlState }) {
  const chips: { key: string; label: string; remove: () => void }[] = [];
  if (url.get("q")) chips.push({ key: "q", label: `“${url.get("q")}”`, remove: () => url.set({ q: "" }) });
  if (data.category) chips.push({ key: "category", label: titleCase(data.category.name), remove: () => url.set({ category: "" }) });
  for (const key of MULTI) {
    for (const value of valuesOf(url, key)) {
      const label = key === "brand" ? titleCase(data.facets.brands.find((b) => b.value === value)?.label ?? value) : value;
      chips.push({ key: `${key}-${value}`, label, remove: () => toggle(url, key, value) });
    }
  }
  const min = url.get("minPrice");
  const max = url.get("maxPrice");
  if (min || max) chips.push({ key: "price", label: min && max ? `₹${min} to ₹${max}` : min ? `Above ₹${min}` : `Under ₹${max}`, remove: () => url.set({ minPrice: "", maxPrice: "" }) });
  if (url.get("discount")) chips.push({ key: "discount", label: `${url.get("discount")}% off or more`, remove: () => url.set({ discount: "" }) });
  if (url.get("rating")) chips.push({ key: "rating", label: `${url.get("rating")} stars and above`, remove: () => url.set({ rating: "" }) });
  if (url.get("inStock")) chips.push({ key: "inStock", label: "In stock", remove: () => url.set({ inStock: "" }) });
  if (chips.length === 0) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <button key={chip.key} type="button" onClick={chip.remove} className="inline-flex h-7 items-center gap-1 rounded-full border border-foreground/18 bg-card pr-2 pl-3 text-xs font-medium transition-colors hover:border-destructive hover:text-destructive">
          {chip.label} <X className="size-3.5" /><span className="sr-only">Remove this filter</span>
        </button>
      ))}
      {chips.length > 1 ? <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={url.clear}>Clear all</button> : null}
    </div>
  );
}

function Pager({ page, pageCount, onPage }: { page: number; pageCount: number; onPage: (page: number) => void }) {
  if (pageCount <= 1) return null;
  // first, last, and the pages around the current one
  const pages = [...new Set([1, page - 1, page, page + 1, pageCount])].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);
  return (
    <nav aria-label="Pages" className="mt-6 flex items-center justify-center gap-1">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft /> Previous</Button>
      {pages.map((p, index) => (
        <span key={p} className="flex items-center gap-1">
          {index > 0 && p - pages[index - 1] > 1 ? <span className="px-1 text-muted-foreground">…</span> : null}
          <Button variant={p === page ? "default" : "ghost"} size="sm" className="ledger hidden min-w-9 sm:inline-flex" aria-current={p === page ? "page" : undefined} onClick={() => onPage(p)}>{p}</Button>
        </span>
      ))}
      <span className="px-2 text-sm text-muted-foreground sm:hidden">Page {page} of {pageCount}</span>
      <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>Next <ChevronRight /></Button>
    </nav>
  );
}

function ProductsPage() {
  const url = useUrlState();
  const [sheetOpen, setSheetOpen] = useState(false);
  const query = Object.fromEntries(["q", ...FILTER_KEYS, "sort", "page"].map((key) => [key, url.get(key)]));
  const { data, isPending, isError, isPlaceholderData } = useQuery({
    queryKey: ["shop-products", query],
    queryFn: () => api<Listing>("/shop/products", { query }),
    placeholderData: (previous) => previous, // keep the old results on screen while the new ones load
  });
  const filtersUsed = FILTER_KEYS.filter((key) => url.get(key)).length;
  const heading = url.get("q") ? `Results for “${url.get("q")}”` : data?.category ? titleCase(data.category.name) : "Order medicines";
  const goToPage = (page: number) => { url.set({ page: page === 1 ? "" : page }); window.scrollTo({ top: 0 }); };

  const doctor = data?.wholesale ?? false;

  return (
    <>
      <section className="grain relative mb-6 overflow-hidden rounded-xl bg-(image:--gradient-brand) p-6 text-paper md:p-8">
        <div className="relative max-w-2xl">
          <Eyebrow className="mb-2 text-paper/70">{doctor ? "Wholesale · at your doctor prices" : "Medicines · delivered to your door"}</Eyebrow>
          <Display level={1} className="text-paper">{url.get("q") || data?.category ? heading : "What do you need today?"}</Display>
          <p className="mt-2 text-sm text-paper/75">{doctor ? "Every medicine in the dispensary at wholesale rates, with GST invoices." : "Genuine homeopathic medicines from the brands you trust, checked by our pharmacist."}</p>
          <SearchBox className="mt-5" />
          {!url.get("q") && !data?.category && data?.facets.categories.length ? (
            <div className="mt-4 flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1 text-xs text-paper/70"><Sparkles className="size-3.5" /> Popular:</span>
              {data.facets.categories.filter((c) => c.parentId === null).slice(0, 6).map((c) => (
                <button key={c.id} type="button" onClick={() => url.set({ category: c.slug })} className="rounded-full border border-paper/25 bg-paper/10 px-2.5 py-0.5 text-xs text-paper transition-colors hover:bg-paper/20">{titleCase(c.name)}</button>
              ))}
            </div>
          ) : null}
        </div>
      </section>
      <div className="grid items-start gap-6 lg:grid-cols-[17rem_1fr]">
        <aside aria-label="Filters" className="scroll-thin sticky top-20 hidden max-h-[calc(100vh-6.5rem)] overflow-y-auto rounded-xl border bg-card px-4 lg:block">
          {data ? <Filters data={data} url={url} /> : <div className="grid gap-3 py-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-6" />)}</div>}
        </aside>

        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-medium">{heading}</h2>
              <p className="ledger text-sm text-muted-foreground">
                {data ? `${formatNumber(data.total)} ${data.total === 1 ? "product" : "products"}` : "Loading…"}
                {data?.wholesale ? " · at your wholesale prices" : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="lg" className="lg:hidden"><SlidersHorizontal data-icon="inline-start" /> Filters{filtersUsed ? ` (${filtersUsed})` : ""}</Button>
                </SheetTrigger>
                <SheetContent side="left" className="scroll-thin w-80 gap-0 overflow-y-auto">
                  <SheetHeader className="sr-only"><SheetTitle>Filters</SheetTitle><SheetDescription>{data ? `${formatNumber(data.total)} products match` : ""}</SheetDescription></SheetHeader>
                  <div className="px-4 pt-8">{data ? <Filters data={data} url={url} /> : null}</div>
                  <div className="sticky bottom-0 border-t bg-background p-3"><Button className="w-full" onClick={() => setSheetOpen(false)}>Show {data ? formatNumber(data.total) : ""} products</Button></div>
                </SheetContent>
              </Sheet>
              <Select value={data?.sort ?? (url.get("sort") || "popular")} onValueChange={(sort) => url.set({ sort })}>
                <SelectTrigger className="h-9 w-48" aria-label="Sort by"><SelectValue /></SelectTrigger>
                <SelectContent>{SORTS.filter((s) => s.value !== "relevance" || url.get("q")).map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {data ? <ActiveFilters data={data} url={url} /> : null}

          {isError ? (
            <EmptyState bordered variant="error" title="The products could not be loaded" description="Please try again in a moment." />
          ) : isPending ? (
            <ProductGridSkeleton count={12} className="grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4" />
          ) : data.items.length === 0 ? (
            <EmptyState bordered size="lg" illustration="search" title="No products match" description="Try removing a filter or searching with a shorter word." action={<Button variant="outline" onClick={url.clear}>Clear everything</Button>} />
          ) : (
            <>
              <div className={cn("grid grid-cols-2 gap-3 transition-opacity md:grid-cols-3 2xl:grid-cols-4", isPlaceholderData ? "opacity-60" : "")}>
                {data.items.map((product) => <ProductCard key={product.id} product={product} />)}
              </div>
              <Pager page={data.page} pageCount={data.pageCount} onPage={goToPage} />
            </>
          )}
        </div>
      </div>
    </>
  );
}

/** Every medicine on sale, with search and filters. Prices are the wholesale ones for a doctor, retail for everyone else. */
export function ShopListing() {
  return (
    <Suspense>
      <ProductsPage />
    </Suspense>
  );
}
