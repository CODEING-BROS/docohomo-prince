"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Combobox } from "@/components/admin/combobox";
import { Thumb } from "@/components/admin/parts";
import { type VariantHit, VariantPicker } from "@/components/admin/variant-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { formatMoneyExact, titleCase } from "@/lib/format";
import { STATE_OPTIONS } from "@/lib/india";
import type { B2BAccountRow, Paged } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ButtonSpinner } from "@/components/custom/loaders";

type PaymentMethod = "ONLINE" | "BANK_TRANSFER" | "CREDIT" | "COD";

type Quote = {
  account: { id: number; businessName: string; contactName: string | null; tier: { name: string; discountPercent: number } | null; creditLimit: number; creditDays: number };
  lines: {
    variantId: number; productName: string; variantTitle: string; sku: string; brandName: string | null; imageUrl: string | null;
    quantity: number; mrp: number; retailPrice: number; unitPrice: number; lineTotal: number; source: string;
    stock: number; minimumQuantity: number; problem: string | null;
  }[];
  retailTotal: number; subtotal: number; savings: number; shippingCharge: number; shippingRule: string | null; grandTotal: number;
};

/** The address fields of a B2B account, fetched when the customer is picked. */
type AccountAddress = { addressLine: string | null; city: string | null; state: string | null; pincode: string | null };

const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  BANK_TRANSFER: "Bank transfer", ONLINE: "Online payment", CREDIT: "On credit", COD: "Cash on delivery",
};

export default function NewOrderPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [accountId, setAccountId] = useState("");
  const [lines, setLines] = useState<{ variantId: number; quantity: number }[]>([]);
  const [payment, setPayment] = useState<PaymentMethod>("BANK_TRANSFER");
  const [paid, setPaid] = useState(false);
  const [address, setAddress] = useState({ shippingAddress: "", shippingCity: "", shippingState: "", shippingPincode: "" });
  const [note, setNote] = useState("");

  const { data: accounts } = useQuery({
    queryKey: ["b2b", "approved-for-order"],
    queryFn: () => api<Paged<B2BAccountRow & AccountAddress>>("/admin/b2b", { query: { status: "APPROVED", pageSize: 500 } }),
  });
  const accountOptions = useMemo(
    () => (accounts?.items ?? []).map((a) => ({ value: String(a.id), label: a.name, hint: [a.businessName !== a.name ? a.businessName : null, a.city].filter(Boolean).join(" · ") || undefined })),
    [accounts],
  );

  const pickAccount = (id: string) => {
    setAccountId(id);
    const account = accounts?.items.find((a) => String(a.id) === id);
    // start from the clinic address; it can be changed for this order
    setAddress({ shippingAddress: account?.addressLine ?? "", shippingCity: account?.city ?? "", shippingState: account?.state ?? "", shippingPincode: account?.pincode ?? "" });
    if (account && account.creditLimit === 0 && payment === "CREDIT") setPayment("BANK_TRANSFER");
  };

  const cart = { b2bAccountId: Number(accountId), lines };
  const { data: quote, isFetching, error: quoteError } = useQuery({
    queryKey: ["order-quote", cart],
    queryFn: () => api<Quote>("/admin/orders/quote", { method: "POST", body: cart }),
    enabled: Boolean(accountId) && lines.length > 0,
    placeholderData: (previous) => previous,
    retry: false,
  });
  const showQuote = accountId && lines.length > 0 ? quote : undefined;

  const addLine = (hit: VariantHit) => setLines((current) => [...current, { variantId: hit.variantId, quantity: Math.max(1, hit.minimumQuantity) }]);
  const setQuantity = (variantId: number, quantity: number) =>
    setLines((current) => current.map((line) => (line.variantId === variantId ? { ...line, quantity: Math.max(1, Math.round(quantity) || 1) } : line)));
  const removeLine = (variantId: number) => setLines((current) => current.filter((line) => line.variantId !== variantId));

  const create = useMutation({
    mutationFn: () => api<{ id: number; orderNumber: string }>("/admin/orders", { method: "POST", body: { ...cart, paymentMethod: payment, paid, ...address, adminNote: note } }),
    onSuccess: (order) => {
      toast.success(`Order ${order.orderNumber} placed`);
      ["orders", "dashboard", "notifications", "products", "b2b"].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
      router.push(`/admin/orders?q=${order.orderNumber}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const problems = showQuote?.lines.filter((line) => line.problem) ?? [];
  const creditLimit = showQuote?.account.creditLimit ?? 0;
  const canPlace = Boolean(showQuote) && problems.length === 0 && !create.isPending;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!address.shippingState) return toast.error("Choose the state for delivery");
    create.mutate();
  };

  return (
    <form onSubmit={submit}>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Back to orders"><Link href="/admin/orders"><ArrowLeft /></Link></Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold tracking-tight">New B2B order</h1>
          <p className="text-sm text-muted-foreground">
            Place a wholesale order for a doctor. Prices follow their tier and your discount rules.{" "}
            <Link href="/admin/orders/new/retail" className="text-primary hover:underline">Retail order for a customer instead</Link>
          </p>
        </div>
        <Button asChild variant="outline" className="h-9"><Link href="/admin/orders">Cancel</Link></Button>
        <Button type="submit" className="h-9" disabled={!canPlace}>
          {create.isPending ? <ButtonSpinner /> : null}Place order{showQuote ? ` · ${formatMoneyExact(showQuote.grandTotal)}` : ""}
        </Button>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-3">
        <div className="grid min-w-0 gap-4 xl:col-span-2">
          <Card>
            <CardHeader><CardTitle>B2B customer</CardTitle><CardDescription>Only approved doctors are listed.</CardDescription></CardHeader>
            <CardContent className="grid gap-3">
              <Combobox
                value={accountId} onChange={pickAccount} options={accountOptions}
                allLabel={accountOptions.length ? "Choose a doctor" : "No approved B2B customers yet"} searchPlaceholder="Search doctors…" className="w-full sm:w-96"
              />
              {accountOptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Add one on the <Link href="/admin/b2b/new" className="text-primary hover:underline">B2B customers</Link> page first.
                </p>
              ) : null}
              {showQuote || (accountId && quote) ? (
                <p className="text-sm text-muted-foreground">
                  {(showQuote ?? quote)!.account.tier ? `${(showQuote ?? quote)!.account.tier!.name} tier, ${(showQuote ?? quote)!.account.tier!.discountPercent}% standard discount.` : "No price tier set."}{" "}
                  {creditLimit > 0 ? `Credit limit ${formatMoneyExact(creditLimit)}.` : "No credit: pays before dispatch."}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Products</CardTitle></CardHeader>
            <CardContent className="grid gap-3">
              {!accountId ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Choose the customer first, so the right prices can be shown.</p>
              ) : (
                <>
                  {lines.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-6 text-center">
                      <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground"><ShoppingCart className="size-5" /></span>
                      <p className="text-sm text-muted-foreground">Nothing in this order yet.</p>
                    </div>
                  ) : (
                    <ul className={cn("grid gap-2", isFetching && "opacity-70")}>
                      {lines.map((line) => {
                        const priced = showQuote?.lines.find((l) => l.variantId === line.variantId);
                        return (
                          <li key={line.variantId} className={cn("rounded-lg border p-3", priced?.problem && "border-destructive/50")}>
                            <div className="flex flex-wrap items-start gap-3">
                              <Thumb src={priced?.imageUrl ?? null} name={priced?.productName ?? "?"} />
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-medium">{priced ? titleCase(priced.productName) : "Loading…"}</p>
                                <p className="truncate text-xs text-muted-foreground">{priced ? [priced.variantTitle, priced.sku, `${priced.stock} in stock`].join(" · ") : ""}</p>
                                {priced ? <p className="mt-1 text-xs text-muted-foreground">{priced.source}</p> : null}
                              </div>
                              <div className="flex items-center gap-1">
                                <Button type="button" variant="outline" size="icon-sm" aria-label="One less" disabled={line.quantity <= 1} onClick={() => setQuantity(line.variantId, line.quantity - 1)}><Minus /></Button>
                                <Input aria-label="Quantity" type="number" min="1" step="1" inputMode="numeric" className="h-8 w-16 text-center ledger" value={line.quantity} onChange={(e) => setQuantity(line.variantId, Number(e.target.value))} />
                                <Button type="button" variant="outline" size="icon-sm" aria-label="One more" onClick={() => setQuantity(line.variantId, line.quantity + 1)}><Plus /></Button>
                              </div>
                              <div className="w-28 text-right ledger">
                                <p className="font-medium">{priced ? formatMoneyExact(priced.lineTotal) : "—"}</p>
                                {priced ? (
                                  <p className="text-xs text-muted-foreground">
                                    {formatMoneyExact(priced.unitPrice)} each
                                    {priced.unitPrice < priced.retailPrice ? <span className="ml-1 line-through">{formatMoneyExact(priced.retailPrice)}</span> : null}
                                  </p>
                                ) : null}
                              </div>
                              <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove from order" onClick={() => removeLine(line.variantId)}><Trash2 /></Button>
                            </div>
                            {priced?.problem ? (
                              <p className="mt-2 flex items-center gap-1.5 text-sm text-destructive"><AlertTriangle className="size-4" /> {priced.problem}</p>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <VariantPicker onPick={addLine} exclude={lines.map((l) => l.variantId)} className="justify-self-start" />
                  {quoteError ? <p className="text-sm text-destructive">{quoteError.message}</p> : null}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Deliver to</CardTitle><CardDescription>Filled in from the clinic address. Change it if this order goes elsewhere.</CardDescription></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="ship-address">Address</Label>
                <Textarea id="ship-address" required rows={2} value={address.shippingAddress} onChange={(e) => setAddress({ ...address, shippingAddress: e.target.value })} />
              </div>
              <div className="grid gap-1.5"><Label htmlFor="ship-city">City</Label><Input id="ship-city" required value={address.shippingCity} onChange={(e) => setAddress({ ...address, shippingCity: e.target.value })} /></div>
              <div className="grid gap-1.5"><Label>State</Label><Combobox value={address.shippingState} onChange={(v) => setAddress({ ...address, shippingState: v })} options={STATE_OPTIONS} allLabel="Choose a state" searchPlaceholder="Search states…" className="w-full" /></div>
              <div className="grid gap-1.5">
                <Label htmlFor="ship-pin">Pincode</Label>
                <Input id="ship-pin" required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} title="A 6-digit pincode" value={address.shippingPincode} onChange={(e) => setAddress({ ...address, shippingPincode: e.target.value.replace(/\D/g, "") })} />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid min-w-0 gap-4">
          <Card>
            <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {showQuote ? (
                <>
                  <div className="flex justify-between text-muted-foreground"><span>At retail prices</span><span className="ledger line-through">{formatMoneyExact(showQuote.retailTotal)}</span></div>
                  <div className="flex justify-between text-success"><span>Wholesale saving</span><span className="ledger">−{formatMoneyExact(showQuote.savings)}</span></div>
                  <div className="flex justify-between"><span>Products</span><span className="ledger">{formatMoneyExact(showQuote.subtotal)}</span></div>
                  <div className="flex justify-between"><span>Delivery{showQuote.shippingRule ? ` (${showQuote.shippingRule})` : ""}</span><span className="ledger">{showQuote.shippingCharge ? formatMoneyExact(showQuote.shippingCharge) : "Free"}</span></div>
                  <div className="mt-1 flex justify-between border-t pt-2 text-base font-semibold"><span>Total</span><span className="ledger">{formatMoneyExact(showQuote.grandTotal)}</span></div>
                  {problems.length ? (
                    <p className="mt-1 flex items-start gap-1.5 text-destructive"><AlertTriangle className="mt-0.5 size-4 shrink-0" /> Fix the {problems.length === 1 ? "product" : `${problems.length} products`} marked in red before placing the order.</p>
                  ) : null}
                </>
              ) : (
                <p className="text-muted-foreground">Choose a customer and add products to see the total.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Payment</CardTitle></CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-1.5">
                <Label>How they pay</Label>
                <Select value={payment} onValueChange={(v) => { setPayment(v as PaymentMethod); if (v === "CREDIT") setPaid(false); }}>
                  <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((method) => (
                      <SelectItem key={method} value={method} disabled={method === "CREDIT" && creditLimit === 0}>
                        {PAYMENT_LABEL[method]}{method === "CREDIT" && creditLimit === 0 ? " (no credit limit)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {payment === "CREDIT" && showQuote ? <p className="text-xs text-muted-foreground">Due within {showQuote.account.creditDays} days of the order.</p> : null}
              </div>
              {payment === "CREDIT" ? null : (
                <label className="flex items-start gap-2.5 text-sm">
                  <Checkbox className="mt-0.5" checked={paid} onCheckedChange={(checked) => setPaid(checked === true)} />
                  <span>Payment already received<span className="block text-xs text-muted-foreground">Left unticked, the order shows as payment pending.</span></span>
                </label>
              )}
              <div className="grid gap-1.5">
                <Label htmlFor="order-note">Internal note <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Textarea id="order-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}
