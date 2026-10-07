"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { DetailList } from "@/components/custom/detail-list";
import { Money } from "@/components/custom/number";
import { api } from "@/lib/api";
import { cart, useCart, useCoupon } from "@/lib/cart";
import { formatMoneyExact } from "@/lib/format";
import type { Quote } from "@/lib/shop";

/**
 * The cart priced by the server: live prices, stock, the coupon and delivery.
 * Anything that has been taken off sale since it was added is dropped from the cart.
 */
export function useQuote(paymentMethod: "COD" | "ONLINE" | "CREDIT" = "COD") {
  const { lines } = useCart();
  const couponCode = useCoupon();
  const result = useQuery({
    queryKey: ["shop-quote", lines, couponCode, paymentMethod],
    queryFn: () => api<Quote>("/shop/quote", { method: "POST", body: { lines, couponCode, paymentMethod } }),
    enabled: lines.length > 0,
    placeholderData: (previous) => previous,
    staleTime: 0,
  });
  const removed = result.data?.removed;
  useEffect(() => {
    if (removed?.length) cart.remove(removed);
  }, [removed]);
  return { ...result, quote: lines.length ? result.data : undefined, empty: lines.length === 0, couponCode };
}

/** The money part of an order, set like a ledger: list price, savings, coupon, delivery and what to pay. */
export function PriceBreakdown({ quote }: { quote: Quote }) {
  const saved = quote.savings + (quote.coupon?.discount ?? 0);
  return (
    <DetailList
      items={[
        { label: `MRP (${quote.itemCount} ${quote.itemCount === 1 ? "item" : "items"})`, value: <Money value={quote.mrpTotal} exact animate={false} /> },
        ...(quote.savings > 0 ? [{ label: quote.channel === "B2B" ? "Wholesale discount" : "Discount", value: <Money value={-quote.savings} exact animate={false} />, tone: "success" as const }] : []),
        ...(quote.coupon ? [{ label: `Coupon ${quote.coupon.code}`, value: <Money value={-quote.coupon.discount} exact animate={false} />, tone: "success" as const }] : []),
        { label: "Delivery", value: quote.shippingCharge > 0 ? <Money value={quote.shippingCharge} exact animate={false} /> : "Free", tone: quote.shippingCharge > 0 ? undefined : "success" },
        ...(quote.codCharge > 0 ? [{ label: "Pay on delivery fee", value: <Money value={quote.codCharge} exact animate={false} /> }] : []),
      ]}
      savings={saved > 0 ? `You save ${formatMoneyExact(saved)}` : undefined}
      total={{ label: "To pay", value: <Money value={quote.grandTotal} exact /> }}
    />
  );
}
