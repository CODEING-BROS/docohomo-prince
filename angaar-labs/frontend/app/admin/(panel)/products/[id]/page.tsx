"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { type ProductDraft, ProductForm } from "@/components/admin/product-form";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";

/** The product as the backend returns it for editing. */
type StoredProduct = {
  id: number; name: string; brandId: number | null; categoryId: number | null; form: string | null;
  shortDescription: string | null; description: string | null; composition: string | null; indications: string | null;
  directions: string | null; safetyInfo: string | null; manufacturer: string | null; countryOfOrigin: string | null;
  hsnCode: string | null; gstPercent: number; requiresPrescription: boolean; status: ProductDraft["status"];
  isFeatured: boolean; isNewArrival: boolean; isTrending: boolean;
  slug: string; seoTitle: string | null; seoDescription: string | null;
  images: { url: string }[];
  variants: {
    id: number; title: string; packSize: string | null; potency: string | null; sku: string;
    mrp: number; sellingPrice: number; b2bPrice: number | null; stockQuantity: number; b2bMinQuantity: number; isDefault: boolean;
  }[];
};

const toDraft = (p: StoredProduct): ProductDraft => ({
  name: p.name, brandId: p.brandId ? String(p.brandId) : "", categoryId: p.categoryId ? String(p.categoryId) : "", form: p.form ?? "",
  shortDescription: p.shortDescription ?? "", description: p.description ?? "", composition: p.composition ?? "",
  indications: p.indications ?? "", directions: p.directions ?? "", safetyInfo: p.safetyInfo ?? "",
  manufacturer: p.manufacturer ?? "", countryOfOrigin: p.countryOfOrigin ?? "", hsnCode: p.hsnCode ?? "", gstPercent: String(p.gstPercent),
  requiresPrescription: p.requiresPrescription, status: p.status,
  isFeatured: p.isFeatured, isNewArrival: p.isNewArrival, isTrending: p.isTrending,
  seoTitle: p.seoTitle ?? "", seoDescription: p.seoDescription ?? "", slug: p.slug,
  images: p.images.map((image) => image.url),
  variants: p.variants.map((v) => ({
    key: `saved-${v.id}`, id: v.id, title: v.title, titleEdited: true, packSize: v.packSize ?? "", potency: v.potency ?? "", sku: v.sku,
    mrp: String(v.mrp), sellingPrice: String(v.sellingPrice), b2bPrice: v.b2bPrice === null ? "" : String(v.b2bPrice),
    stockQuantity: String(v.stockQuantity), b2bMinQuantity: String(v.b2bMinQuantity), isDefault: v.isDefault,
  })),
});

export default function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isPending, isError } = useQuery({
    queryKey: ["product", Number(id)],
    queryFn: () => api<StoredProduct>(`/admin/products/${id}`),
    staleTime: 0,
  });

  if (isError) {
    return (
      <div className="py-16 text-center">
        <p className="font-medium">This product could not be found</p>
        <Button asChild variant="outline" className="mt-3"><Link href="/admin/products">Back to products</Link></Button>
      </div>
    );
  }
  if (isPending || !data) {
    return <div className="grid gap-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-64" /><Skeleton className="h-64" /></div>;
  }
  // keyed by the save time so the form starts fresh if the product is reloaded
  return <ProductForm key={`${data.id}`} productId={data.id} initial={toDraft(data)} />;
}
