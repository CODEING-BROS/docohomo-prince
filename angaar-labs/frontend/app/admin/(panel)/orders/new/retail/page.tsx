"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Minus, Plus, Search, ShoppingCart, Store, Trash2, UserCheck, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { formatMoneyExact, titleCase } from "@/lib/format";
import { STATE_OPTIONS } from "@/lib/india";
import { cn } from "@/lib/utils";
import { ButtonSpinner, Spinner } from "@/components/custom/loaders";

type Payment = "COD" | "UPI" | "BANK" | "CASH";
type SavedAddress = { id: number; line1: string; landmark: string | null; city: string | null; state: string | null; pincode: string | null };
type CustomerHit = { id: number; name: string; phone: string | null; email: string | null; orders: number; addresses: SavedAddress[] };
type Quote = {
  lines: {
    variantId: number; productName: string; variantTitle: string; sku: string; imageUrl: string | null; quantity: number;
    mrp: number; unitPrice: number; lineTotal: number; maxQuantity: number; problem: string | null;
  }[];
  mrpTotal: number; subtotal: number; savings: number; coupon: { code: string; discount: number; description: string | null } | null; couponError: string | null;
  shippingCharge: number; freeDeliveryFrom: number | null; codAvailable: boolean; codCharge: number; grandTotal: number;
};

const PAYMENT_LABEL: Record<Payment, string> = { COD: "Pay on delivery", UPI: "UPI, already paid", BANK: "Bank transfer", CASH: "Cash, already paid" };
const EMPTY_ADDRESS = { line1: "", landmark: "", city: "", state: "", pincode: "" };

export default function NewRetailOrderPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<CustomerHit | null>(null);
  const [customer, setCustomer] = useState({ name: "", phone: "", email: "" });
  const [address, setAddress] = useState(EMPTY_ADDRESS);
  const [lines, setLines] = useState<{ variantId: number; quantity: number }[]>([]);
  const [couponText, setCouponText] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [payment, setPayment] = useState<Payment>("COD");
  const [counter, setCounter] = useState(false);
  const [paid, setPaid] = useState(false);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: matches, isFetching: searching } = useQuery({
    queryKey: ["customer-search", query],
    queryFn: () => api<{ items: CustomerHit[] }>("/admin/orders/customer-search", { query: { q: query } }),
    enabled: query.length >= 3 && !picked,
  });

  const fillAddress = (saved: SavedAddress) => setAddress({ line1: saved.line1, landmark: saved.landmark ?? "", city: saved.city ?? "", state: saved.state ?? "", pincode: saved.pincode ?? "" });
  const pick = (hit: CustomerHit) => {
    setPicked(hit);
    setCustomer({ name: hit.name, phone: hit.phone ?? "", email: hit.email ?? "" });
    if (hit.addresses[0]) fillAddress(hit.addresses[0]);
    setSearch("");
  };
  const unpick = () => { setPicked(null); setCustomer({ name: "", phone: "", email: "" }); setAddress(EMPTY_ADDRESS); };

  const cart = { userId: picked?.id, lines, couponCode, payment, counter };
  const { data: quote, isFetching, error: quoteError } = useQuery({
    queryKey: ["retail-quote", cart],
    queryFn: () => api<Quote>("/admin/orders/retail-quote", { method: "POST", body: cart }),
    enabled: lines.length > 0,
    placeholderData: (previous) => previous,
    retry: false,
  });
  const showQuote = lines.length > 0 ? quote : undefined;

  const addLine = (hit: VariantHit) => setLines((current) => [...current, { variantId: hit.variantId, quantity: 1 }]);
  const setQuantity = (variantId: number, quantity: number) =>
    setLines((current) => current.map((line) => (line.variantId === variantId ? { ...line, quantity: Math.max(1, Math.round(quantity) || 1) } : line)));
  const removeLine = (variantId: number) => setLines((current) => current.filter((line) => line.variantId !== variantId));

  const choosePayment = (next: Payment) => {
    setPayment(next);
    setPaid(next === "UPI" || next === "CASH");
    if (next === "COD") setCounter(false);
  };
  const setCounterSale = (on: boolean) => {
    setCounter(on);
    if (on && payment === "COD") choosePayment("CASH");
    if (on && payment === "BANK") setPaid(true);
  };
  const isPaid = payment === "UPI" || payment === "CASH" || (payment === "BANK" && paid);
  const needsReference = isPaid && payment !== "CASH";

  const create = useMutation({
    mutationFn: () =>
      api<{ id: number; orderNumber: string }>("/admin/orders/retail", {
        method: "POST",
        body: { ...cart, customer, address: counter ? {} : address, paid: isPaid, reference, adminNote: note, expectedTotal: showQuote?.grandTotal },
      }),
    onSuccess: (order) => {
      toast.success(counter ? `Sale ${order.orderNumber} recorded` : `Order ${order.orderNumber} placed. The customer has been told.`);
      ["orders", "dashboard", "notifications", "products", "customers", "inventory"].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
      router.push(`/admin/orders?q=${order.orderNumber}`);
    },
    onError: (err) => { toast.error(err.message); queryClient.invalidateQueries({ queryKey: ["retail-quote"] }); },
  });

  const problems = showQuote?.lines.filter((line) => line.problem) ?? [];
  const codBlocked = payment === "COD" && showQuote && !showQuote.codAvailable;
  const canPlace = Boolean(showQuote) && problems.length === 0 && !codBlocked && !(couponCode && showQuote?.couponError) && !create.isPending;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!counter && !address.state) return toast.error("Choose the state for delivery");
    if (needsReference && !reference.trim()) return toast.error("Enter the UPI or bank reference for the payment");
    create.mutate();
  };

  return (
    <form onSubmit={submit}>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Back to orders"><Link href="/admin/orders"><ArrowLeft /></Link></Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold tracking-tight">New retail order</h1>
          <p className="text-sm text-muted-foreground">
            For a customer who phoned, wrote in, or is at the counter. Retail prices, coupons and delivery charges apply as on the website.{" "}
            <Link href="/admin/orders/new" className="text-primary hover:underline">Wholesale order for a doctor instead</Link>
          </p>
        </div>
        <Button asChild variant="outline" className="h-9"><Link href="/admin/orders">Cancel</Link></Button>
        <Button type="submit" className="h-9" disabled={!canPlace}>
          {create.isPending ? <ButtonSpinner /> : null}{counter ? "Record sale" : "Place order"}{showQuote ? ` · ${formatMoneyExact(showQuote.grandTotal)}` : ""}
        </Button>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-3">
        <div className="grid min-w-0 gap-4 xl:col-span-2">
          <Card>
            <CardHeader><CardTitle>Customer</CardTitle><CardDescription>Find someone who has ordered before, or type the details of a new customer.</CardDescription></CardHeader>
            <CardContent className="grid gap-4">
              {picked ? (
                <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
                  <UserCheck className="size-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{picked.name || "Customer"}</span>
                    <span className="block text-xs text-muted-foreground">{[picked.phone, picked.email, `${picked.orders} ${picked.orders === 1 ? "order" : "orders"} so far`].filter(Boolean).join(" · ")}</span>
                  </span>
                  <Button type="button" variant="ghost" size="sm" onClick={unpick}><X /> Change</Button>
                </div>
              ) : (
                <div className="relative sm:w-96">
                  <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by mobile number or name…" className="h-9 pl-8" />
                  {query.length >= 3 ? (
                    <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border bg-popover p-1 text-sm shadow-md">
                      {searching && !matches ? <li className="flex items-center gap-2 px-2 py-2 text-muted-foreground"><Spinner size="md" /> Searching…</li> : null}
                      {matches?.items.map((hit) => (
                        <li key={hit.id}>
                          <button type="button" onClick={() => pick(hit)} className="w-full rounded-md px-2 py-1.5 text-left hover:bg-surface-2">
                            <span className="font-medium">{hit.name || "No name"}</span>
                            <span className="block text-xs text-muted-foreground">{[hit.phone, hit.email, `${hit.orders} ${hit.orders === 1 ? "order" : "orders"}`].filter(Boolean).join(" · ")}</span>
                          </button>
                        </li>
                      ))}
                      {matches && matches.items.length === 0 ? <li className="px-2 py-2 text-muted-foreground">Nobody found. Fill in the details below for a new customer.</li> : null}
                    </ul>
                  ) : null}
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="grid gap-1.5"><Label htmlFor="customer-name">Name</Label><Input id="customer-name" required minLength={2} maxLength={120} className="h-9" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} /></div>
                <div className="grid gap-1.5">
                  <Label htmlFor="customer-phone">Mobile number</Label>
                  <Input id="customer-phone" required inputMode="numeric" pattern="[6-9][0-9]{9}" maxLength={10} title="A 10-digit mobile number" className="h-9" disabled={Boolean(picked?.phone)} value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value.replace(/\D/g, "") })} />
                </div>
                <div className="grid gap-1.5"><Label htmlFor="customer-email">Email <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="customer-email" type="email" maxLength={160} className="h-9" value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} /></div>
              </div>
              {!picked ? <p className="text-xs text-muted-foreground">If this mobile number has ordered before, the order is added to that customer. Otherwise a new customer is created.</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Products</CardTitle></CardHeader>
            <CardContent className="grid gap-3">
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
                            <p className="truncate text-xs text-muted-foreground">{priced ? [priced.variantTitle, priced.sku].filter(Boolean).join(" · ") : ""}</p>
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
                                {priced.unitPrice < priced.mrp ? <span className="ml-1 line-through">{formatMoneyExact(priced.mrp)}</span> : null}
                              </p>
                            ) : null}
                          </div>
                          <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove from order" onClick={() => removeLine(line.variantId)}><Trash2 /></Button>
                        </div>
                        {priced?.problem ? <p className="mt-2 flex items-center gap-1.5 text-sm text-destructive"><AlertTriangle className="size-4" /> {priced.problem}</p> : null}
                      </li>
                    );
                  })}
                </ul>
              )}
              <VariantPicker onPick={addLine} exclude={lines.map((l) => l.variantId)} className="justify-self-start" />
              {quoteError ? <p className="text-sm text-destructive">{quoteError.message}</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Delivery</CardTitle>
              <CardDescription>{counter ? "Nothing to deliver: the customer takes the goods now." : "Where the parcel goes."}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <label className="flex items-start justify-between gap-3 rounded-lg border p-3 text-sm">
                <span className="flex items-start gap-2.5">
                  <Store className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span>
                    Handed over at the counter
                    <span className="block text-xs text-muted-foreground">No delivery charge. The sale is recorded as delivered and paid, and stock comes off straight away.</span>
                  </span>
                </span>
                <Switch checked={counter} onCheckedChange={setCounterSale} />
              </label>
              {counter ? null : (
                <>
                  {picked && picked.addresses.length > 1 ? (
                    <div className="flex flex-wrap gap-2">
                      {picked.addresses.map((saved) => (
                        <Button key={saved.id} type="button" size="sm" variant={address.line1 === saved.line1 && address.pincode === (saved.pincode ?? "") ? "default" : "outline"} onClick={() => fillAddress(saved)}>
                          {[saved.city, saved.pincode].filter(Boolean).join(" ") || saved.line1.slice(0, 24)}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-1.5 sm:col-span-2">
                      <Label htmlFor="ship-address">House number and street</Label>
                      <Textarea id="ship-address" required minLength={5} maxLength={300} rows={2} value={address.line1} onChange={(e) => setAddress({ ...address, line1: e.target.value })} />
                    </div>
                    <div className="grid gap-1.5"><Label htmlFor="ship-landmark">Landmark <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="ship-landmark" maxLength={120} className="h-9" value={address.landmark} onChange={(e) => setAddress({ ...address, landmark: e.target.value })} /></div>
                    <div className="grid gap-1.5"><Label htmlFor="ship-city">City</Label><Input id="ship-city" required maxLength={80} className="h-9" value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} /></div>
                    <div className="grid gap-1.5"><Label>State</Label><Combobox value={address.state} onChange={(state) => setAddress({ ...address, state })} options={STATE_OPTIONS} allLabel="Choose a state" searchPlaceholder="Search states…" className="w-full" /></div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="ship-pin">Pincode</Label>
                      <Input id="ship-pin" required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} title="A 6-digit pincode" className="h-9" value={address.pincode} onChange={(e) => setAddress({ ...address, pincode: e.target.value.replace(/\D/g, "") })} />
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid min-w-0 gap-4">
          <Card>
            <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {showQuote ? (
                <>
                  {showQuote.savings > 0 ? <div className="flex justify-between text-muted-foreground"><span>At MRP</span><span className="ledger line-through">{formatMoneyExact(showQuote.mrpTotal)}</span></div> : null}
                  <div className="flex justify-between"><span>Products</span><span className="ledger">{formatMoneyExact(showQuote.subtotal)}</span></div>
                  {showQuote.coupon ? <div className="flex justify-between text-success"><span>Coupon {showQuote.coupon.code}</span><span className="ledger">−{formatMoneyExact(showQuote.coupon.discount)}</span></div> : null}
                  <div className="flex justify-between"><span>Delivery</span><span className="ledger">{counter ? "None" : showQuote.shippingCharge ? formatMoneyExact(showQuote.shippingCharge) : "Free"}</span></div>
                  {showQuote.codCharge > 0 ? <div className="flex justify-between"><span>Pay on delivery fee</span><span className="ledger">{formatMoneyExact(showQuote.codCharge)}</span></div> : null}
                  <div className="mt-1 flex justify-between border-t pt-2 text-base font-semibold"><span>Total</span><span className="ledger">{formatMoneyExact(showQuote.grandTotal)}</span></div>
                  {!counter && showQuote.shippingCharge > 0 && showQuote.freeDeliveryFrom ? <p className="text-xs text-muted-foreground">Delivery is free from {formatMoneyExact(showQuote.freeDeliveryFrom)}.</p> : null}
                  {problems.length ? <p className="mt-1 flex items-start gap-1.5 text-destructive"><AlertTriangle className="mt-0.5 size-4 shrink-0" /> Fix the {problems.length === 1 ? "product" : `${problems.length} products`} marked in red first.</p> : null}
                </>
              ) : (
                <p className="text-muted-foreground">Add products to see the total.</p>
              )}
              <div className="mt-2 grid gap-1.5 border-t pt-3">
                <Label htmlFor="coupon">Coupon code <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <div className="flex gap-2">
                  <Input id="coupon" className="h-9 uppercase" maxLength={40} value={couponText} onChange={(e) => setCouponText(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setCouponCode(couponText.trim()); } }} />
                  {couponCode ? (
                    <Button type="button" variant="outline" className="h-9" onClick={() => { setCouponCode(""); setCouponText(""); }}>Remove</Button>
                  ) : (
                    <Button type="button" variant="outline" className="h-9" disabled={!couponText.trim()} onClick={() => setCouponCode(couponText.trim())}>Apply</Button>
                  )}
                </div>
                {couponCode && showQuote?.couponError ? <p className="text-xs text-destructive">{showQuote.couponError}</p> : null}
                {showQuote?.coupon?.description ? <p className="text-xs text-muted-foreground">{showQuote.coupon.description}</p> : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Payment</CardTitle></CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-1.5">
                <Label>How they pay</Label>
                <Select value={payment} onValueChange={(value) => choosePayment(value as Payment)}>
                  <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PAYMENT_LABEL) as Payment[]).map((method) => (
                      <SelectItem key={method} value={method} disabled={method === "COD" && counter}>{PAYMENT_LABEL[method]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {codBlocked ? <p className="text-xs text-destructive">Pay on delivery is not offered for an order of this value. Take the payment first.</p> : null}
                {payment === "COD" ? <p className="text-xs text-muted-foreground">The courier collects the money when the parcel is delivered.</p> : null}
              </div>
              {payment === "BANK" ? (
                <label className="flex items-start gap-2.5 text-sm">
                  <Checkbox className="mt-0.5" checked={paid} disabled={counter} onCheckedChange={(checked) => setPaid(checked === true)} />
                  <span>The transfer has already arrived<span className="block text-xs text-muted-foreground">Left unticked, the order waits as payment pending. Record the payment from the order when it comes.</span></span>
                </label>
              ) : null}
              {isPaid ? (
                <div className="grid gap-1.5">
                  <Label htmlFor="pay-reference">{payment === "CASH" ? "Note (optional)" : "Payment reference"}</Label>
                  <Input id="pay-reference" className="h-9" maxLength={120} required={needsReference} placeholder={payment === "CASH" ? "" : "UPI or bank transaction number"} value={reference} onChange={(e) => setReference(e.target.value)} />
                </div>
              ) : null}
              <div className="grid gap-1.5">
                <Label htmlFor="order-note">Internal note <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Textarea id="order-note" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}
