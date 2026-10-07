"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Banknote, CreditCard, Lock, Minus, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/parts";
import { AddressFields, type AddressForm, addressLine, blankAddress, fromSaved } from "@/components/patient/address-fields";
import { PriceBreakdown } from "@/components/site/order-summary";
import { ProductImage } from "@/components/site/product-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";
import type { MyPrescription } from "@/lib/care";
import { formatMoneyExact, titleCase } from "@/lib/format";
import type { Quote, SavedAddress } from "@/lib/shop";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/custom/loaders";

type Method = "COD" | "ONLINE";
type Line = { variantId: number; quantity: number };

/** Ordering the medicines on one prescription: check the items, choose where and how to pay. */
function Checkout() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const prescriptionId = Number(useSearchParams().get("prescription"));
  const { user } = useSession();
  const [edited, setEdited] = useState<Line[] | null>(null); // null until the patient changes a quantity
  const [method, setMethod] = useState<Method>("COD");
  const [couponText, setCouponText] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [addressId, setAddressId] = useState<number | "new" | null>(null); // null = not chosen yet, use the usual one
  const [form, setForm] = useState<AddressForm>(blankAddress);
  const [note, setNote] = useState("");
  const [placed, setPlaced] = useState(false);

  const prescriptions = useQuery({ queryKey: ["my-prescriptions"], queryFn: () => api<{ items: MyPrescription[] }>("/me/prescriptions") });
  const prescription = prescriptions.data?.items.find((p) => p.id === prescriptionId) ?? null;
  const leftOut = prescription ? prescription.items.filter((item) => !item.buy?.inStock) : [];
  const fromPrescription: Line[] = prescription ? prescription.items.filter((item) => item.buy?.inStock).map((item) => ({ variantId: item.buy!.variantId, quantity: item.quantity })) : [];
  const lines = edited ?? fromPrescription;

  const { data: quote, isFetching } = useQuery({
    queryKey: ["shop-quote", lines, couponCode, method],
    queryFn: () => api<Quote>("/shop/quote", { method: "POST", body: { lines, couponCode, paymentMethod: method } }),
    enabled: lines.length > 0,
    placeholderData: (previous) => previous,
    staleTime: 0,
  });
  const { data: saved, isPending: addressesLoading } = useQuery({ queryKey: ["my-addresses"], queryFn: () => api<{ items: SavedAddress[] }>("/me/addresses") });
  const addresses = saved?.items ?? [];
  const chosenId = addressId ?? (addresses[0]?.id ?? "new");
  const chosen = chosenId === "new" ? null : addresses.find((a) => a.id === chosenId) ?? null;
  // a new address starts with what we already know about the person
  const newForm: AddressForm = { ...form, fullName: form.fullName || [user?.firstName, user?.lastName].filter(Boolean).join(" "), phone: form.phone || user?.phone?.replace(/^\+?91/, "").slice(-10) || "" };
  const address = chosen ? fromSaved(chosen) : newForm;

  const setQuantity = (variantId: number, quantity: number) => setEdited(lines.map((l) => (l.variantId === variantId ? { ...l, quantity: Math.max(1, quantity) } : l)));
  const remove = (variantId: number) => setEdited(lines.filter((l) => l.variantId !== variantId));

  const place = useMutation({
    mutationFn: () =>
      api<{ id: number; orderNumber: string; paid: boolean; payUrl: string | null }>("/me/checkout", {
        method: "POST",
        body: { lines, couponCode, paymentMethod: method, address, saveAddress: true, note, expectedTotal: quote?.grandTotal, prescriptionId },
      }),
    onSuccess: (order) => {
      setPlaced(true);
      ["my-prescriptions", "my-orders", "my-addresses", "patient-overview"].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
      // paying online: straight on to the gateway's page; it sends the patient back to the order afterwards
      if (order.payUrl) return window.location.assign(order.payUrl);
      router.push(method === "ONLINE" && !order.paid ? `/patient/orders/${order.id}?payment=failed` : `/patient/orders/${order.id}?placed=1`);
    },
    onError: (err) => { toast.error(err.message); queryClient.invalidateQueries({ queryKey: ["shop-quote"] }); },
  });

  const back = <Link href="/patient/prescriptions" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Prescriptions</Link>;

  if (placed) return <div className="flex justify-center py-24"><Spinner size="md" /></div>;
  if (prescriptions.isPending) return <><Skeleton className="h-10 w-64" /><Skeleton className="mt-5 h-72 rounded-xl" /></>;
  if (!prescription) {
    return (
      <div className="py-16 text-center">
        <p className="font-medium">We could not find that prescription</p>
        <Button asChild variant="outline" className="mt-3"><Link href="/patient/prescriptions">See your prescriptions</Link></Button>
      </div>
    );
  }
  if (lines.length === 0) {
    return (
      <>
        {back}
        <div className="py-16 text-center">
          <p className="font-medium">{fromPrescription.length === 0 ? "None of these medicines can be ordered from us right now" : "There is nothing left in this order"}</p>
          <p className="mt-1 text-sm text-muted-foreground">{fromPrescription.length === 0 ? "They are out of stock, or not something we sell." : "You removed every medicine."}</p>
          {fromPrescription.length ? <Button className="mt-3" variant="outline" onClick={() => setEdited(null)}>Start again</Button> : null}
        </div>
      </>
    );
  }

  const methods: { value: Method; icon: typeof Banknote; title: string; text: string; available: boolean }[] = quote ? [
    { value: "COD", icon: Banknote, title: "Pay on delivery", text: quote.codAvailable ? "Pay in cash or by UPI when the order arrives." : "Not available for this order.", available: quote.codAvailable },
    { value: "ONLINE", icon: CreditCard, title: "Pay online now", text: !quote.onlinePayment ? "Not available yet." : quote.onlineTest ? "Test mode: no money is taken yet." : "UPI, cards and net banking, on PhonePe's secure page.", available: quote.onlinePayment },
  ] : [];
  const blocked = quote?.lines.find((line) => line.problem);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!address.state) return toast.error("Choose the state");
    if (!place.isPending) place.mutate();
  };

  return (
    <>
      {back}
      <PageHeader title="Order your medicines" description={`Prescribed by ${prescription.doctor.displayName} for ${prescription.patientName} · ${prescription.prescriptionNumber}`} />

      <form className="grid items-start gap-5 lg:grid-cols-[1fr_22rem]" onSubmit={submit}>
        <div className="grid gap-5">
          <Card>
            <CardHeader>
              <CardTitle>1. The medicines</CardTitle>
              {leftOut.length ? <CardDescription>{leftOut.map((item) => titleCase(item.medicineName)).join(", ")} {leftOut.length === 1 ? "is" : "are"} not in this order: {leftOut.length === 1 ? "it is" : "they are"} out of stock or not sold by us.</CardDescription> : null}
            </CardHeader>
            <CardContent>
              <ul className={cn("divide-y", isFetching && "opacity-70")}>
                {lines.map((line) => {
                  const priced = quote?.lines.find((l) => l.variantId === line.variantId);
                  const prescribed = prescription.items.find((item) => item.buy?.variantId === line.variantId);
                  return (
                    <li key={line.variantId} className="flex flex-wrap items-center gap-3 py-3 text-sm first:pt-0 last:pb-0">
                      <ProductImage src={priced?.imageUrl ?? prescribed?.buy?.imageUrl ?? null} name={priced?.productName ?? prescribed?.medicineName ?? ""} className="size-14 shrink-0 rounded-md border text-base" />
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 font-medium">{titleCase(priced?.productName ?? prescribed?.medicineName ?? "")}</span>
                        <span className="block text-xs text-muted-foreground">{[priced?.variantTitle, prescribed ? [prescribed.dosage, prescribed.frequency].filter(Boolean).join(", ") : null].filter(Boolean).join(" · ")}</span>
                        {priced?.problem ? <span className="block text-xs font-medium text-destructive">{priced.problem}</span> : null}
                      </span>
                      <span className="flex items-center gap-1">
                        <Button type="button" variant="outline" size="icon-sm" aria-label="One less" disabled={line.quantity <= 1} onClick={() => setQuantity(line.variantId, line.quantity - 1)}><Minus /></Button>
                        <span className="w-7 text-center font-medium ledger">{line.quantity}</span>
                        <Button type="button" variant="outline" size="icon-sm" aria-label="One more" disabled={priced ? line.quantity >= priced.maxQuantity : false} onClick={() => setQuantity(line.variantId, line.quantity + 1)}><Plus /></Button>
                      </span>
                      <span className="w-20 shrink-0 text-right font-medium ledger">{priced ? formatMoneyExact(priced.lineTotal) : "…"}</span>
                      <Button type="button" variant="ghost" size="icon-sm" aria-label="Leave this medicine out" onClick={() => remove(line.variantId)}><Trash2 /></Button>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>2. Where should we deliver?</CardTitle></CardHeader>
            <CardContent className="grid gap-3">
              {addressesLoading ? <Skeleton className="h-20" /> : (
                <>
                  {addresses.map((a) => (
                    <label key={a.id} className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm", chosenId === a.id ? "border-primary bg-primary/5" : "hover:bg-surface-2")}>
                      <input type="radio" name="address" className="mt-1 accent-(--primary)" checked={chosenId === a.id} onChange={() => setAddressId(a.id)} />
                      <span className="min-w-0">
                        <span className="block font-medium">{a.fullName} <span className="font-normal text-muted-foreground">· {a.phone}</span></span>
                        <span className="block text-muted-foreground">{addressLine(a)}</span>
                      </span>
                    </label>
                  ))}
                  {addresses.length > 0 && chosenId !== "new" ? (
                    <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => setAddressId("new")}><Plus /> Use a different address</Button>
                  ) : null}
                  {chosenId === "new" ? <AddressFields value={newForm} onChange={setForm} /> : null}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>3. How would you like to pay?</CardTitle></CardHeader>
            <CardContent className="grid gap-2">
              {methods.map(({ value, icon: Icon, title, text, available }) => (
                <label key={value} className={cn("flex items-center gap-3 rounded-lg border p-3", !available ? "opacity-50" : method === value ? "cursor-pointer border-primary bg-primary/5" : "cursor-pointer hover:bg-surface-2")}>
                  <input type="radio" name="payment" className="accent-(--primary)" disabled={!available} checked={method === value} onChange={() => setMethod(value)} />
                  <Icon className="size-5 shrink-0 text-primary" />
                  <span><span className="block text-sm font-medium">{title}</span><span className="block text-xs text-muted-foreground">{text}</span></span>
                </label>
              ))}
              <div className="mt-2 grid gap-1.5">
                <Label htmlFor="o-note">Note for us <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Textarea id="o-note" rows={2} maxLength={500} placeholder="Anything we should know about this order" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="lg:sticky lg:top-20">
          <CardHeader><CardTitle>Your order</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            {!quote ? <Skeleton className="h-40" /> : (
              <>
                <PriceBreakdown quote={quote} />
                {quote.shippingCharge > 0 && quote.freeDeliveryFrom ? <p className="text-xs text-muted-foreground">Delivery is free on orders from {formatMoneyExact(quote.freeDeliveryFrom)}.</p> : null}
                <div className="grid gap-1.5 border-t pt-3">
                  <Label htmlFor="coupon">Coupon code <span className="font-normal text-muted-foreground">(optional)</span></Label>
                  <div className="flex gap-2">
                    <Input id="coupon" className="h-9 uppercase" maxLength={40} value={couponText} onChange={(e) => setCouponText(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setCouponCode(couponText.trim()); } }} />
                    {couponCode
                      ? <Button type="button" variant="outline" className="h-9" onClick={() => { setCouponCode(""); setCouponText(""); }}>Remove</Button>
                      : <Button type="button" variant="outline" className="h-9" disabled={!couponText.trim()} onClick={() => setCouponCode(couponText.trim())}>Apply</Button>}
                  </div>
                  {couponCode && quote.couponError ? <p role="alert" className="text-xs text-destructive">{quote.couponError}</p> : null}
                </div>
                {blocked ? <p role="alert" className="text-sm text-destructive">One of the medicines needs attention. Change its quantity or leave it out.</p> : null}
                <Button type="submit" className="h-11" disabled={place.isPending || Boolean(blocked) || Boolean(couponCode && quote.couponError)}>
                  {place.isPending ? <Spinner size="sm" /> : <Lock />}
                  {method === "ONLINE" ? `Continue to pay ${formatMoneyExact(quote.grandTotal)}` : `Place order · ${formatMoneyExact(quote.grandTotal)}`}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </form>
    </>
  );
}

export default function PatientCheckoutPage() {
  return (
    <Suspense>
      <Checkout />
    </Suspense>
  );
}
