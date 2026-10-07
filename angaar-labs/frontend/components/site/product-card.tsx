"use client";

import { ShoppingCart, Star } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { QuantityStepper as Stepper } from "@/components/custom/form-field";
import { LabelTag } from "@/components/custom/label-tag";
import { Button } from "@/components/ui/button";
import { cart, useCart } from "@/lib/cart";
import { formatMoney, titleCase } from "@/lib/format";
import type { ProductCard as Card } from "@/lib/shop";
import { useShop } from "@/lib/shop-paths";
import { cn } from "@/lib/utils";

/** A product photo that falls back to the first letter when there is no picture or it fails to load. */
export function ProductImage({ src, name, className }: { src: string | null; name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={cn("font-display flex items-center justify-center overflow-hidden bg-[oklch(0.995_0.004_85)] text-3xl font-medium text-muted-foreground/50", className)}>
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote catalog images of unknown size
        <img src={src} alt="" loading="lazy" className="size-full object-contain mix-blend-multiply transition-transform duration-300 group-hover:scale-[1.04]" onError={() => setFailed(true)} />
      ) : (
        name.trim().charAt(0).toUpperCase()
      )}
    </span>
  );
}

/** Minus, the number, plus. Going below the smallest allowed quantity removes the pack from the cart. */
export function QuantityStepper({ variantId, quantity, min = 1, max, size = "sm" }: { variantId: number; quantity: number; min?: number; max?: number; size?: "sm" | "md" }) {
  return (
    <Stepper value={quantity} min={0} max={max} size={size} labelNoun="pack" onChange={(next) => cart.setQuantity(variantId, next < min ? 0 : next)} />
  );
}

export function Stars({ rating, count }: { rating: number; count: number }) {
  if (count === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <span className="ledger inline-flex items-center gap-0.5 rounded-sm bg-[color-mix(in_oklch,var(--success)_14%,transparent)] px-1 py-px font-medium text-success"><Star className="size-3 fill-current" />{rating.toFixed(1)}</span>
      ({count})
    </span>
  );
}

export function ProductCard({ product, className }: { product: Card; className?: string }) {
  const { base } = useShop();
  const { quantityOf } = useCart();
  const quantity = quantityOf(product.variantId);
  const name = titleCase(product.name);
  const wholesale = product.wholesalePrice !== undefined && product.wholesalePrice < product.price ? product.wholesalePrice : null;
  const price = wholesale ?? product.price;

  return (
    <article className={cn("group relative flex flex-col overflow-hidden rounded-xl border bg-card transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-float", className)}>
      <Link href={`${base}/${product.slug}`} className="relative block">
        <ProductImage src={product.imageUrl} name={name} className="aspect-square w-full p-3" />
        <span className="absolute top-2 left-2 flex flex-col items-start gap-1">
          {product.discountPercent >= 5 ? <LabelTag tone="terracotta" variant="sticker">{product.discountPercent}% off</LabelTag> : null}
          {product.requiresPrescription ? <LabelTag variant="stamp" tilt={false}>Rx</LabelTag> : null}
        </span>
        {!product.inStock ? <span className="absolute right-2 bottom-2"><LabelTag tone="danger" variant="sticker">Out of stock</LabelTag></span> : null}
      </Link>
      <div className="flex flex-1 flex-col gap-1 border-t border-foreground/10 p-3">
        {product.brandName ? <p className="truncate text-[0.6875rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{product.brandName}</p> : null}
        <Link href={`${base}/${product.slug}`} className="line-clamp-2 min-h-10 text-sm leading-5 font-medium hover:text-primary">{name}</Link>
        <p className="truncate text-xs text-muted-foreground">{product.variantTitle}{product.variantCount > 1 ? ` · ${product.variantCount} packs` : ""}</p>
        <Stars rating={product.rating} count={product.ratingCount} />
        {wholesale !== null ? <p className="mt-auto pt-2 text-[11px] font-semibold tracking-[0.06em] text-plum uppercase">Your wholesale price</p> : null}
        <div className={cn("flex items-end justify-between gap-2", wholesale !== null ? "" : "mt-auto pt-2")}>
          <p className="ledger flex min-w-0 flex-wrap items-baseline gap-x-1.5">
            <span className="font-display text-lg font-medium">{formatMoney(price)}</span>
            {product.mrp > price ? <span className="text-xs text-muted-foreground line-through">{formatMoney(product.mrp)}</span> : null}
          </p>
          {!product.inStock ? null : quantity > 0 ? (
            <QuantityStepper variantId={product.variantId} quantity={quantity} />
          ) : product.variantCount > 1 ? (
            <Button asChild size="sm" variant="outline"><Link href={`${base}/${product.slug}`}>Options</Link></Button>
          ) : (
            <Button size="sm" variant="outline" className="border-primary/40 text-primary not-disabled:hover:bg-primary-soft not-disabled:hover:text-primary"
              onClick={() => { cart.add(product.variantId); toast.success("Added to your cart"); }}>
              <ShoppingCart data-icon="inline-start" /> Add
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
