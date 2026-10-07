"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ProductView } from "@/components/site/product-view";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { ProductDetail } from "@/lib/shop";
import { useShop } from "@/lib/shop-paths";

/** One medicine: its packs, prices, details and reviews. */
export function ShopProduct() {
  const { slug } = useParams<{ slug: string }>();
  const { base } = useShop();
  const { data, isPending, isError } = useQuery({ queryKey: ["shop-product", slug], queryFn: () => api<ProductDetail>(`/shop/products/${slug}`), staleTime: 0 });

  if (isError) {
    return (
      <div className="py-16 text-center">
        <p className="font-medium">This product is no longer on sale</p>
        <Button asChild variant="outline" className="mt-3"><Link href={base}>Back to all medicines</Link></Button>
      </div>
    );
  }
  if (isPending) return <div className="grid gap-8 lg:grid-cols-[minmax(0,26rem)_1fr]"><Skeleton className="aspect-square rounded-2xl" /><Skeleton className="h-96 rounded-2xl" /></div>;
  return <ProductView key={data.slug} product={data} />;
}
