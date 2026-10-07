"use client";

import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api } from "@/lib/api";
import { formatMoney, titleCase } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/custom/loaders";

/** One sellable pack of a product, as returned by the search. */
export type VariantHit = {
  variantId: number; productId: number; productName: string; brandName: string | null; title: string; sku: string;
  sellingPrice: number; b2bPrice: number | null; stock: number; minimumQuantity: number;
};

/**
 * Finds a product pack by name or SKU. The list is searched on the server as you type,
 * because there are thousands of packs.
 */
export function VariantPicker({
  onPick, label = "Add a product", exclude = [], className,
}: { onPick: (variant: VariantHit) => void; label?: string; exclude?: number[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), 250);
    return () => clearTimeout(timer);
  }, [text]);

  const { data, isFetching } = useQuery({
    queryKey: ["variant-search", query],
    queryFn: () => api<{ items: VariantHit[] }>("/admin/orders/variant-search", { query: { q: query } }),
    enabled: open,
    placeholderData: (previous) => previous,
  });
  const items = (data?.items ?? []).filter((item) => !exclude.includes(item.variantId));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className={cn("h-9 justify-start gap-2 font-normal", className)}>
          <Plus className="size-4" /> {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(32rem,calc(100vw-2rem))] p-0">
        <Command shouldFilter={false}>
          <CommandInput value={text} onValueChange={setText} placeholder="Type a product name or SKU…" />
          <CommandList className="max-h-72 overflow-y-auto">
            {isFetching && items.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground"><Spinner size="md" /> Searching…</div>
            ) : (
              <CommandEmpty>No product matches.</CommandEmpty>
            )}
            <CommandGroup>
              {items.map((item) => (
                <CommandItem
                  key={item.variantId}
                  value={String(item.variantId)}
                  onSelect={() => {
                    onPick(item);
                    setOpen(false);
                    setText("");
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{titleCase(item.productName)}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[item.title, item.sku, item.brandName ? titleCase(item.brandName) : null].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block ledger">{formatMoney(item.sellingPrice)}</span>
                    <span className={cn("block text-xs", item.stock > 0 ? "text-muted-foreground" : "text-destructive")}>
                      {item.stock > 0 ? `${item.stock} in stock` : "Out of stock"}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
