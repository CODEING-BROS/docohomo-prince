"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Banknote, CreditCard, Lock, Plus, ReceiptText } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Callout } from "@/components/custom/callout";
import { EmptyState } from "@/components/custom/empty-state";
import { FormField, OptionalMark, PhoneField } from "@/components/custom/form-field";
import { IconTile } from "@/components/custom/icon-tile";
import { Spinner } from "@/components/custom/loaders";
import { Money } from "@/components/custom/number";
import { PageHero } from "@/components/custom/page-hero";
import { SectionCard } from "@/components/custom/section-card";
import { Stepper } from "@/components/custom/stepper";
import { PriceBreakdown, useQuote } from "@/components/site/order-summary";
import { ProductImage } from "@/components/site/product-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";
import { cart, useCart } from "@/lib/cart";
import { formatMoneyExact, titleCase } from "@/lib/format";
import { INDIAN_STATES } from "@/lib/india";
import type { SavedAddress } from "@/lib/shop";
import { useShop } from "@/lib/shop-paths";
import { cn } from "@/lib/utils";

type Method = "COD" | "ONLINE" | "CREDIT";
type AddressForm = { fullName: string; phone: string; line1: string; landmark: string; city: string; state: string; pincode: string };
const blankAddress: AddressForm = { fullName: "", phone: "", line1: "", landmark: "", city: "", state: "", pincode: "" };
const fromSaved = (a: SavedAddress): AddressForm => ({
  fullName: a.fullName ?? "", phone: a.phone ?? "", line1: a.line1, landmark: a.landmark ?? "", city: a.city ?? "", state: a.state ?? "", pincode: a.pincode ?? "",
});

export function ShopCheckout() {
  const { base, orders, doctor } = useShop();
  const router = useRouter();
  const { user } = useSession();
  const { lines } = useCart();
  const [method, setMethod] = useState<Method>("COD");
  const { quote, empty, couponCode } = useQuote(method);
  const [addressId, setAddressId] = useState<number | "new" | null>(null); // null = not chosen yet, use the default
  const [form, setForm] = useState<AddressForm>(blankAddress);
  const [note, setNote] = useState("");
  const [placed, setPlaced] = useState(false); // the cart is emptied on success; do not flash "cart is empty"

  const { data: saved, isPending: addressesLoading } = useQuery({
    queryKey: ["my-addresses"],
    queryFn: () => api<{ items: SavedAddress[] }>("/me/addresses"),
    enabled: Boolean(user),
  });
  const addresses = saved?.items ?? [];
  const chosenId = addressId ?? (addresses[0]?.id ?? "new");
  const chosen = chosenId === "new" ? null : addresses.find((a) => a.id === chosenId) ?? null;
  // a new address starts with what we already know about the person
  const newForm: AddressForm = { ...form, fullName: form.fullName || user?.name || "", phone: form.phone || user?.phone?.replace(/^\+?91/, "").slice(-10) || "" };
  const address = chosen ? fromSaved(chosen) : newForm;
  const change = (field: keyof AddressForm, value: string) => setForm({ ...newForm, [field]: value });
  const cta = doctor ? "" : "bg-terracotta text-terracotta-foreground not-disabled:hover:bg-terracotta/90";

  const methods: { value: Method; icon: typeof Banknote; title: string; text: string; available: boolean }[] = quote ? [
    { value: "COD", icon: Banknote, title: "Pay on delivery", text: quote.codAvailable ? "Pay in cash or by UPI when the order arrives." : "Not available for this order.", available: quote.codAvailable },
    { value: "ONLINE", icon: CreditCard, title: "Pay online now", text: !quote.onlinePayment ? "Not available yet." : quote.onlineTest ? "Test mode: no money is taken yet." : "UPI, cards and net banking, on PhonePe's secure page.", available: quote.onlinePayment },
    ...(quote.wholesale && quote.wholesale.creditLimit > 0
      ? [{ value: "CREDIT" as Method, icon: ReceiptText, title: "Buy on credit", text: `Pay within ${quote.wholesale.creditDays} days. Limit ${formatMoneyExact(quote.wholesale.creditLimit)}.`, available: true }]
      : []),
  ] : [];

  const place = useMutation({
    mutationFn: () =>
      api<{ id: number; orderNumber: string; paid: boolean; payUrl: string | null }>("/me/checkout", {
        method: "POST",
        body: { lines, couponCode, paymentMethod: method, address, saveAddress: true, note, expectedTotal: quote?.grandTotal },
      }),
    onSuccess: (order) => {
      setPlaced(true);
      cart.clear();
      // paying online: straight on to the gateway's page; it sends the buyer back to the order afterwards
      if (order.payUrl) return window.location.assign(order.payUrl);
      // the pay page could not be opened: the order is kept and can be paid from its own page
      router.push(method === "ONLINE" && !order.paid ? `${orders}/${order.id}?payment=failed` : `${orders}/${order.id}?placed=1`);
    },
    onError: (err) => toast.error(err.message),
  });
  const blocked = quote?.lines.find((line) => line.problem);

  if (placed) return <div className="flex justify-center py-24"><Spinner size="lg" label="Placing your order" /></div>;
  if (empty) {
    return <EmptyState bordered size="lg" illustration="cart" title="Your cart is empty" action={<Button asChild className={cta}><Link href={base}>Browse medicines</Link></Button>} />;
  }

  return (
    <>
      <PageHero eyebrow={doctor ? "Wholesale" : "Medicines"} title="Place your order" backHref={`${base}/cart`}>
        <Stepper compact steps={[{ id: "cart", label: "Cart", state: "done", href: `${base}/cart` }, { id: "address", label: "Delivery", state: "current" }, { id: "pay", label: "Payment", state: "current" }, { id: "done", label: "Done", state: "upcoming" }]} />
      </PageHero>

      <form className="grid items-start gap-5 lg:grid-cols-[1fr_22rem]" onSubmit={(e) => { e.preventDefault(); if (!address.state) return toast.error("Choose the state"); place.mutate(); }}>
        <div className="grid gap-5">
          <SectionCard number={1} title="Where should we deliver?">
            <div className="grid gap-3">
              {addressesLoading ? <Skeleton className="h-20" /> : (
                <>
                  {addresses.map((a) => (
                    <label key={a.id} className={cn("flex items-start gap-3 rounded-lg border p-3 text-sm transition-colors", chosenId === a.id ? "border-primary/40 bg-primary-soft/40" : "hover:bg-surface-2")}>
                      <input type="radio" name="address" className="mt-1 accent-(--primary)" checked={chosenId === a.id} onChange={() => setAddressId(a.id)} />
                      <span className="min-w-0">
                        <span className="block font-medium">{a.fullName} <span className="ledger font-normal text-muted-foreground">· {a.phone}</span></span>
                        <span className="block text-muted-foreground">{[a.line1, a.landmark ? `Near ${a.landmark}` : null, a.city, a.state, a.pincode].filter(Boolean).join(", ")}</span>
                      </span>
                    </label>
                  ))}
                  {addresses.length > 0 && chosenId !== "new" ? (
                    <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => setAddressId("new")}><Plus data-icon="inline-start" /> Use a different address</Button>
                  ) : null}
                  {chosenId === "new" ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField label="Full name">{(id) => <Input id={id} required minLength={2} autoComplete="name" className="h-10" value={newForm.fullName} onChange={(e) => change("fullName", e.target.value)} />}</FormField>
                      <FormField label="Mobile number">{(id) => <PhoneField id={id} required value={newForm.phone} onChange={(digits) => change("phone", digits)} pattern="[6-9][0-9]{9}" title="A 10-digit mobile number" />}</FormField>
                      <FormField label="House number, building and street" className="sm:col-span-2">{(id) => <Input id={id} required minLength={5} autoComplete="street-address" className="h-10" value={newForm.line1} onChange={(e) => change("line1", e.target.value)} />}</FormField>
                      <FormField label={<>Landmark <OptionalMark /></>}>{(id) => <Input id={id} className="h-10" value={newForm.landmark} onChange={(e) => change("landmark", e.target.value)} />}</FormField>
                      <FormField label="Pincode">{(id) => <Input id={id} required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} title="A 6-digit pincode" autoComplete="postal-code" className="ledger h-10" value={newForm.pincode} onChange={(e) => change("pincode", e.target.value.replace(/\D/g, ""))} />}</FormField>
                      <FormField label="City">{(id) => <Input id={id} required minLength={2} autoComplete="address-level2" className="h-10" value={newForm.city} onChange={(e) => change("city", e.target.value)} />}</FormField>
                      <FormField label="State">
                        {(id) => (
                          <Select value={newForm.state} onValueChange={(state) => change("state", state)}>
                            <SelectTrigger id={id} className="h-10 w-full"><SelectValue placeholder="Choose" /></SelectTrigger>
                            <SelectContent className="max-h-72">{INDIAN_STATES.map((state) => <SelectItem key={state} value={state}>{state}</SelectItem>)}</SelectContent>
                          </Select>
                        )}
                      </FormField>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </SectionCard>

          <SectionCard number={2} title="How would you like to pay?">
            <div className="grid gap-2 sm:grid-cols-2">
              {methods.map(({ value, icon, title, text, available }) => (
                <label key={value} className={cn("flex items-start gap-3 rounded-lg border p-3 transition-colors", !available ? "opacity-50" : method === value ? "border-primary/40 bg-primary-soft/40 ring-1 ring-primary/30" : "hover:bg-surface-2")}>
                  <input type="radio" name="payment" className="sr-only" disabled={!available} checked={method === value} onChange={() => setMethod(value)} />
                  <IconTile icon={icon} tone={method === value ? "primary" : "neutral"} size="md" />
                  <span><span className="block text-sm font-medium">{title}</span><span className="block text-xs text-muted-foreground">{text}</span></span>
                </label>
              ))}
            </div>
            <FormField label={<>Note for us <OptionalMark /></>} className="mt-4">
              {(id) => <Textarea id={id} rows={2} maxLength={500} placeholder="Anything we should know about this order" value={note} onChange={(e) => setNote(e.target.value)} />}
            </FormField>
          </SectionCard>
        </div>

        <SectionCard title="Your order" description={quote?.wholesale ? `Wholesale order for ${quote.wholesale.businessName}` : undefined} className="lg:sticky lg:top-20">
          {!quote ? <Skeleton className="h-40" /> : (
            <div className="grid gap-4">
              <ul className="scroll-thin grid max-h-64 gap-3 overflow-y-auto pr-1">
                {quote.lines.map((line) => (
                  <li key={line.variantId} className="flex items-center gap-3 text-sm">
                    <ProductImage src={line.imageUrl} name={line.productName} className="size-12 shrink-0 rounded-md border text-sm" />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-1">{titleCase(line.productName)}</span>
                      <span className="block text-xs text-muted-foreground">{line.variantTitle} × {line.quantity}</span>
                      {line.problem ? <span className="block text-xs font-medium text-destructive">{line.problem}</span> : null}
                    </span>
                    <span className="ledger shrink-0 font-medium"><Money value={line.lineTotal} exact animate={false} /></span>
                  </li>
                ))}
              </ul>
              <PriceBreakdown quote={quote} />
              {quote.couponError ? <Callout tone="danger" compact action={<Button type="button" variant="link" size="xs" onClick={() => cart.setCoupon("")}>Remove it</Button>}>Coupon: {quote.couponError}</Callout> : null}
              {blocked ? <Callout tone="danger" compact action={<Button asChild variant="link" size="xs"><Link href={`${base}/cart`}>Go to cart</Link></Button>}>Some items need attention.</Callout> : null}
              <Button type="submit" size="lg" className={cn("h-11", cta)} loading={place.isPending} disabled={!user || Boolean(blocked) || Boolean(quote.couponError)}>
                {!place.isPending ? <Lock data-icon="inline-start" /> : null}
                {method === "ONLINE" ? "Continue to pay" : "Place order"} · <Money value={quote.grandTotal} exact className="ml-1" />
              </Button>
            </div>
          )}
        </SectionCard>
      </form>
    </>
  );
}
