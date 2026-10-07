"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarPlus, ClipboardList, Printer, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader, StatusBadge, Thumb } from "@/components/admin/parts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { MyPrescription } from "@/lib/care";
import { formatDate, formatMoney, humanize, titleCase } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function PrescriptionsPage() {
  const { data, isPending, isError } = useQuery({ queryKey: ["my-prescriptions"], queryFn: () => api<{ items: MyPrescription[] }>("/me/prescriptions") });
  const [printing, setPrinting] = useState<number | null>(null); // only this prescription goes on paper
  const items = data?.items ?? [];

  // a link from elsewhere ("#rx-12") lands on that prescription once the list is there
  const count = items.length;
  useEffect(() => {
    if (count && window.location.hash) document.querySelector(window.location.hash)?.scrollIntoView({ block: "start" });
  }, [count]);

  const print = (id: number) => {
    setPrinting(id);
    setTimeout(() => window.print(), 80); // after the others are hidden
  };

  return (
    <>
      <div className="print:hidden">
        <PageHeader title="Prescriptions" description="Everything your doctors have prescribed, with the medicines ready to order" />
      </div>

      {isError ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Your prescriptions could not be loaded. Please try again in a moment.</p>
      ) : isPending ? (
        <div className="grid gap-4">{Array.from({ length: 2 }, (_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}</div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-14 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground"><ClipboardList className="size-5" /></span>
          <p className="font-medium">No prescriptions yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">After a consultation, the doctor&apos;s prescription appears here and you can order the medicines in one step.</p>
          <Button asChild className="mt-2"><Link href="/patient/book"><CalendarPlus /> Book a consultation</Link></Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {items.map((p) => {
            const buyable = p.items.filter((item) => item.buy?.inStock);
            const total = buyable.reduce((sum, item) => sum + item.buy!.price * item.quantity, 0);
            return (
              <Card key={p.id} id={`rx-${p.id}`} className={cn("scroll-mt-20 print:border-0 print:shadow-none", printing !== null && printing !== p.id && "print:hidden")}>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle>{p.doctor.displayName}</CardTitle>
                      <CardDescription>
                        {[p.doctor.qualification, p.doctor.registrationNumber ? `Reg. no. ${p.doctor.registrationNumber}` : null].filter(Boolean).join(" · ")}
                      </CardDescription>
                    </div>
                    <div className="text-right text-sm">
                      <p className="font-medium">{p.prescriptionNumber}</p>
                      <p className="text-muted-foreground">{p.issuedAt ? formatDate(p.issuedAt) : ""}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4 text-sm">
                  <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                    <div><dt className="inline text-muted-foreground">Patient: </dt><dd className="inline font-medium">{p.patientName}</dd></div>
                    {p.diagnosis ? <div><dt className="inline text-muted-foreground">Diagnosis: </dt><dd className="inline font-medium">{p.diagnosis}</dd></div> : null}
                  </dl>
                  <ul className="grid gap-2">
                    {p.items.map((item, index) => (
                      <li key={item.id} className="flex items-start gap-3 rounded-lg border p-3">
                        <span className="print:hidden"><Thumb src={item.buy?.imageUrl ?? null} name={item.medicineName} /></span>
                        <span className="hidden w-5 shrink-0 font-medium print:block">{index + 1}.</span>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{titleCase(item.medicineName)}{item.potency ? ` · ${item.potency}` : ""}</p>
                          <p className="text-muted-foreground">{[item.dosage, item.frequency, item.duration ? `for ${item.duration}` : null].filter(Boolean).join(" · ") || "As directed"}</p>
                          {item.instructions ? <p className="text-muted-foreground">{item.instructions}</p> : null}
                        </div>
                        <p className="shrink-0 text-right print:hidden">
                          {item.buy ? (
                            <><span className="font-medium ledger">{formatMoney(item.buy.price * item.quantity)}</span><span className="block text-xs text-muted-foreground">{item.buy.inStock ? `Quantity ${item.quantity}` : "Out of stock"}</span></>
                          ) : <span className="text-xs text-muted-foreground">Not sold by us</span>}
                        </p>
                      </li>
                    ))}
                  </ul>
                  {p.advice ? <div><p className="text-muted-foreground">Advice</p><p className="whitespace-pre-line">{p.advice}</p></div> : null}
                  {p.followUpDate ? <p><span className="text-muted-foreground">Follow up on</span> <span className="font-medium">{formatDate(p.followUpDate)}</span></p> : null}

                  <div className="flex flex-wrap items-center gap-3 border-t pt-3 print:hidden">
                    <p className="min-w-0 flex-1 text-muted-foreground">
                      {p.orders.length ? <>Ordered: {p.orders.map((o, index) => (
                        <span key={o.id}>{index ? ", " : ""}<Link href={`/patient/orders/${o.id}`} className="font-medium text-foreground hover:underline">{o.orderNumber}</Link> <StatusBadge status={o.status} label={humanize(o.status)} className="ml-1" /></span>
                      ))}</> : buyable.length === 0 ? "None of these medicines can be ordered from us right now." : null}
                    </p>
                    <Button variant="outline" size="sm" onClick={() => print(p.id)}><Printer /> Print</Button>
                    {p.followUpDate ? <Button asChild variant="outline" size="sm"><Link href="/patient/book"><CalendarPlus /> Book follow-up</Link></Button> : null}
                    {buyable.length ? (
                      <Button asChild size="sm">
                        <Link href={`/patient/checkout?prescription=${p.id}`}>
                          <ShoppingBag /> Order {buyable.length === p.items.length ? "these medicines" : `${buyable.length} of ${p.items.length} medicines`}{p.orders.length ? " again" : ""} · {formatMoney(total)}
                        </Link>
                      </Button>
                    ) : null}
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
