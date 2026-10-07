"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { IndianRupee } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { formatMoneyExact } from "@/lib/format";

type Method = "UPI" | "BANK" | "CASH" | "CHEQUE";
const METHODS: Record<Method, string> = { BANK: "Bank transfer", UPI: "UPI", CHEQUE: "Cheque", CASH: "Cash" };

/** For an order that is not paid yet: write down money that reached you by bank, UPI, cheque or cash. */
export function OrderPayment({ orderId, due }: { orderId: number; due: number }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<Method>("BANK");
  const [amount, setAmount] = useState(String(due));
  const [reference, setReference] = useState("");

  const record = useMutation({
    mutationFn: () => api<{ paymentStatus: string; stillDue: number }>(`/admin/orders/${orderId}/record-payment`, { method: "POST", body: { method, amount: Number(amount), reference } }),
    onSuccess: (result) => {
      toast.success(result.stillDue > 0 ? `Payment recorded. ${formatMoneyExact(result.stillDue)} is still to come.` : "Payment recorded. The order is now paid.");
      setOpen(false);
      setReference("");
      ["order", "orders", "payments", "b2b", "dashboard"].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
    },
    onError: (err) => toast.error(err.message),
  });
  const amountNumber = Number(amount);
  const bad = !(amountNumber > 0) || amountNumber > due + 0.005 || (method !== "CASH" && !reference.trim());

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-3 text-sm">
        <span className="min-w-0 flex-1 text-muted-foreground">{formatMoneyExact(due)} is still to be paid. Has the money reached you?</span>
        <Button size="sm" variant="outline" onClick={() => { setAmount(String(due)); setOpen(true); }}><IndianRupee /> Record payment</Button>
      </div>
    );
  }
  return (
    <form className="grid gap-3 rounded-lg border p-3 text-sm sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); if (!bad && !record.isPending) record.mutate(); }}>
      <div className="grid gap-1.5">
        <Label>How it was paid</Label>
        <Select value={method} onValueChange={(value) => setMethod(value as Method)}>
          <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
          <SelectContent>{(Object.keys(METHODS) as Method[]).map((m) => <SelectItem key={m} value={m}>{METHODS[m]}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="payment-amount">Amount (₹)</Label>
        <Input id="payment-amount" type="number" inputMode="decimal" min={1} max={due} step="0.01" className="h-9" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor="payment-reference">{method === "CASH" ? "Note (optional)" : method === "CHEQUE" ? "Cheque number" : "Reference (UTR or transaction number)"}</Label>
        <Input id="payment-reference" className="h-9" maxLength={120} value={reference} onChange={(e) => setReference(e.target.value)} />
        {amountNumber > due + 0.005 ? <p className="text-xs text-destructive">Only {formatMoneyExact(due)} is still to be paid.</p> : amountNumber > 0 && amountNumber < due - 0.005 ? <p className="text-xs text-muted-foreground">Less than what is due: the order will show as partly paid.</p> : null}
      </div>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" size="sm" variant="outline" disabled={record.isPending} onClick={() => setOpen(false)}>Cancel</Button>
        <Button type="submit" size="sm" loading={record.isPending} disabled={bad}>Save payment</Button>
      </div>
    </form>
  );
}
