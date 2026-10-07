"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Combobox } from "@/components/admin/combobox";
import { ImagesField } from "@/components/admin/images-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { titleCase } from "@/lib/format";
import type { Lookups } from "@/lib/types";
import { cn } from "@/lib/utils";

const FORMS = [
  "Dilution", "Mother Tincture", "Biochemic", "Bio Combination", "Trituration", "Tablets", "Capsules", "Drops", "Syrup",
  "Ointment / Cream", "Oil", "Shampoo", "Soap / Face Wash", "Powder", "Other",
];

// Numbers are kept as text while typing, so an empty box stays empty instead of jumping to 0.
export type VariantDraft = {
  key: string; // stable id for the row while editing
  id?: number;
  title: string; titleEdited: boolean;
  packSize: string; potency: string; sku: string;
  mrp: string; sellingPrice: string; b2bPrice: string;
  stockQuantity: string; b2bMinQuantity: string;
  isDefault: boolean;
};

export type ProductDraft = {
  name: string; brandId: string; categoryId: string; form: string;
  shortDescription: string; description: string; composition: string; indications: string; directions: string; safetyInfo: string;
  manufacturer: string; countryOfOrigin: string; hsnCode: string; gstPercent: string;
  requiresPrescription: boolean; status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  isFeatured: boolean; isNewArrival: boolean; isTrending: boolean;
  seoTitle: string; seoDescription: string; slug: string; // search engine listing; empty = written automatically
  images: string[];
  variants: VariantDraft[];
};

let rowCounter = 0;
export const newVariant = (isDefault = false): VariantDraft => ({
  key: `new-${++rowCounter}`, title: "", titleEdited: false, packSize: "", potency: "", sku: "",
  mrp: "", sellingPrice: "", b2bPrice: "", stockQuantity: "0", b2bMinQuantity: "1", isDefault,
});

export const emptyProduct = (): ProductDraft => ({
  name: "", brandId: "", categoryId: "", form: "", shortDescription: "", description: "", composition: "", indications: "",
  directions: "", safetyInfo: "", manufacturer: "", countryOfOrigin: "India", hsnCode: "", gstPercent: "0",
  requiresPrescription: false, status: "ACTIVE", isFeatured: false, isNewArrival: false, isTrending: false,
  seoTitle: "", seoDescription: "", slug: "",
  images: [], variants: [newVariant(true)],
});

function Field({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

const SEO_TITLE_MAX = 60;
const SEO_DESCRIPTION_MAX = 155;
const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1).replace(/\s+\S*$/, "")}…`);

/** What is used when the boxes are left empty. The server writes the real ones the same way. */
const automaticSeo = (draft: ProductDraft) => {
  const name = titleCase(draft.name.trim()) || "Product name";
  const title = [`${name} - Buy Online at Best Price | DocHomoeo`, `${name} - Buy Online | DocHomoeo`, `${name} | DocHomoeo`].find((c) => c.length <= SEO_TITLE_MAX) ?? clip(name, SEO_TITLE_MAX);
  const about = (draft.shortDescription || draft.indications || draft.description).replace(/\s+/g, " ").trim();
  const opening = `Buy ${name} online at DocHomoeo.`;
  const description = clip(about.length >= 50 ? `${opening} ${about}` : `${opening} Genuine ${draft.form ? draft.form.toLowerCase() : "homeopathic medicine"}, best price, delivered across India.`, SEO_DESCRIPTION_MAX);
  return { title, description };
};

/** How the product will look in Google, and the boxes to change it. */
function SearchListing({ draft, set, isNew }: { draft: ProductDraft; set: <K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) => void; isNew: boolean }) {
  const auto = automaticSeo(draft);
  const title = draft.seoTitle.trim() || auto.title;
  const description = draft.seoDescription.trim() || auto.description;
  const counter = (length: number, max: number) => <span className={cn("ledger", length > max ? "font-medium text-destructive" : "")}>{length} of {max}</span>;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Search engine listing</CardTitle>
        <CardDescription>How this product appears on Google and in shared links. Leave the boxes empty and it is written for you from the name and description.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="rounded-lg border bg-muted/30 p-3.5">
          <p className="truncate text-xs text-muted-foreground">dochomoeo.com › products › {draft.slug || "made-from-the-name"}</p>
          <p className="mt-0.5 truncate text-lg leading-snug text-[#1a0dab] dark:text-[#8ab4f8]">{title}</p>
          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Page title" hint={draft.seoTitle ? undefined : "Written automatically. Type here to use your own."} className="sm:col-span-2">
            <Input value={draft.seoTitle} placeholder={auto.title} onChange={(e) => set("seoTitle", e.target.value)} />
            <p className="text-xs text-muted-foreground">{counter(title.length, SEO_TITLE_MAX)} letters. Longer titles are cut off by Google.</p>
          </Field>
          <Field label="Description" hint={draft.seoDescription ? undefined : "Written automatically. Type here to use your own."} className="sm:col-span-2">
            <Textarea rows={3} value={draft.seoDescription} placeholder={auto.description} onChange={(e) => set("seoDescription", e.target.value)} />
            <p className="text-xs text-muted-foreground">{counter(description.length, SEO_DESCRIPTION_MAX)} letters.</p>
          </Field>
          <Field label="Web address" hint={isNew ? "Leave empty to make it from the name." : "Changing this breaks old links to the product. It stays the same when you rename the product."} className="sm:col-span-2">
            <div className="flex h-9 items-center rounded-md border bg-background text-sm focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
              <span className="border-r px-2.5 text-muted-foreground">/products/</span>
              <input aria-label="Web address" className="h-full min-w-0 flex-1 bg-transparent px-2.5 outline-none" value={draft.slug} placeholder="made-from-the-name"
                onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-{2,}/g, "-").replace(/^-/, ""))} />
            </div>
          </Field>
        </div>
      </CardContent>
    </Card>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-start gap-2.5 text-sm">
      <Checkbox className="mt-0.5" checked={checked} onCheckedChange={(value) => onChange(value === true)} />
      <span>
        {label}
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
    </label>
  );
}

/** The add / edit product screen. `productId` is set when editing. */
export function ProductForm({ productId, initial }: { productId?: number; initial: ProductDraft }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<ProductDraft>(initial);
  const set = <K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const { data: lookups } = useQuery({ queryKey: ["product-lookups"], queryFn: () => api<Lookups>("/admin/products/lookups"), staleTime: 5 * 60_000 });
  const brandOptions = useMemo(() => (lookups?.brands ?? []).map((b) => ({ value: String(b.id), label: titleCase(b.name) })), [lookups]);
  const categoryOptions = useMemo(() => {
    const byId = new Map((lookups?.categories ?? []).map((c) => [c.id, c]));
    const pathOf = (id: number): string[] => {
      const category = byId.get(id);
      return category ? [...(category.parentId ? pathOf(category.parentId) : []), titleCase(category.name)] : [];
    };
    return (lookups?.categories ?? [])
      .map((c) => ({ path: pathOf(c.id), id: c.id }))
      .sort((a, b) => a.path.join(" ").localeCompare(b.path.join(" ")))
      .map(({ path, id }) => ({ value: String(id), label: path[path.length - 1], hint: path.slice(0, -1).join(" › ") || "Main category" }));
  }, [lookups]);

  const setVariant = (key: string, changes: Partial<VariantDraft>) =>
    setDraft((current) => ({
      ...current,
      variants: current.variants.map((variant) => {
        if (variant.key !== key) return variant;
        const next = { ...variant, ...changes };
        // until someone types a name, it follows the potency and pack size
        if (!next.titleEdited && ("potency" in changes || "packSize" in changes)) {
          next.title = [next.potency.trim(), next.packSize.trim()].filter(Boolean).join(" · ");
        }
        return next;
      }),
    }));
  const makeDefault = (key: string) => setDraft((current) => ({ ...current, variants: current.variants.map((v) => ({ ...v, isDefault: v.key === key })) }));
  const removeVariant = (key: string) =>
    setDraft((current) => {
      const left = current.variants.filter((v) => v.key !== key);
      if (left.length && !left.some((v) => v.isDefault)) left[0] = { ...left[0], isDefault: true };
      return { ...current, variants: left };
    });

  const save = useMutation({
    mutationFn: () =>
      api<{ id: number }>(productId ? `/admin/products/${productId}` : "/admin/products", {
        method: productId ? "PATCH" : "POST",
        body: {
          ...draft,
          brandId: draft.brandId ? Number(draft.brandId) : null,
          categoryId: draft.categoryId ? Number(draft.categoryId) : null,
          gstPercent: Number(draft.gstPercent || 0),
          slug: draft.slug.replace(/-+$/, ""),
          variants: draft.variants.map((v) => ({
            id: v.id, title: v.title.trim() || [v.potency, v.packSize].filter(Boolean).join(" · ") || "Standard",
            packSize: v.packSize, potency: v.potency, sku: v.sku,
            mrp: Number(v.mrp || 0), sellingPrice: Number(v.sellingPrice || v.mrp || 0), b2bPrice: v.b2bPrice === "" ? null : Number(v.b2bPrice),
            stockQuantity: Number(v.stockQuantity || 0), b2bMinQuantity: Number(v.b2bMinQuantity || 1), isDefault: v.isDefault,
          })),
        },
      }),
    onSuccess: () => {
      toast.success(productId ? "Product saved" : "Product added");
      ["products", "product", "dashboard", "brands", "categories"].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
      router.push("/admin/products");
    },
    onError: (err) => toast.error(err.message),
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (draft.variants.some((v) => v.mrp === "")) return toast.error("Enter the MRP for every variant");
    save.mutate();
  };

  return (
    <form onSubmit={submit}>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Back to products"><Link href="/admin/products"><ArrowLeft /></Link></Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold tracking-tight">{productId ? "Edit product" : "Add product"}</h1>
          <p className="text-sm text-muted-foreground">One product can be sold in several packs. Add each pack as a variant.</p>
        </div>
        <Button asChild variant="outline" className="h-9"><Link href="/admin/products">Cancel</Link></Button>
        <Button type="submit" className="h-9" loading={save.isPending}>{productId ? "Save changes" : "Add product"}
        </Button>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-3">
        <div className="grid min-w-0 gap-4 xl:col-span-2">
          <Card>
            <CardHeader><CardTitle>Basics</CardTitle></CardHeader>
            <CardContent className="grid gap-4">
              <Field label="Product name" hint="Without the pack size. Sizes go in the variants below.">
                <Input required value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="SBL Arnica Montana Mother Tincture Q" />
              </Field>
              <Field label="Short description" hint="One or two lines shown near the price.">
                <Textarea rows={2} value={draft.shortDescription} onChange={(e) => set("shortDescription", e.target.value)} />
              </Field>
              <Field label="Full description">
                <Textarea rows={6} value={draft.description} onChange={(e) => set("description", e.target.value)} />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Images</CardTitle></CardHeader>
            <CardContent><ImagesField folder="products" value={draft.images} onChange={(images) => set("images", images)} /></CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Variants</CardTitle>
              <CardDescription>Each pack a customer can buy: its size or potency, price and stock. The default one is shown first on the store.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {draft.variants.map((variant, index) => (
                <div key={variant.key} className={cn("rounded-lg border p-3", variant.isDefault && "border-primary/50 bg-primary/3")}>
                  <div className="mb-3 flex items-center gap-3">
                    <span className="text-sm font-medium">Variant {index + 1}</span>
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <input type="radio" name="default-variant" className="accent-primary" checked={variant.isDefault} onChange={() => makeDefault(variant.key)} />
                      Default
                    </label>
                    <Button
                      type="button" variant="ghost" size="icon-sm" className="ml-auto" aria-label={`Remove variant ${index + 1}`}
                      disabled={draft.variants.length === 1} onClick={() => removeVariant(variant.key)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="Pack size"><Input value={variant.packSize} placeholder="30 ml" onChange={(e) => setVariant(variant.key, { packSize: e.target.value })} /></Field>
                    <Field label="Potency"><Input value={variant.potency} placeholder="30 CH" onChange={(e) => setVariant(variant.key, { potency: e.target.value })} /></Field>
                    <Field label="Name shown to buyers" className="lg:col-span-2">
                      <Input value={variant.title} placeholder="30 CH · 30 ml" onChange={(e) => setVariant(variant.key, { title: e.target.value, titleEdited: true })} />
                    </Field>
                    <Field label="MRP (₹)"><Input type="number" min="0" step="0.01" inputMode="decimal" value={variant.mrp} onChange={(e) => setVariant(variant.key, { mrp: e.target.value })} /></Field>
                    <Field label="Selling price (₹)"><Input type="number" min="0" step="0.01" inputMode="decimal" value={variant.sellingPrice} placeholder={variant.mrp || "Same as MRP"} onChange={(e) => setVariant(variant.key, { sellingPrice: e.target.value })} /></Field>
                    <Field label="B2B price (₹)"><Input type="number" min="0" step="0.01" inputMode="decimal" value={variant.b2bPrice} placeholder="Optional" onChange={(e) => setVariant(variant.key, { b2bPrice: e.target.value })} /></Field>
                    <Field label="B2B minimum quantity"><Input type="number" min="1" step="1" inputMode="numeric" value={variant.b2bMinQuantity} onChange={(e) => setVariant(variant.key, { b2bMinQuantity: e.target.value })} /></Field>
                    <Field label="Stock"><Input type="number" min="0" step="1" inputMode="numeric" value={variant.stockQuantity} onChange={(e) => setVariant(variant.key, { stockQuantity: e.target.value })} /></Field>
                    <Field label="SKU" className="lg:col-span-2"><Input value={variant.sku} placeholder="Leave empty to create one" onChange={(e) => setVariant(variant.key, { sku: e.target.value })} /></Field>
                  </div>
                </div>
              ))}
              <Button type="button" variant="outline" className="justify-self-start" onClick={() => set("variants", [...draft.variants, newVariant(draft.variants.length === 0)])}>
                <Plus /> Add another variant
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Medicine details</CardTitle><CardDescription>Shown as sections on the product page. All optional.</CardDescription></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Composition"><Textarea rows={3} value={draft.composition} onChange={(e) => set("composition", e.target.value)} /></Field>
              <Field label="Used for"><Textarea rows={3} value={draft.indications} onChange={(e) => set("indications", e.target.value)} /></Field>
              <Field label="Dosage and directions"><Textarea rows={3} value={draft.directions} onChange={(e) => set("directions", e.target.value)} /></Field>
              <Field label="Safety information"><Textarea rows={3} value={draft.safetyInfo} onChange={(e) => set("safetyInfo", e.target.value)} /></Field>
            </CardContent>
          </Card>

          <SearchListing draft={draft} set={set} isNew={!productId} />
        </div>

        <div className="grid min-w-0 gap-4">
          <Card>
            <CardHeader><CardTitle>Visibility</CardTitle></CardHeader>
            <CardContent className="grid gap-4">
              <Field label="Status">
                <Select value={draft.status} onValueChange={(value) => set("status", value as ProductDraft["status"])}>
                  <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active (on the store)</SelectItem>
                    <SelectItem value="DRAFT">Draft (hidden, still being prepared)</SelectItem>
                    <SelectItem value="ARCHIVED">Archived (hidden, no longer sold)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Toggle label="Featured" checked={draft.isFeatured} onChange={(v) => set("isFeatured", v)} />
              <Toggle label="New arrival" checked={draft.isNewArrival} onChange={(v) => set("isNewArrival", v)} />
              <Toggle label="Trending" checked={draft.isTrending} onChange={(v) => set("isTrending", v)} />
              <Toggle label="Needs a prescription" hint="The order waits for a valid prescription." checked={draft.requiresPrescription} onChange={(v) => set("requiresPrescription", v)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Organisation</CardTitle></CardHeader>
            <CardContent className="grid gap-4">
              <Field label="Brand"><Combobox value={draft.brandId} onChange={(v) => set("brandId", v)} options={brandOptions} allLabel="No brand" searchPlaceholder="Search brands…" className="w-full" /></Field>
              <Field label="Category"><Combobox value={draft.categoryId} onChange={(v) => set("categoryId", v)} options={categoryOptions} allLabel="No category" searchPlaceholder="Search categories…" className="w-full" /></Field>
              <Field label="Form">
                <Select value={draft.form || "none"} onValueChange={(value) => set("form", value === "none" ? "" : value)}>
                  <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not set</SelectItem>
                    {[...new Set([...FORMS, ...(draft.form ? [draft.form] : [])])].map((form) => <SelectItem key={form} value={form}>{form}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Tax and origin</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <Field label="GST (%)"><Input type="number" min="0" max="40" step="0.01" inputMode="decimal" value={draft.gstPercent} onChange={(e) => set("gstPercent", e.target.value)} /></Field>
              <Field label="HSN code"><Input value={draft.hsnCode} onChange={(e) => set("hsnCode", e.target.value)} /></Field>
              <Field label="Manufacturer"><Input value={draft.manufacturer} onChange={(e) => set("manufacturer", e.target.value)} /></Field>
              <Field label="Country of origin"><Input value={draft.countryOfOrigin} onChange={(e) => set("countryOfOrigin", e.target.value)} /></Field>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}
