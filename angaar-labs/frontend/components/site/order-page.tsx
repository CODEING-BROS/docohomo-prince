"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, CircleAlert, CircleCheckBig, Clock, CreditCard, FileText, Truck } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/admin/parts";
import { MyOrderReturns } from "@/components/doctor/order-returns";
import { ProductImage } from "@/components/site/product-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { formatDate, formatDateTime, formatMoneyExact, humanize, titleCase } from "@/lib/format";
import { type OrderDetail, PAYMENT_LABEL } from "@/lib/shop";
import { cn } from "@/lib/utils";
import { ButtonSpinner, Spinner } from "@/components/custom/loaders";

// the usual journey of an order; anything else (cancelled, returned) is shown as a plain status
const STEPS = [
  { label: "Placed", reached: ["PENDING", "CONFIRMED", "PROCESSING", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"] },
  { label: "Confirmed", reached: ["CONFIRMED", "PROCESSING", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"] },
  { label: "Packed", reached: ["PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"] },
  { label: "On the way", reached: ["SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"] },
  { label: "Delivered", reached: ["DELIVERED"] },
];

function Journey({ status }: { status: string }) {
  if (!STEPS[0].reached.includes(status)) return null;
  return (
    <ol className="flex items-start">
      {STEPS.map((step, index) => {
        const done = step.reached.includes(status);
        return (
          <li key={step.label} className="flex flex-1 flex-col items-center gap-1.5 text-center">
            <div className="flex w-full items-center">
              <span className={cn("h-0.5 flex-1", index === 0 ? "invisible" : done ? "bg-primary" : "bg-border")} />
              <span className={cn("flex size-7 items-center justify-center rounded-full border-2 text-xs", done ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>
                {done ? <Check className="size-4" /> : index + 1}
              </span>
              <span className={cn("h-0.5 flex-1", index === STEPS.length - 1 ? "invisible" : STEPS[index + 1].reached.includes(status) ? "bg-primary" : "bg-border")} />
            </div>
            <span className={cn("text-xs", done ? "font-medium" : "text-muted-foreground")}>{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** One order as its buyer sees it: where it is, what was bought, paying, cancelling, the invoice and returns. */
export function OrderPage({ base }: { base: "/doctor" | "/patient" }) {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const justPlaced = search.get("placed") === "1";
  const payment = search.get("payment"); // set when coming back from the pay page
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const { data: order, isPending, isError } = useQuery({ queryKey: ["my-order", id], queryFn: () => api<OrderDetail>(`/me/orders/${id}`) });

  const pay = useMutation({
    mutationFn: () => api<{ payUrl: string }>(`/me/orders/${id}/pay`, { method: "POST", body: {} }),
    onSuccess: ({ payUrl }) => window.location.assign(payUrl),
    onError: (err) => toast.error(err.message),
  });
  const cancel = useMutation({
    mutationFn: () => api(`/me/orders/${id}/cancel`, { method: "POST", body: {} }),
    onSuccess: () => {
      toast.success("Your order is cancelled");
      setConfirming(false);
      ["my-order", "my-orders", "doctor-wholesale", "patient-overview"].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
    },
    onError: (err) => toast.error(err.message),
  });

  if (isError) {
    return (
      <div className="py-16 text-center">
        <p className="font-medium">We could not find this order</p>
        <Button asChild variant="outline" className="mt-3"><Link href={`${base}/orders`}>Back to my orders</Link></Button>
      </div>
    );
  }
  if (isPending) return <><Skeleton className="h-40 rounded-xl" /><Skeleton className="mt-4 h-72 rounded-xl" /></>;

  return (
    <>
      <Link href={`${base}/orders`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> My orders</Link>

      {justPlaced && order.status !== "CANCELLED" ? (
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-success/40 bg-success/10 px-4 py-4">
          <CircleCheckBig className="size-8 shrink-0 text-success" />
          <div>
            <p className="font-semibold">Thank you. Your order is placed.</p>
            <p className="text-sm text-muted-foreground">
              {order.paymentMethod === "COD" ? `Please keep ${formatMoneyExact(order.grandTotal)} ready when it arrives.` : "We will pack it and let you know when it ships."}
            </p>
          </div>
        </div>
      ) : null}

      {payment && order.status !== "CANCELLED" ? (
        order.paymentStatus === "PAID" ? (
          <div className="mb-5 flex items-center gap-3 rounded-xl border border-success/40 bg-success/10 px-4 py-4">
            <CircleCheckBig className="size-8 shrink-0 text-success" />
            <div><p className="font-semibold">Payment received. Thank you.</p><p className="text-sm text-muted-foreground">We got {formatMoneyExact(order.grandTotal)} for this order and will pack it now.</p></div>
          </div>
        ) : payment === "pending" ? (
          <div className="mb-5 flex items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-4">
            <Clock className="size-8 shrink-0 text-warning" />
            <div><p className="font-semibold">Your payment is still being confirmed</p><p className="text-sm text-muted-foreground">This can take a few minutes. We check on our own; reload this page shortly. Do not pay again unless it fails.</p></div>
          </div>
        ) : (
          <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-4">
            <CircleAlert className="size-8 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1"><p className="font-semibold">The payment did not go through</p><p className="text-sm text-muted-foreground">No money was taken for this order. It is kept for 45 minutes so you can try again.</p></div>
            {order.canPay ? <Button disabled={pay.isPending} onClick={() => pay.mutate()}>{pay.isPending ? <Spinner size="sm" /> : <CreditCard />} Try again</Button> : null}
          </div>
        )
      ) : null}

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Order {order.orderNumber}</h1>
          <p className="text-sm text-muted-foreground">Placed on {formatDateTime(order.placedAt)}{order.channel === "B2B" ? " · Wholesale order" : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={order.status} />
          {order.invoiceNumber ? (
            <Button asChild size="sm" variant="outline">
              <a href={`/api/me/orders/${order.id}/invoice${base === "/doctor" ? "?panel=doctor" : ""}`} target="_blank" rel="noreferrer" title={`Invoice ${order.invoiceNumber}`}><FileText /> Invoice</a>
            </Button>
          ) : null}
          {order.canPay && !payment ? <Button size="sm" disabled={pay.isPending} onClick={() => pay.mutate()}>{pay.isPending ? <Spinner size="sm" /> : <CreditCard />} Pay {formatMoneyExact(order.grandTotal)} now</Button> : null}
          {order.canCancel ? <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>Cancel order</Button> : null}
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-5">
        <div className="grid gap-4 lg:col-span-3">
          <Card>
            <CardContent className="grid gap-4">
              <Journey status={order.status} />
              {order.status === "CANCELLED" ? <p className="text-sm text-muted-foreground">This order was cancelled{order.cancelReason ? `: ${order.cancelReason}` : ""}.</p> : null}
              {order.estimatedDelivery && order.status !== "DELIVERED" && order.status !== "CANCELLED" ? <p className="text-sm">Expected by <span className="font-medium">{formatDate(order.estimatedDelivery)}</span></p> : null}
              {order.shipments.filter((s) => s.trackingNumber).map((shipment) => (
                <p key={shipment.trackingNumber} className="flex flex-wrap items-center gap-2 text-sm">
                  <Truck className="size-4 text-primary" />
                  {shipment.carrier ?? "Courier"} · {shipment.trackingNumber}
                  {shipment.trackingUrl ? <a href={shipment.trackingUrl} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">Track</a> : null}
                </p>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Items</CardTitle></CardHeader>
            <CardContent>
              <ul className="divide-y">
                {order.items.map((item) => {
                  const name = titleCase(item.productName);
                  return (
                    <li key={item.id} className="flex items-center gap-3 py-3 text-sm first:pt-0 last:pb-0">
                      <ProductImage src={item.imageUrl} name={name} className="size-14 shrink-0 rounded-md border text-base" />
                      <span className="min-w-0 flex-1">
                        {item.slug && base === "/doctor" ? <Link href={`/doctor/wholesale/${item.slug}`} className="line-clamp-2 font-medium hover:text-primary">{name}</Link> : <span className="line-clamp-2 font-medium">{name}</span>}
                        <span className="block text-xs text-muted-foreground">{[item.variantTitle, `${formatMoneyExact(item.unitPrice)} × ${item.quantity}`].filter(Boolean).join(" · ")}</span>
                      </span>
                      <span className="shrink-0 font-medium ledger">{formatMoneyExact(item.lineTotal)}</span>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          <MyOrderReturns orderId={order.id} status={order.status} />
        </div>

        <div className="grid gap-4 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Payment</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid gap-2 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">Items</dt><dd className="ledger">{formatMoneyExact(order.subtotal)}</dd></div>
                {order.couponDiscount > 0 ? <div className="flex justify-between"><dt className="text-muted-foreground">Coupon {order.couponCode}</dt><dd className="text-success ledger">− {formatMoneyExact(order.couponDiscount)}</dd></div> : null}
                <div className="flex justify-between"><dt className="text-muted-foreground">Delivery</dt><dd className="ledger">{order.shippingCharge > 0 ? formatMoneyExact(order.shippingCharge) : "Free"}</dd></div>
                {order.codCharge > 0 ? <div className="flex justify-between"><dt className="text-muted-foreground">Pay on delivery fee</dt><dd className="ledger">{formatMoneyExact(order.codCharge)}</dd></div> : null}
                <div className="flex justify-between border-t pt-2 text-base font-semibold"><dt>Total</dt><dd className="ledger">{formatMoneyExact(order.grandTotal)}</dd></div>
                <div className="flex justify-between pt-1"><dt className="text-muted-foreground">{order.paymentMethod === "ONLINE" && order.paymentStatus !== "PAID" ? "Online payment" : PAYMENT_LABEL[order.paymentMethod] ?? humanize(order.paymentMethod)}</dt><dd><StatusBadge status={order.paymentStatus} /></dd></div>
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Delivering to</CardTitle></CardHeader>
            <CardContent className="text-sm">
              <p className="font-medium">{order.customerName}</p>
              <p className="text-muted-foreground">{[order.shippingAddress, order.shippingCity, order.shippingState, order.shippingPincode].filter(Boolean).join(", ")}</p>
              {order.customerPhone ? <p className="mt-1 text-muted-foreground">Phone {order.customerPhone}</p> : null}
              {order.billingName ? <p className="mt-2 border-t pt-2 text-muted-foreground">Billed to {order.billingName}{order.billingGstNumber ? ` · GSTIN ${order.billingGstNumber}` : ""}</p> : null}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this order?</DialogTitle>
            <DialogDescription>
              Order {order.orderNumber} will not be delivered.{order.paymentStatus === "PAID" ? " The amount you paid will be refunded." : ""} This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>Keep the order</Button>
            <Button variant="destructive" disabled={cancel.isPending} onClick={() => cancel.mutate()}>{cancel.isPending ? <ButtonSpinner /> : null}Cancel order</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
