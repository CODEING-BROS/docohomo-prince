"use client";

import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ProductImage } from "@/components/site/product-card";
import { api } from "@/lib/api";
import { formatMoney, titleCase } from "@/lib/format";
import { useShop } from "@/lib/shop-paths";
import { cn } from "@/lib/utils";

type Suggestions = {
  products: { name: string; slug: string; brandName: string | null; imageUrl: string | null; price: number }[];
  categories: { name: string; slug: string }[];
  brands: { name: string; slug: string }[];
};

/** The shop's search box: offers matching medicines, categories and brands while you type. */
export function SearchBox({ className }: { className?: string }) {
  const { base } = useShop();
  const router = useRouter();
  const box = useRef<HTMLFormElement>(null);
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), 200);
    return () => clearTimeout(timer);
  }, [text]);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const { data } = useQuery({
    queryKey: ["shop-suggest", query],
    queryFn: () => api<Suggestions>("/shop/suggest", { query: { q: query } }),
    enabled: query.length >= 2,
    placeholderData: (previous) => previous,
  });
  const hasAny = data && (data.products.length > 0 || data.categories.length > 0 || data.brands.length > 0);
  const show = open && query.length >= 2 && data;
  const done = () => setOpen(false);

  return (
    <form ref={box} role="search" className={cn("relative", className)}
      onSubmit={(event) => { event.preventDefault(); if (text.trim()) { done(); router.push(`${base}?q=${encodeURIComponent(text.trim())}`); } }}>
      <Search className="pointer-events-none absolute top-1/2 left-4 size-4.5 -translate-y-1/2 text-muted-foreground" />
      <input type="search" value={text} aria-label="Search medicines" placeholder="Search medicines, brands and health problems"
        onChange={(event) => { setText(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        onKeyDown={(event) => { if (event.key === "Escape") done(); }}
        className="h-12 w-full rounded-full border border-foreground/18 bg-card pr-5 pl-11 text-base text-foreground shadow-float outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/40 [&::-webkit-search-cancel-button]:hidden" />
      {show ? (
        <div className="scroll-thin absolute inset-x-0 top-full z-30 mt-2 max-h-[70vh] overflow-y-auto rounded-xl border bg-popover p-2 text-popover-foreground shadow-float">
          {!hasAny ? <p className="px-2 py-3 text-sm text-muted-foreground">Nothing matches “{query}”. Check the spelling or try a shorter word.</p> : null}
          {data.categories.length + data.brands.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 px-1 pb-2">
              {data.categories.map((c) => <Link key={`c-${c.slug}`} href={`${base}?category=${c.slug}`} onClick={done} className="rounded-full border border-foreground/18 px-2.5 py-1 text-xs transition-colors hover:border-primary hover:bg-primary-soft hover:text-primary">{titleCase(c.name)}</Link>)}
              {data.brands.map((b) => <Link key={`b-${b.slug}`} href={`${base}?brand=${b.slug}`} onClick={done} className="rounded-full border border-foreground/18 px-2.5 py-1 text-xs transition-colors hover:border-primary hover:bg-primary-soft hover:text-primary">{titleCase(b.name)} <span className="text-muted-foreground">brand</span></Link>)}
            </div>
          ) : null}
          {data.products.map((product) => (
            <Link key={product.slug} href={`${base}/${product.slug}`} onClick={done} className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-[background-color,box-shadow] hover:bg-surface-3 hover:shadow-[inset_3px_0_0_var(--terracotta)]">
              <ProductImage src={product.imageUrl} name={product.name} className="size-10 shrink-0 rounded-md border text-sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{titleCase(product.name)}</span>
                {product.brandName ? <span className="block truncate text-xs text-muted-foreground">{titleCase(product.brandName)}</span> : null}
              </span>
              <span className="ledger shrink-0 text-sm font-medium">{formatMoney(product.price)}</span>
            </Link>
          ))}
          {hasAny ? <button type="submit" className="mt-1 w-full rounded-lg px-2 py-2 text-left text-sm font-medium text-primary hover:bg-surface-2">See everything for “{query}”</button> : null}
        </div>
      ) : null}
    </form>
  );
}
