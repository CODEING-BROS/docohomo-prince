"use client";

import { ArrowRight, Tag, Trash2, Truck, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Callout } from "@/components/custom/callout";
import { EmptyState } from "@/components/custom/empty-state";
import { Money } from "@/components/custom/number";
import { PageHero } from "@/components/custom/page-hero";
import { ProgressBar } from "@/components/custom/progress-ring";
import { SectionCard } from "@/components/custom/section-card";
import { PriceBreakdown, useQuote } from "@/components/site/order-summary";
import { ProductImage, QuantityStepper } from "@/components/site/product-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cart } from "@/lib/cart";
import { formatMoney, titleCase } from "@/lib/format";
import { useShop } from "@/lib/shop-paths";
import { cn } from "@/lib/utils";

function CouponBox({ applied, error }: { applied: { code: string; description: string | null } | null; error: string | null }) {
  const [code, setCode] = useState("");
  if (applied) {
    return (
      <Callout tone="success" icon={Tag} compact action={<Button variant="ghost" size="icon-xs" aria-label="Remove the coupon" onClick={() => cart.setCoupon("")}><X /></Button>}>
        <span className="font-semibold">{applied.code}</span> applied{applied.description ? <span className="text-muted-foreground"> · {applied.description}</span> : null}
      </Callout>
    );
  }
  return (
    <div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (code.trim()) cart.setCoupon(code); }}>
        <Input aria-label="Coupon code" placeholder="Coupon code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="h-9 font-mono uppercase" />
        <Button type="submit" variant="outline" size="lg" disabled={!code.trim()}>Apply</Button>
      </form>
      {error ? <p role="alert" className="mt-1.5 text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

export function ShopCart() {
  const { base, doctor } = useShop();
  const { quote, empty, isError, isPlaceholderData, refetch } = useQuote();
  const blocked = quote?.lines.some((line) => line.problem) ?? false;
  const count = quote?.lines.reduce((sum, l) => sum + l.quantity, 0) ?? 0;
  const cta = doctor ? "" : "bg-terracotta text-terracotta-foreground not-disabled:hover:bg-terracotta/90";

  return (
    <>
      <PageHero
        eyebrow={doctor ? "Wholesale" : "Medicines"}
        title={doctor ? "Wholesale cart" : "Your cart"}
        description={doctor ? "Check the quantities, then place the order for your practice." : "Check the quantities, then place your order."}
        backHref={base}
      />

      {empty ? (
        <EmptyState bordered size="lg" illustration="cart" title="Your cart is empty" description={doctor ? "Medicines you add for your practice wait here until you are ready to order." : "Medicines you add wait here until you are ready to order."} action={<Button asChild className={cta}><Link href={base}>Browse medicines</Link></Button>} />
      ) : isError ? (
        <EmptyState bordered variant="error" title="Your cart could not be priced" description="Please try again in a moment." onRetry={() => refetch()} />
      ) : !quote ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_22rem]"><Skeleton className="h-72 rounded-xl" /><Skeleton className="h-72 rounded-xl" /></div>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[1fr_22rem]">
          <div className="grid gap-3">
            {quote.wholesale ? (
              <Callout tone="plum" title={`Wholesale order for ${quote.wholesale.businessName}`}>Prices below are your wholesale prices{quote.wholesale.tier ? ` (${quote.wholesale.tier} tier)` : ""}.</Callout>
            ) : null}
            {quote.freeDeliveryFrom !== null ? (
              <SectionCard tone="muted" bodyClassName="px-4 py-3">
                <div className="flex items-center gap-3">
                  <Truck className={cn("size-5 shrink-0", quote.shippingCharge > 0 ? "text-terracotta" : "text-success")} />
                  <div className="min-w-0 flex-1">
                    <ProgressBar
                      value={Math.min(quote.subtotal, quote.freeDeliveryFrom)} max={quote.freeDeliveryFrom} tone="terracotta" gradient size="md"
                      label={quote.shippingCharge > 0 ? <>Add {formatMoney(Math.ceil(quote.freeDeliveryFrom - quote.subtotal))} more for free delivery</> : "Delivery is free on this order"}
                      hint={quote.shippingCharge > 0 ? <Link href={base} className="font-medium text-primary underline-offset-4 hover:underline">Add more</Link> : undefined}
                    />
                  </div>
                </div>
              </SectionCard>
            ) : null}

            <ul className={cn("divide-y divide-foreground/10 rounded-xl border bg-card transition-opacity", isPlaceholderData ? "opacity-70" : "")}>
              {quote.lines.map((line) => (
                <li key={line.variantId} className="flex gap-3 p-3 sm:gap-4 sm:p-4">
                  <Link href={`${base}/${line.slug}`} className="group shrink-0"><ProductImage src={line.imageUrl} name={line.productName} className="size-20 rounded-lg border p-1 text-xl sm:size-24" /></Link>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Link href={`${base}/${line.slug}`} className="line-clamp-2 text-sm font-medium hover:text-primary">{titleCase(line.productName)}</Link>
                    <p className="text-xs text-muted-foreground">{[line.brandName ? titleCase(line.brandName) : null, line.variantTitle].filter(Boolean).join(" · ")}</p>
                    <p className="ledger flex flex-wrap items-baseline gap-x-2 text-sm">
                      <span className="font-semibold"><Money value={line.unitPrice} exact animate={false} /></span>
                      {line.mrp > line.unitPrice ? <Money value={line.mrp} exact animate={false} strike className="text-xs" /> : null}
                      {line.priceNote ? <span className="text-xs text-plum">{line.priceNote}</span> : null}
                    </p>
                    {line.problem ? <p role="alert" className="text-sm font-medium text-destructive">{line.problem}</p> : null}
                    <div className="mt-auto flex flex-wrap items-center gap-3 pt-1">
                      {line.maxQuantity > 0 ? <QuantityStepper variantId={line.variantId} quantity={line.quantity} min={line.minQuantity} max={line.maxQuantity} /> : null}
                      <Button type="button" variant="ghost" size="xs" className="text-muted-foreground hover:text-destructive" onClick={() => cart.remove([line.variantId])}><Trash2 data-icon="inline-start" /> Remove</Button>
                      <span className="font-display ledger ml-auto text-base font-medium"><Money value={line.lineTotal} exact /></span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <SectionCard title="Order summary" eyebrow={`${count} ${count === 1 ? "item" : "items"}`} className="lg:sticky lg:top-20">
            <div className="grid gap-4">
              <CouponBox applied={quote.coupon} error={quote.couponError} />
              <PriceBreakdown quote={quote} />
              {blocked ? <Callout tone="danger" compact>Fix the items marked in red before you check out.</Callout> : null}
              {blocked ? (
                <Button size="lg" className={cta} disabled>Check out</Button>
              ) : (
                <Button asChild size="lg" className={cn("h-11", cta)}><Link href={`${base}/checkout`}>Check out <ArrowRight data-icon="inline-end" /></Link></Button>
              )}
            </div>
          </SectionCard>
        </div>
      )}
    </>
  );
}
