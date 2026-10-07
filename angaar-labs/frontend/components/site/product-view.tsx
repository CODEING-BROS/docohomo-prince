"use client";

import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, ChevronRight, FileText, MapPin, ShoppingCart, Star, Truck, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Callout } from "@/components/custom/callout";
import { QuantityStepper as Stepper } from "@/components/custom/form-field";
import { LabelTag } from "@/components/custom/label-tag";
import { Money } from "@/components/custom/number";
import { Display, Eyebrow, Mono, Title } from "@/components/custom/typography";
import { ProductCard, ProductImage, QuantityStepper, Stars } from "@/components/site/product-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { cart, useCart } from "@/lib/cart";
import { formatDate, formatMoney, titleCase } from "@/lib/format";
import type { ProductDetail, ProductVariant } from "@/lib/shop";
import { useShop } from "@/lib/shop-paths";
import { cn } from "@/lib/utils";

type Pincode = { pincode: string; deliverable: boolean; codAvailable: boolean; deliveryDays: number | null; city: string | null };

function DeliveryCheck() {
  const [pincode, setPincode] = useState("");
  const [asked, setAsked] = useState("");
  const { data, isFetching } = useQuery({ queryKey: ["shop-pincode", asked], queryFn: () => api<Pincode>(`/shop/pincode/${asked}`), enabled: asked.length === 6 });

  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="mb-2 flex items-center gap-2 text-sm font-medium"><MapPin className="size-4 text-terracotta" /> Check delivery to your pincode</p>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (pincode.length === 6) setAsked(pincode); }}>
        <Input aria-label="Pincode" inputMode="numeric" maxLength={6} placeholder="6-digit pincode" value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))} className="ledger h-9 max-w-40" />
        <Button type="submit" variant="outline" size="lg" loading={isFetching} disabled={pincode.length !== 6}>Check</Button>
      </form>
      {data && asked ? (
        <p className={cn("mt-2 text-sm", data.deliverable ? "text-success" : "text-destructive")}>
          {data.deliverable
            ? `We deliver to ${data.city ? `${data.city} (${data.pincode})` : data.pincode}${data.deliveryDays ? ` in about ${data.deliveryDays} days` : ""}. ${data.codAvailable ? "Pay on delivery is available." : "Online payment only."}`
            : `Sorry, we do not deliver to ${data.pincode} yet.`}
        </p>
      ) : null}
    </div>
  );
}

/** Pack buttons. Medicines sold in several potencies and several sizes get one row for each. */
function VariantPicker({ variants, chosen, onChoose }: { variants: ProductVariant[]; chosen: ProductVariant; onChoose: (variant: ProductVariant) => void }) {
  if (variants.length <= 1) return null;
  const potencies = [...new Set(variants.map((v) => v.potency).filter(Boolean))] as string[];
  const packs = [...new Set(variants.map((v) => v.packSize).filter(Boolean))] as string[];
  const chip = (active: boolean, available: boolean) =>
    cn("rounded-lg border px-3 py-2 text-left text-sm transition-colors", active ? "border-primary/40 bg-primary-soft ring-1 ring-primary/40" : "hover:border-foreground/30 hover:bg-surface-2", available ? "" : "opacity-50");

  if (potencies.length > 1 && packs.length > 1 && variants.every((v) => v.potency && v.packSize)) {
    const inPotency = variants.filter((v) => v.potency === chosen.potency);
    return (
      <div className="grid gap-3">
        <div>
          <Eyebrow className="mb-1.5">Potency · <span className="text-foreground">{chosen.potency}</span></Eyebrow>
          <div className="flex flex-wrap gap-2">
            {potencies.map((potency) => {
              const options = variants.filter((v) => v.potency === potency);
              return (
                <button key={potency} type="button" aria-pressed={potency === chosen.potency} className={chip(potency === chosen.potency, options.some((v) => v.inStock))}
                  onClick={() => onChoose(options.find((v) => v.packSize === chosen.packSize && v.inStock) ?? options.find((v) => v.inStock) ?? options[0])}>
                  {potency}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <Eyebrow className="mb-1.5">Pack size · <span className="text-foreground">{chosen.packSize}</span></Eyebrow>
          <div className="flex flex-wrap gap-2">
            {inPotency.map((variant) => (
              <button key={variant.id} type="button" aria-pressed={variant.id === chosen.id} className={chip(variant.id === chosen.id, variant.inStock)} onClick={() => onChoose(variant)}>
                <span className="block font-medium">{variant.packSize}</span>
                <span className="ledger block text-xs text-muted-foreground">{variant.inStock ? formatMoney(variant.wholesale?.unitPrice ?? variant.price) : "Out of stock"}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Eyebrow className="mb-1.5">Choose a pack</Eyebrow>
      <div className="flex flex-wrap gap-2">
        {variants.map((variant) => (
          <button key={variant.id} type="button" aria-pressed={variant.id === chosen.id} className={chip(variant.id === chosen.id, variant.inStock)} onClick={() => onChoose(variant)}>
            <span className="block font-medium">{variant.title}</span>
            <span className="ledger block text-xs text-muted-foreground">{variant.inStock ? formatMoney(variant.wholesale?.unitPrice ?? variant.price) : "Out of stock"}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Details({ title, text }: { title: string; text: string | null }) {
  if (!text?.trim()) return null;
  return (
    <section className="border-t border-foreground/10 py-5 first:border-t-0 first:pt-0">
      <Title as="h2" className="mb-2">{title}</Title>
      <p className="text-sm leading-6 text-pretty whitespace-pre-line text-muted-foreground">{text}</p>
    </section>
  );
}

export function ProductView({ product }: { product: ProductDetail }) {
  const { base } = useShop();
  const router = useRouter();
  const { quantityOf } = useCart();
  const firstChoice = product.variants.find((v) => v.isDefault && v.inStock) ?? product.variants.find((v) => v.inStock) ?? product.variants[0];
  const [variantId, setVariantId] = useState(firstChoice.id);
  const variant = product.variants.find((v) => v.id === variantId) ?? firstChoice;
  const [imageIndex, setImageIndex] = useState(0);
  const [wanted, setWanted] = useState(1);

  const name = titleCase(product.name);
  const images = product.images.length ? product.images : [{ url: "", altText: null, variantId: null }];
  const image = images[Math.min(imageIndex, images.length - 1)];
  const wholesale = variant.wholesale && variant.wholesale.unitPrice < variant.price ? variant.wholesale : null;
  const price = wholesale?.unitPrice ?? variant.price;
  const inCart = quantityOf(variant.id);
  const quantity = Math.min(Math.max(wanted, variant.minQuantity), variant.maxQuantity);

  const choose = (next: ProductVariant) => {
    setVariantId(next.id);
    setWanted(next.minQuantity);
    const own = images.findIndex((img) => img.variantId === next.id); // show that pack's own photo when it has one
    if (own >= 0) setImageIndex(own);
  };
  const add = () => { cart.add(variant.id, quantity); toast.success("Added to your cart"); };

  return (
    <>
      <nav aria-label="You are here" className="mb-4 flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        <Link href={base} className="hover:text-foreground">Order medicines</Link>
        {product.trail.map((step) => (
          <span key={step.slug} className="flex items-center gap-1"><ChevronRight className="size-3.5" /><Link href={`${base}?category=${step.slug}`} className="hover:text-foreground">{titleCase(step.name)}</Link></span>
        ))}
      </nav>

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,26rem)_1fr]">
        <div className="lg:sticky lg:top-20">
          <div className="group relative">
            <ProductImage src={image.url || null} name={name} className="aspect-square w-full rounded-2xl border p-6 text-6xl" />
            <span className="absolute top-3 left-3 flex flex-col items-start gap-1">
              {variant.mrp > price && Math.round((1 - price / variant.mrp) * 100) >= 5 ? <LabelTag tone="terracotta" variant="sticker" size="sm">{Math.round((1 - price / variant.mrp) * 100)}% off</LabelTag> : null}
              {product.requiresPrescription ? <LabelTag variant="stamp" tilt={false}>Rx</LabelTag> : null}
            </span>
          </div>
          {images.length > 1 ? (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {images.map((img, index) => (
                <button key={`${img.url}-${index}`} type="button" aria-label={`Photo ${index + 1}`} aria-pressed={index === imageIndex} onClick={() => setImageIndex(index)}
                  className={cn("shrink-0 rounded-lg border p-0.5 transition-colors", index === imageIndex ? "border-primary ring-1 ring-primary" : "hover:border-foreground/30")}>
                  <ProductImage src={img.url} name={name} className="size-16 rounded-md text-base" />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="grid min-w-0 gap-5">
          <div>
            {product.brand ? <Link href={`${base}?brand=${product.brand.slug}`} className="text-[0.6875rem] font-semibold tracking-[0.12em] text-primary uppercase underline-offset-4 hover:underline">{product.brand.name}</Link> : null}
            <Display level={1} className="mt-1 text-3xl">{name}</Display>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <Stars rating={product.ratingAverage} count={product.ratingCount} />
              {product.form ? <span>{product.form}</span> : null}
              <span>{variant.title}</span>
            </div>
          </div>

          <div>
            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-display ledger text-4xl font-medium [font-variation-settings:'opsz'_48]"><Money value={price} /></span>
              {variant.mrp > price ? <span className="ledger text-base text-muted-foreground line-through">MRP {formatMoney(variant.mrp)}</span> : null}
              {variant.mrp > price ? <span className="ledger rounded-sm bg-(image:--gradient-terracotta) px-1.5 py-0.5 text-xs font-semibold text-terracotta-foreground">You save {formatMoney(variant.mrp - price)}</span> : null}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">Inclusive of all taxes</p>
            {wholesale ? (
              <Callout tone="plum" compact className="mt-2">
                <span className="font-medium">Your wholesale price.</span> Retail price {formatMoney(variant.price)}. {wholesale.source}.{variant.minQuantity > 1 ? ` Minimum ${variant.minQuantity} packs.` : ""}
              </Callout>
            ) : null}
          </div>

          <VariantPicker variants={product.variants} chosen={variant} onChoose={choose} />

          {variant.inStock ? (
            <div className="grid gap-3">
              {variant.stockLeft ? <p className="flex items-center gap-1.5 text-sm font-medium text-warning"><span className="size-1.5 animate-pulse rounded-full bg-warning" /> Only {variant.stockLeft} left in stock</p> : null}
              {inCart > 0 ? (
                <div className="flex flex-wrap items-center gap-3">
                  <QuantityStepper variantId={variant.id} quantity={inCart} min={variant.minQuantity} max={variant.maxQuantity} size="md" />
                  <span className="text-sm text-muted-foreground">in your cart</span>
                  <Button asChild size="lg" className="h-10"><Link href={`${base}/cart`}><ShoppingCart data-icon="inline-start" /> Go to cart</Link></Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <Stepper value={quantity} min={variant.minQuantity} max={variant.maxQuantity} size="lg" labelNoun="pack" onChange={setWanted} />
                  <Button variant="outline" size="lg" className="h-10 border-primary/50 text-primary not-disabled:hover:bg-primary-soft not-disabled:hover:text-primary" onClick={add}><ShoppingCart data-icon="inline-start" /> Add to cart</Button>
                  <Button size="lg" className="h-10 bg-terracotta text-terracotta-foreground not-disabled:hover:bg-terracotta/90" onClick={() => { cart.add(variant.id, quantity); router.push(`${base}/checkout`); }}><Zap data-icon="inline-start" /> Buy now</Button>
                </div>
              )}
            </div>
          ) : (
            <Callout tone="neutral">This pack is out of stock right now.{product.variants.some((v) => v.inStock) ? " Another pack is available above." : ""}</Callout>
          )}

          {product.requiresPrescription ? (
            <Callout tone="warning" icon={FileText} compact>Sold on prescription only.</Callout>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <DeliveryCheck />
            <div className="flex items-start gap-2 rounded-xl border bg-card p-3 text-sm">
              <Truck className="mt-0.5 size-4 shrink-0 text-primary" />
              <span><span className="font-medium">Delivery across India.</span> <span className="text-muted-foreground">Pay online or when it arrives. Genuine, sealed medicines from the manufacturer.</span></span>
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-5">
            <Details title="About this product" text={product.description ?? product.shortDescription} />
            <Details title="What it is used for" text={product.indications} />
            <Details title="What it contains" text={product.composition} />
            <Details title="How to take it" text={product.directions} />
            <Details title="Safety information" text={product.safetyInfo} />
            {product.manufacturer || product.countryOfOrigin || product.brand ? (
              <section className="border-t border-foreground/10 py-5 first:border-t-0 first:pt-0 last:pb-0">
                <Title as="h2" className="mb-2">More details</Title>
                <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
                  {product.brand ? <><dt className="text-muted-foreground">Brand</dt><dd>{titleCase(product.brand.name)}</dd></> : null}
                  {product.manufacturer ? <><dt className="text-muted-foreground">Made by</dt><dd>{product.manufacturer}</dd></> : null}
                  {product.countryOfOrigin ? <><dt className="text-muted-foreground">Country of origin</dt><dd>{product.countryOfOrigin}</dd></> : null}
                  {product.form ? <><dt className="text-muted-foreground">Type</dt><dd>{product.form}</dd></> : null}
                  <dt className="text-muted-foreground">Product code</dt><dd><Mono>{variant.sku}</Mono></dd>
                </dl>
              </section>
            ) : null}
          </div>

          {product.reviews.length ? (
            <section>
              <Title as="h2" className="mb-3">What customers say</Title>
              <div className="grid gap-3">
                {product.reviews.map((review) => (
                  <article key={review.id} className="rounded-xl border bg-card p-4">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="ledger inline-flex items-center gap-0.5 rounded-sm bg-[color-mix(in_oklch,var(--success)_14%,transparent)] px-1.5 py-0.5 text-xs font-medium text-success"><Star className="size-3 fill-current" />{review.rating}</span>
                      <span className="font-medium">{review.title ?? review.authorName ?? "Customer"}</span>
                      {review.isVerifiedBuyer ? <span className="inline-flex items-center gap-1 text-xs text-success"><BadgeCheck className="size-3.5" /> Bought this</span> : null}
                    </div>
                    {review.body ? <p className="mt-2 text-sm whitespace-pre-line text-muted-foreground">{review.body}</p> : null}
                    <p className="mt-2 text-xs text-muted-foreground">{review.title && review.authorName ? `${review.authorName} · ` : ""}{formatDate(review.createdAt)}</p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>

      {product.related.length ? (
        <section className="mt-10">
          <Title as="h2" className="mb-3">More like this</Title>
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
            {product.related.map((card) => <ProductCard key={card.id} product={card} className="w-44 shrink-0 snap-start sm:w-52" />)}
          </div>
        </section>
      ) : null}
    </>
  );
}
