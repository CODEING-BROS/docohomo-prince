"use client";

import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Package, Pill, Truck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PageHeader, StatusBadge, Thumb } from "@/components/admin/parts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { MyOrder } from "@/lib/care";
import { formatDate, formatMoneyExact, titleCase } from "@/lib/format";
import { PAYMENT_LABEL } from "@/lib/shop";
import { cn } from "@/lib/utils";

const FINISHED = ["DELIVERED", "CANCELLED", "UNDELIVERED", "RETURNED", "REFUNDED"];

export default function PatientOrdersPage() {
  const [tab, setTab] = useState<"all" | "active">("all");
  const { data, isPending, isError } = useQuery({ queryKey: ["my-orders"], queryFn: () => api<{ items: MyOrder[] }>("/me/orders", { query: { channel: "D2C" } }) });
  const items = data?.items ?? [];
  const active = items.filter((o) => !FINISHED.includes(o.status));
  const shown = tab === "active" ? active : items;

  return (
    <>
      <PageHeader title="My orders" description="Follow a parcel, download the invoice, pay, cancel or send something back" />

      <div className="mb-4 flex gap-1.5">
        {([["all", "All orders", items.length], ["active", "On the way", active.length]] as const).map(([value, label, count]) => (
          <button
            key={value} type="button" onClick={() => setTab(value)}
            className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors", tab === value ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-surface-2")}
          >
            {label}<span className={cn("text-xs ledger", tab === value ? "opacity-80" : "text-muted-foreground")}>{count}</span>
          </button>
        ))}
      </div>

      {isError ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Your orders could not be loaded. Please try again in a moment.</p>
      ) : isPending ? (
        <div className="grid gap-3">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}</div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-14 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground"><Package className="size-5" /></span>
          <p className="font-medium">{tab === "active" ? "Nothing is on its way" : "No orders yet"}</p>
          <p className="max-w-sm text-sm text-muted-foreground">Medicines you order, from the shop or from a prescription, are listed here with their delivery status.</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Button asChild><Link href="/patient/shop"><Pill /> Order medicines</Link></Button>
            <Button asChild variant="outline"><Link href="/patient/prescriptions"><ClipboardList /> See your prescriptions</Link></Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          {shown.map((o) => {
            const shipment = o.shipments[0];
            const unpaid = o.paymentMethod === "ONLINE" && o.paymentStatus !== "PAID" && o.status === "PENDING";
            return (
              <Card key={o.id}>
                <CardContent className="grid gap-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Link href={`/patient/orders/${o.id}`} className="font-medium hover:text-primary">{o.orderNumber}</Link>
                    <StatusBadge status={o.status} />
                    {unpaid ? <StatusBadge status="PENDING" label="Waiting for payment" /> : null}
                    <p className="ml-auto text-sm text-muted-foreground">Placed on {formatDate(o.placedAt)}</p>
                  </div>
                  <ul className="grid gap-1.5 text-sm">
                    {o.items.slice(0, 3).map((item, index) => (
                      <li key={index} className="flex items-center gap-3">
                        <Thumb src={item.imageUrl} name={item.productName} className="size-9" />
                        <span className="min-w-0 flex-1 truncate">{titleCase(item.productName)}{item.variantTitle ? ` · ${item.variantTitle}` : ""}</span>
                        <span className="text-muted-foreground ledger">× {item.quantity}</span>
                      </li>
                    ))}
                    {o.items.length > 3 ? <li className="pl-12 text-muted-foreground">and {o.items.length - 3} more</li> : null}
                  </ul>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3 text-sm">
                    <p>
                      <span className="font-semibold ledger">{formatMoneyExact(o.grandTotal)}</span>
                      <span className="text-muted-foreground"> · {PAYMENT_LABEL[o.paymentMethod] && !(o.paymentMethod === "ONLINE" && o.paymentStatus !== "PAID") ? PAYMENT_LABEL[o.paymentMethod] : "Online payment"}</span>
                    </p>
                    {shipment && !FINISHED.includes(o.status) ? (
                      <p className="flex items-center gap-1.5 text-muted-foreground">
                        <Truck className="size-4 text-primary" /> {shipment.carrier ?? "Courier"} · {shipment.trackingNumber}
                        {shipment.trackingUrl ? <a href={shipment.trackingUrl} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">Track</a> : null}
                      </p>
                    ) : null}
                    {o.estimatedDelivery && !FINISHED.includes(o.status) ? <p className="text-muted-foreground">Expected by {formatDate(o.estimatedDelivery)}</p> : null}
                    {o.prescription ? <p className="text-muted-foreground">From prescription {o.prescription.prescriptionNumber}</p> : null}
                    <Button asChild size="sm" variant={unpaid ? "default" : "outline"} className="ml-auto"><Link href={`/patient/orders/${o.id}`}>{unpaid ? "Pay now" : "View order"}</Link></Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
