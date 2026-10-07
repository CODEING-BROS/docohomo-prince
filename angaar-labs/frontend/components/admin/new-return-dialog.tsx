"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Minus, Plus, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { formatMoneyExact, titleCase } from "@/lib/format";
import { Spinner } from "@/components/custom/loaders";

export type ReturnableItem = { orderItemId: number; productName: string; variantTitle: string | null; quantity: number; returnable: number; unitPrice: number };
type OrderOptions = { orderId: number; orderNumber: string; customerName: string | null; canReturn: boolean; why: string | null; items: ReturnableItem[]; reasons: string[]; refundRoom: number };

/** Choosing how many of each line come back. Shared by staff and the customer's own page. */
export function ReturnItemsPicker({ items, chosen, onChange }: { items: ReturnableItem[]; chosen: Record<number, number>; onChange: (next: Record<number, number>) => void }) {
  const set = (id: number, quantity: number) => onChange({ ...chosen, [id]: quantity });
  return (
    <ul className="divide-y rounded-lg border text-sm">
      {items.map((item) => {
        const quantity = chosen[item.orderItemId] ?? 0;
        return (
          <li key={item.orderItemId} className="flex items-center gap-3 px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="line-clamp-1 font-medium">{titleCase(item.productName)}</span>
              <span className="block text-xs text-muted-foreground">
                {[item.variantTitle, `${formatMoneyExact(item.unitPrice)} each`, item.returnable < item.quantity ? `${item.returnable} of ${item.quantity} left to return` : `${item.quantity} bought`].filter(Boolean).join(" · ")}
              </span>
            </span>
            {item.returnable === 0 ? (
              <span className="text-xs text-muted-foreground">Already returned</span>
            ) : (
              <span className="flex shrink-0 items-center gap-1">
                <Button type="button" variant="outline" size="icon-sm" aria-label={`One less of ${item.productName}`} disabled={quantity === 0} onClick={() => set(item.orderItemId, quantity - 1)}><Minus /></Button>
                <span className="w-7 text-center font-medium ledger">{quantity}</span>
                <Button type="button" variant="outline" size="icon-sm" aria-label={`One more of ${item.productName}`} disabled={quantity >= item.returnable} onClick={() => set(item.orderItemId, quantity + 1)}><Plus /></Button>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Staff opening a return for a customer who phoned or wrote in. Pass an order, or leave it empty to look one up by number. */
export function NewReturnDialog({ open, orderId, onClose }: { open: boolean; orderId?: number | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [typed, setTyped] = useState("");
  const [number, setNumber] = useState("");
  const [chosen, setChosen] = useState<Record<number, number>>({});
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");

  const lookup = orderId ? { id: String(orderId) } : number ? { number } : null;
  const { data, isFetching, error } = useQuery({
    queryKey: ["return-order", lookup],
    queryFn: () => api<OrderOptions>("/admin/returns/order", { query: lookup! }),
    enabled: open && lookup !== null,
    retry: false,
  });

  const close = () => {
    setTyped(""); setNumber(""); setChosen({}); setReason(""); setDescription("");
    onClose();
  };

  const create = useMutation({
    mutationFn: () =>
      api<{ returnNumber: string }>("/admin/returns", {
        method: "POST",
        body: { orderId: data!.orderId, reason, description, items: Object.entries(chosen).filter(([, quantity]) => quantity > 0).map(([id, quantity]) => ({ orderItemId: Number(id), quantity })) },
      }),
    onSuccess: (result) => {
      toast.success(`Return ${result.returnNumber} opened and approved. The customer has been told.`);
      ["returns", "orders", "order", "return-order"].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
      close();
    },
    onError: (err) => toast.error(err.message),
  });

  const units = Object.values(chosen).reduce((sum, quantity) => sum + quantity, 0);
  const value = data ? data.items.reduce((sum, item) => sum + item.unitPrice * (chosen[item.orderItemId] ?? 0), 0) : 0;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && close()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{data ? `Return items from order ${data.orderNumber}` : "Start a return"}</DialogTitle>
          <DialogDescription>
            {data ? `${data.customerName ?? "The customer"} sends these back. The return is approved straight away and they are told how to hand over the parcel.` : "For a customer who phoned or wrote in. Enter the order number to begin."}
          </DialogDescription>
        </DialogHeader>

        {!orderId ? (
          <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); setChosen({}); setNumber(typed.trim()); }}>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Order number, for example DH261005-12345" className="h-9" autoFocus />
            <Button type="submit" variant="outline" className="h-9" disabled={!typed.trim() || isFetching}>{isFetching ? <Spinner size="sm" /> : <Search />} Find</Button>
          </form>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error.message}</p> : null}
        {isFetching && !data ? <Skeleton className="h-32" /> : null}

        {data && !data.canReturn ? <p className="rounded-lg bg-warning/15 p-3 text-sm">{data.why}</p> : null}

        {data?.canReturn ? (
          <form id="new-return" className="grid gap-4" onSubmit={(event) => { event.preventDefault(); if (!create.isPending) create.mutate(); }}>
            <div className="grid gap-1.5">
              <Label>What is coming back</Label>
              <ReturnItemsPicker items={data.items} chosen={chosen} onChange={setChosen} />
              <p className="text-xs text-muted-foreground">
                {units > 0 ? `${units} ${units === 1 ? "unit" : "units"}, worth ${formatMoneyExact(value)} before any coupon. You confirm the refund when the parcel arrives.` : "Use the plus buttons to choose the units."}
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label>Reason</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger className="h-9 w-full"><SelectValue placeholder="Choose a reason" /></SelectTrigger>
                <SelectContent>{data.reasons.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="return-description">What the customer said <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Textarea id="return-description" rows={2} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </form>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={close}>Cancel</Button>
          <Button type="submit" form="new-return" loading={create.isPending} disabled={!data?.canReturn || units === 0 || !reason}>Open return
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
