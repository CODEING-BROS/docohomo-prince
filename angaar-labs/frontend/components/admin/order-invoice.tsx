"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { Spinner } from "@/components/custom/loaders";

/** The order's GST invoice: download it, or make it now if it has not been made yet. */
export function OrderInvoice({ orderId, invoiceNumber, status }: { orderId: number; invoiceNumber: string | null; status: string }) {
  const queryClient = useQueryClient();
  const make = useMutation({
    mutationFn: () => api<{ invoiceNumber: string }>(`/admin/invoices/orders/${orderId}`, { method: "POST" }),
    onSuccess: (result) => {
      toast.success(`Invoice ${result.invoiceNumber} made`);
      ["order", "orders"].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <section className="grid gap-2">
      <h3 className="text-[0.6875rem]/none font-semibold tracking-[0.12em] text-muted-foreground uppercase">Invoice</h3>
      {invoiceNumber ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">
          <FileText className="size-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 font-medium ledger">{invoiceNumber}</span>
          <Button asChild size="sm" variant="outline">
            <a href={`/api/admin/invoices/orders/${orderId}/pdf`} target="_blank" rel="noreferrer">Open PDF</a>
          </Button>
        </div>
      ) : status === "CANCELLED" ? (
        <p className="text-sm text-muted-foreground">A cancelled order gets no invoice.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-3 text-sm">
          <span className="min-w-0 flex-1 text-muted-foreground">Made by itself as soon as the order is confirmed. <Link href="/admin/invoices" className="text-primary hover:underline">Invoice settings</Link></span>
          <Button size="sm" variant="outline" disabled={make.isPending} onClick={() => make.mutate()}>
            {make.isPending ? <Spinner size="sm" /> : <FileText />} Make it now
          </Button>
        </div>
      )}
    </section>
  );
}
