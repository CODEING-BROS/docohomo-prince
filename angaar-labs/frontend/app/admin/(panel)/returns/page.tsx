"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Minus, PackageOpen, Plus, RefreshCw, Settings2, TriangleAlert, Truck, Undo2, X } from "lucide-react";
import Link from "next/link";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { BulkActions, SelectPage, SelectRow, useSelection } from "@/components/admin/bulk";
import { NewReturnDialog } from "@/components/admin/new-return-dialog";
import { EmptyState, PageHeader, PaginationBar, SearchInput, StatusBadge } from "@/components/admin/parts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useUrlState } from "@/hooks/use-url-state";
import { api } from "@/lib/api";
import { formatDateTime, formatMoneyExact, formatNumber, titleCase } from "@/lib/format";
import type { Paged } from "@/lib/types";
import { FilterChips } from "@/components/custom/filter-chips";
import { SectionCard } from "@/components/custom/section-card";
import { Spinner } from "@/components/custom/loaders";

type ReturnStatus = "REQUESTED" | "APPROVED" | "REJECTED" | "PICKED_UP" | "RECEIVED" | "REFUNDED" | "CLOSED" | "CANCELLED";
type ReturnItem = { id: number; quantity: number; restocked: number; productName: string; variantTitle: string | null; sku: string | null; bought: number; unitPrice: number };
type ReturnRow = {
  id: number; returnNumber: string; orderId: number; reason: string; description: string | null; photoUrls: string[]; status: ReturnStatus;
  refundAmount: number | null; adminNote: string | null; requestedById: number | null; createdAt: string;
  pickupCourier: string | null; pickupTracking: string | null; pickupBooked: boolean; pickupTrackingUrl: string | null; pickupStatus: string | null;
  pickupProblem: string | null; pickupArrivedAt: string | null; receivedAt: string | null; refundMethod: string | null; refundReference: string | null; refundedAt: string | null;
  order: { id: number; orderNumber: string; paymentMethod: string; paymentStatus: string; grandTotal: number; deliveredAt: string | null; customerName: string | null; customerPhone: string | null; shippingAddress: string | null; shippingCity: string | null; shippingState: string | null; shippingPincode: string | null };
  items: ReturnItem[]; units: number;
  refund: { status: "PENDING" | "SUCCESS" | "FAILED"; error: string | null } | null;
};
type ReturnDetail = ReturnRow & { gateway: { left: number; test: boolean } | null; courier: { ready: boolean; why: string | null; automatic: boolean } };
type Rules = { windowDays: number; autoApprove: boolean; reasons: string[]; instructions: string };
type ReturnList = Paged<ReturnRow> & { statusCounts: Partial<Record<ReturnStatus, number>>; settings: Rules; automaticRefunds: boolean };

const STATUSES: ReturnStatus[] = ["REQUESTED", "APPROVED", "PICKED_UP", "RECEIVED", "REFUNDED", "CLOSED", "REJECTED", "CANCELLED"];
const LABEL: Record<ReturnStatus, string> = {
  REQUESTED: "Waiting for a decision", APPROVED: "Approved, parcel awaited", PICKED_UP: "On its way back", RECEIVED: "Received, refund due",
  REFUNDED: "Refunded", CLOSED: "Closed, no refund", REJECTED: "Not accepted", CANCELLED: "Cancelled",
};
const TONE: Record<ReturnStatus, string> = { REQUESTED: "PENDING", APPROVED: "CONFIRMED", PICKED_UP: "SHIPPED", RECEIVED: "PROCESSING", REFUNDED: "SUCCESS", CLOSED: "ARCHIVED", REJECTED: "CANCELLED", CANCELLED: "ARCHIVED" };
const PAID_BY: Record<string, string> = { COD: "Paid on delivery", ONLINE: "Paid online", CREDIT: "On credit", BANK_TRANSFER: "Bank transfer" };

type Step = "approve" | "reject" | "pickup" | "receive" | "other-refund" | "close" | "cancel" | null;

const Actions = ({ children }: { children: React.ReactNode }) => <div className="flex flex-wrap justify-end gap-2">{children}</div>;
const Back = ({ busy, onBack }: { busy: boolean; onBack: () => void }) => <Button variant="outline" size="sm" disabled={busy} onClick={onBack}>Back</Button>;
const Go = ({ busy, label, disabled, destructive, onClick }: { busy: boolean; label: string; disabled?: boolean; destructive?: boolean; onClick: () => void }) => (
  <Button size="sm" variant={destructive ? "destructive" : "default"} disabled={busy || disabled} onClick={onClick}>{busy ? <Spinner size="sm" /> : null}{label}</Button>
);

function ReturnPanel({ returnId, automaticRefunds, onClose }: { returnId: number | null; automaticRefunds: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>(null);
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState("");
  const [courier, setCourier] = useState("");
  const [tracking, setTracking] = useState("");
  const [restock, setRestock] = useState<Record<number, number>>({});
  const [method, setMethod] = useState<"BANK" | "CREDIT">("BANK");
  const [reference, setReference] = useState("");

  const { data: r, isPending } = useQuery({ queryKey: ["returns", "one", returnId], queryFn: () => api<ReturnDetail>(`/admin/returns/${returnId}`), enabled: returnId !== null });

  const begin = (next: Step) => {
    if (!r) return;
    setNote(""); setReference(""); setCourier(""); setTracking("");
    setAmount(String(r.refundAmount ?? 0));
    setRestock(Object.fromEntries(r.items.map((item) => [item.id, item.quantity])));
    setStep(next);
  };

  const act = useMutation({
    mutationFn: (input: { path: string; body: Record<string, unknown>; done: string }) => api<{ refundStarted?: boolean; status?: string; pickupProblem?: string | null }>(`/admin/returns/${returnId}/${input.path}`, { method: "POST", body: input.body }),
    onSuccess: (result, input) => {
      toast.success(result.refundStarted ? `${input.done} The refund was sent automatically.` : result.status === "PENDING" ? "Refund sent to the bank. It shows as refunded once the bank confirms it." : input.done);
      if (result.pickupProblem) toast.warning(`The courier booking could not be cancelled at Shiprocket: ${result.pickupProblem}. Cancel it there by hand.`);
      setStep(null);
      ["returns", "orders", "order", "refunds", "inventory"].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
    },
    onError: (err) => { toast.error(err.message); queryClient.invalidateQueries({ queryKey: ["returns"] }); },
  });
  const busy = act.isPending;
  const amountNumber = Number(amount);
  const amountBad = amount === "" || !(amountNumber >= 0);
  const refundAmount = r?.refundAmount ?? 0;
  const gatewayFits = Boolean(r?.gateway && r.gateway.left + 0.005 >= refundAmount);
  const refundOnItsWay = r?.refund?.status === "PENDING";

  return (
    <Sheet open={returnId !== null} onOpenChange={(open) => { if (!open) { setStep(null); onClose(); } }}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-xl">
        {isPending || !r ? (
          <>
            <SheetHeader><SheetTitle>Return</SheetTitle><SheetDescription>Loading…</SheetDescription></SheetHeader>
            <div className="grid gap-3 p-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-14" />)}</div>
          </>
        ) : (
          <>
            <SheetHeader className="border-b">
              <SheetTitle className="flex flex-wrap items-center gap-2">{r.returnNumber} <StatusBadge status={TONE[r.status]} label={LABEL[r.status]} /></SheetTitle>
              <SheetDescription>
                {r.requestedById ? "Asked for by the customer" : "Opened by staff"} on {formatDateTime(r.createdAt)} · Order{" "}
                <Link href={`/admin/orders?q=${encodeURIComponent(r.order.orderNumber)}`} className="font-medium text-foreground hover:underline">{r.order.orderNumber}</Link>
              </SheetDescription>
            </SheetHeader>

            <div className="grid gap-5 p-4 text-sm">
              <section className="grid gap-1">
                <h3 className="text-[0.6875rem]/none font-semibold tracking-[0.12em] text-muted-foreground uppercase">Customer</h3>
                <p className="font-medium">{r.order.customerName ?? "—"}{r.order.customerPhone ? <span className="ml-2 font-normal text-muted-foreground">{r.order.customerPhone}</span> : null}</p>
                <p className="text-muted-foreground">{[r.order.shippingAddress, r.order.shippingCity, r.order.shippingState, r.order.shippingPincode].filter(Boolean).join(", ")}</p>
                <p className="text-muted-foreground">
                  Order total {formatMoneyExact(r.order.grandTotal)} · {PAID_BY[r.order.paymentMethod] ?? r.order.paymentMethod}
                  {r.order.deliveredAt ? ` · Delivered ${formatDateTime(r.order.deliveredAt)}` : ""}
                </p>
              </section>

              <section className="grid gap-1.5">
                <h3 className="text-[0.6875rem]/none font-semibold tracking-[0.12em] text-muted-foreground uppercase">Why</h3>
                <p className="font-medium">{r.reason}</p>
                {r.description ? <p className="text-muted-foreground">{r.description}</p> : null}
                {r.photoUrls.length > 0 ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {r.photoUrls.map((url) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <a key={url} href={url} target="_blank" rel="noreferrer"><img src={url} alt="Photo sent by the customer" className="size-20 rounded-md border object-cover" /></a>
                    ))}
                  </div>
                ) : null}
              </section>

              <section className="grid gap-1.5">
                <h3 className="text-[0.6875rem]/none font-semibold tracking-[0.12em] text-muted-foreground uppercase">Coming back</h3>
                <ul className="divide-y rounded-lg border">
                  {r.items.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="min-w-0">
                        <span className="line-clamp-1 font-medium">{titleCase(item.productName)}</span>
                        <span className="block text-xs text-muted-foreground">{[item.variantTitle, item.sku, `${formatMoneyExact(item.unitPrice)} each`].filter(Boolean).join(" · ")}</span>
                      </span>
                      <span className="shrink-0 text-right ledger">
                        {item.quantity} of {item.bought}
                        {r.receivedAt ? <span className="block text-xs text-muted-foreground">{item.restocked} back in stock</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="flex justify-between pt-1"><span className="text-muted-foreground">Refund</span><span className="font-semibold ledger">{formatMoneyExact(refundAmount)}</span></p>
                {r.pickupCourier || r.pickupTracking ? (
                  <p className="text-muted-foreground">
                    Pickup: {[r.pickupCourier, r.pickupTracking].filter(Boolean).join(" · ")}
                    {r.pickupTrackingUrl ? <> · <a href={r.pickupTrackingUrl} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">Track</a></> : null}
                    {r.pickupBooked && r.pickupStatus ? <span className="block">Courier says: {r.pickupStatus}</span> : null}
                  </p>
                ) : null}
                {r.adminNote ? <p className="rounded-lg bg-surface-2 p-3 text-muted-foreground"><span className="font-medium text-foreground">Told to the customer:</span> {r.adminNote}</p> : null}
                {r.status === "REFUNDED" ? (
                  <p className="text-muted-foreground">
                    Refunded {r.refundedAt ? formatDateTime(r.refundedAt) : ""}{" "}
                    {r.refundMethod === "GATEWAY" ? "through the payment gateway" : r.refundMethod === "BANK" ? `by bank transfer or UPI (reference ${r.refundReference})` : `by taking it off what they owe${r.refundReference ? ` (${r.refundReference})` : ""}`}
                  </p>
                ) : null}
              </section>

              {/* what staff do next */}
              {r.status === "REQUESTED" ? (
                <section className="grid gap-3 rounded-lg border p-3">
                  <h3 className="font-medium">Decide on this request</h3>
                  {step === "approve" ? (
                    <>
                      <div className="grid gap-1.5">
                        <Label htmlFor="approve-amount">Refund once the parcel arrives (₹)</Label>
                        <Input id="approve-amount" type="number" inputMode="decimal" min={0} step="0.01" className="h-9" value={amount} onChange={(e) => setAmount(e.target.value)} />
                        <p className="text-xs text-muted-foreground">The price of the items, less their share of any coupon. Add the delivery charge if the mistake was ours.</p>
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="approve-note">Message to the customer <span className="font-normal text-muted-foreground">(optional)</span></Label>
                        <Textarea id="approve-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Leave empty to send the usual pickup instructions" />
                      </div>
                      <Actions><Back busy={busy} onBack={() => setStep(null)} /><Go busy={busy} label="Approve return" disabled={amountBad} onClick={() => act.mutate({ path: "approve", body: { refundAmount: amountNumber, note }, done: "Return approved. The customer has been told." })} /></Actions>
                    </>
                  ) : step === "reject" ? (
                    <>
                      <div className="grid gap-1.5">
                        <Label htmlFor="reject-note">Why it is not accepted</Label>
                        <Textarea id="reject-note" rows={2} maxLength={500} autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="The customer sees this" />
                      </div>
                      <Actions><Back busy={busy} onBack={() => setStep(null)} /><Go busy={busy} destructive label="Reject return" disabled={note.trim().length < 3} onClick={() => act.mutate({ path: "reject", body: { note }, done: "Return rejected. The customer has been told why." })} /></Actions>
                    </>
                  ) : (
                    <Actions>
                      <Button size="sm" variant="outline" onClick={() => begin("reject")}>Reject</Button>
                      <Button size="sm" onClick={() => begin("approve")}>Approve</Button>
                    </Actions>
                  )}
                </section>
              ) : null}

              {r.status === "APPROVED" || r.status === "PICKED_UP" ? (
                <section className="grid gap-3 rounded-lg border p-3">
                  <h3 className="font-medium">{r.status === "APPROVED" ? "Waiting for the parcel" : "The parcel is on its way back"}</h3>
                  {step === "pickup" ? (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="grid gap-1.5"><Label htmlFor="pickup-courier">Courier <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="pickup-courier" className="h-9" maxLength={80} value={courier} onChange={(e) => setCourier(e.target.value)} /></div>
                        <div className="grid gap-1.5"><Label htmlFor="pickup-tracking">Tracking number <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="pickup-tracking" className="h-9" maxLength={80} value={tracking} onChange={(e) => setTracking(e.target.value)} /></div>
                      </div>
                      <Actions><Back busy={busy} onBack={() => setStep(null)} /><Go busy={busy} label="Mark as picked up" onClick={() => act.mutate({ path: "pickup", body: { courier, tracking }, done: "Marked as picked up." })} /></Actions>
                    </>
                  ) : step === "receive" ? (
                    <>
                      <div className="grid gap-1.5">
                        <Label>How many are fit to sell again</Label>
                        <ul className="divide-y rounded-lg border">
                          {r.items.map((item) => {
                            const quantity = restock[item.id] ?? 0;
                            return (
                              <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2">
                                <span className="min-w-0">
                                  <span className="line-clamp-1">{titleCase(item.productName)}</span>
                                  <span className="block text-xs text-muted-foreground">{item.quantity} came back</span>
                                </span>
                                <span className="flex shrink-0 items-center gap-1">
                                  <Button type="button" variant="outline" size="icon-sm" aria-label="One less" disabled={quantity === 0} onClick={() => setRestock({ ...restock, [item.id]: quantity - 1 })}><Minus /></Button>
                                  <span className="w-7 text-center font-medium ledger">{quantity}</span>
                                  <Button type="button" variant="outline" size="icon-sm" aria-label="One more" disabled={quantity >= item.quantity} onClick={() => setRestock({ ...restock, [item.id]: quantity + 1 })}><Plus /></Button>
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                        <p className="text-xs text-muted-foreground">These go back into stock. Damaged, opened or expired units stay out.</p>
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="receive-amount">Refund (₹)</Label>
                        <Input id="receive-amount" type="number" inputMode="decimal" min={0} step="0.01" className="h-9" value={amount} onChange={(e) => setAmount(e.target.value)} />
                        <p className="text-xs text-muted-foreground">
                          {amountNumber === 0 ? "With no refund, the return is closed straight away."
                            : automaticRefunds && r.gateway ? "Automatic refunds are on: this amount goes back to the customer as soon as you confirm."
                            : "You send the refund in the next step."}
                        </p>
                      </div>
                      <Actions>
                        <Back busy={busy} onBack={() => setStep(null)} />
                        <Go
                          busy={busy}
                          label="Confirm parcel received" disabled={amountBad}
                          onClick={() => act.mutate({ path: "receive", body: { refundAmount: amountNumber, restock: Object.entries(restock).map(([id, quantity]) => ({ returnItemId: Number(id), quantity })) }, done: "Parcel received and stock updated." })}
                        />
                      </Actions>
                    </>
                  ) : step === "cancel" ? (
                    <>
                      <div className="grid gap-1.5">
                        <Label htmlFor="cancel-note">Why the return is cancelled</Label>
                        <Textarea id="cancel-note" rows={2} maxLength={500} autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: the customer decided to keep it. The customer sees this." />
                        {r.pickupBooked ? <p className="text-xs text-muted-foreground">The courier booking is cancelled at Shiprocket too.</p> : null}
                      </div>
                      <Actions><Back busy={busy} onBack={() => setStep(null)} /><Go busy={busy} destructive label="Cancel this return" disabled={note.trim().length < 3} onClick={() => act.mutate({ path: "cancel", body: { note }, done: "Return cancelled. The customer has been told." })} /></Actions>
                    </>
                  ) : (
                    <>
                      {r.pickupArrivedAt ? (
                        <p className="flex items-start gap-2 rounded-lg bg-success/10 p-3"><PackageOpen className="mt-0.5 size-4 shrink-0 text-success" /> The courier delivered this parcel back to you on {formatDateTime(r.pickupArrivedAt)}. Open it and confirm what came back.</p>
                      ) : r.pickupBooked ? (
                        <p className="text-muted-foreground">
                          {r.status === "APPROVED" ? "A courier is booked to collect the parcel from the customer." : "The courier has the parcel."} Tracking is checked every half hour and this page updates by itself.
                        </p>
                      ) : r.status === "APPROVED" ? (
                        <p className="text-muted-foreground">
                          {r.courier.ready
                            ? r.courier.automatic ? "The courier is booked automatically. If it has not appeared here in a minute, book it with the button." : "Book a courier to collect the parcel from the customer's address, or arrange the pickup yourself."
                            : <>{r.courier.why} Until then, arrange the pickup yourself. <Link href="/admin/shipping" className="text-primary hover:underline">Shipping settings</Link></>}
                        </p>
                      ) : (
                        <p className="text-muted-foreground">When the parcel reaches you, open it and confirm what came back.</p>
                      )}
                      {r.pickupProblem ? <p className="flex items-start gap-2 text-destructive"><TriangleAlert className="mt-0.5 size-4 shrink-0" /> {r.pickupProblem}</p> : null}
                      <Actions>
                        {r.status === "APPROVED" ? <Button size="sm" variant="ghost" onClick={() => begin("cancel")}>Cancel return</Button> : null}
                        {r.pickupBooked && !r.pickupArrivedAt ? (
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => act.mutate({ path: "check-pickup", body: {}, done: "Asked the courier. The latest is shown above." })}><RefreshCw /> Check now</Button>
                        ) : null}
                        {r.status === "APPROVED" && !r.pickupBooked ? <Button size="sm" variant="outline" onClick={() => begin("pickup")}>I arranged the pickup</Button> : null}
                        {r.status === "APPROVED" && !r.pickupBooked && r.courier.ready ? (
                          <Button size="sm" variant={r.pickupArrivedAt ? "outline" : "default"} disabled={busy} onClick={() => act.mutate({ path: "book-pickup", body: {}, done: "Courier booked. The customer has been sent the tracking number." })}>
                            {busy ? <Spinner size="sm" /> : <Truck />} Book courier pickup
                          </Button>
                        ) : null}
                        <Button size="sm" variant={r.status === "APPROVED" && !r.pickupBooked && r.courier.ready ? "outline" : "default"} onClick={() => begin("receive")}><PackageOpen /> Parcel received</Button>
                      </Actions>
                    </>
                  )}
                </section>
              ) : null}

              {r.status === "RECEIVED" ? (
                <section className="grid gap-3 rounded-lg border p-3">
                  <h3 className="font-medium">Refund {formatMoneyExact(refundAmount)}</h3>
                  {refundOnItsWay ? (
                    <p className="text-muted-foreground">The refund has been sent and is waiting for the bank to confirm it. Nothing more to do.</p>
                  ) : step === "other-refund" ? (
                    <>
                      <div className="grid gap-1.5">
                        <Label>How it was given back</Label>
                        <Select value={method} onValueChange={(value) => setMethod(value as "BANK" | "CREDIT")}>
                          <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="BANK">I sent it by bank transfer or UPI</SelectItem>
                            <SelectItem value="CREDIT">Taken off what this customer owes</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="refund-reference">{method === "BANK" ? "Bank or UPI reference" : "Note (optional)"}</Label>
                        <Input id="refund-reference" className="h-9" maxLength={120} value={reference} onChange={(e) => setReference(e.target.value)} />
                      </div>
                      <Actions><Back busy={busy} onBack={() => setStep(null)} /><Go busy={busy} label="Mark as refunded" disabled={method === "BANK" && !reference.trim()} onClick={() => act.mutate({ path: "refund", body: { method, reference }, done: "Return marked as refunded. The customer has been told." })} /></Actions>
                    </>
                  ) : step === "close" ? (
                    <>
                      <div className="grid gap-1.5">
                        <Label htmlFor="close-note">Why no refund is being made</Label>
                        <Textarea id="close-note" rows={2} maxLength={500} autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="The customer sees this" />
                      </div>
                      <Actions><Back busy={busy} onBack={() => setStep(null)} /><Go busy={busy} destructive label="Close without a refund" disabled={note.trim().length < 3} onClick={() => act.mutate({ path: "close", body: { note }, done: "Return closed without a refund." })} /></Actions>
                    </>
                  ) : (
                    <>
                      {r.refund?.status === "FAILED" ? <p className="flex items-start gap-2 text-destructive"><TriangleAlert className="mt-0.5 size-4 shrink-0" /> The last try did not go through: {r.refund.error}</p> : null}
                      <p className="text-muted-foreground">
                        {gatewayFits
                          ? r.gateway?.test ? "The customer paid with a test payment, so no real money moves." : "The customer paid online, so the money can go straight back to where they paid from."
                          : r.gateway ? `Only ${formatMoneyExact(r.gateway.left)} of the online payment is left, so this refund has to be sent another way.`
                          : "This order was not paid through the payment gateway, so send the money yourself and record it here."}
                      </p>
                      <Actions>
                        <Button size="sm" variant="ghost" onClick={() => begin("close")}>No refund</Button>
                        <Button size="sm" variant="outline" onClick={() => begin("other-refund")}>Refunded another way</Button>
                        {gatewayFits ? <Go busy={busy} label={`Refund ${formatMoneyExact(refundAmount)} now`} onClick={() => act.mutate({ path: "refund", body: { method: "GATEWAY" }, done: `${formatMoneyExact(refundAmount)} refunded to the customer.` })} /> : null}
                      </Actions>
                    </>
                  )}
                </section>
              ) : null}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** How long customers have, whether requests are approved by themselves, and the reasons they choose from. */
function RulesDialog({ rules, onClose }: { rules: Rules | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<(Omit<Rules, "windowDays"> & { windowDays: string }) | null>(null);
  const [seen, setSeen] = useState<Rules | null>(null);
  const [adding, setAdding] = useState("");
  if (rules !== seen) {
    setSeen(rules);
    setDraft(rules ? { ...rules, windowDays: String(rules.windowDays) } : null);
    setAdding("");
  }
  const save = useMutation({
    mutationFn: () => api<Rules>("/admin/returns/settings", { method: "PUT", body: { ...draft, windowDays: Number(draft!.windowDays || 0) } }),
    onSuccess: () => { toast.success("Return rules saved"); queryClient.invalidateQueries({ queryKey: ["returns"] }); onClose(); },
    onError: (err) => toast.error(err.message),
  });
  const addReason = () => {
    const text = adding.trim();
    if (!draft || text.length < 3 || draft.reasons.includes(text)) return;
    setDraft({ ...draft, reasons: [...draft.reasons, text] });
    setAdding("");
  };

  return (
    <Dialog open={rules !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Return rules</DialogTitle>
          <DialogDescription>What customers can do by themselves. Staff can always open a return for any delivered order.</DialogDescription>
        </DialogHeader>
        {draft ? (
          <form id="return-rules" className="grid gap-4" onSubmit={(event) => { event.preventDefault(); if (!save.isPending) save.mutate(); }}>
            <div className="grid gap-1.5">
              <Label htmlFor="rules-days">Days after delivery a customer can ask for a return</Label>
              <Input id="rules-days" type="number" inputMode="numeric" min={0} max={90} step={1} className="h-9 w-32" value={draft.windowDays} onChange={(e) => setDraft({ ...draft, windowDays: e.target.value })} />
              <p className="text-xs text-muted-foreground">0 means customers cannot ask online at all.</p>
            </div>
            <label className="flex items-start justify-between gap-3 rounded-lg border p-3 text-sm">
              <span>
                Approve requests automatically
                <span className="block text-xs text-muted-foreground">On: a request inside the time limit is approved at once and the customer gets the pickup instructions. Off: staff decide each one.</span>
              </span>
              <Switch checked={draft.autoApprove} onCheckedChange={(autoApprove) => setDraft({ ...draft, autoApprove })} />
            </label>
            <div className="grid gap-1.5">
              <Label>Reasons the customer chooses from</Label>
              <ul className="grid gap-1">
                {draft.reasons.map((reason) => (
                  <li key={reason} className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm">
                    {reason}
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove "${reason}"`} disabled={draft.reasons.length === 1} onClick={() => setDraft({ ...draft, reasons: draft.reasons.filter((r) => r !== reason) })}><X /></Button>
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <Input className="h-9" maxLength={80} placeholder="Add a reason" value={adding} onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addReason(); } }} />
                <Button type="button" variant="outline" className="h-9" disabled={adding.trim().length < 3} onClick={addReason}><Plus /> Add</Button>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rules-instructions">Pickup instructions sent when a return is approved</Label>
              <Textarea id="rules-instructions" rows={3} maxLength={600} value={draft.instructions} onChange={(e) => setDraft({ ...draft, instructions: e.target.value })} />
            </div>
          </form>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="return-rules" loading={save.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReturnsView() {
  const url = useUrlState();
  const [opening, setOpening] = useState(false);
  const [rules, setRules] = useState<Rules | null>(null);
  const filters = { q: url.get("q"), status: url.get("status"), page: url.get("page") || "1", pageSize: url.get("pageSize") || "20" };
  const openId = url.get("open") ? Number(url.get("open")) : null;

  const { data, isPending, isError } = useQuery({
    queryKey: ["returns", "list", filters],
    queryFn: () => api<ReturnList>("/admin/returns", { query: filters }),
    placeholderData: (previous) => previous,
  });

  const selection = useSelection((data?.items ?? []).map((row) => row.id));
  const counts = data?.statusCounts ?? {};
  const tabs = [
    { value: "", label: "All", count: Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0) },
    ...STATUSES.filter((s) => counts[s] || filters.status === s).map((s) => ({ value: s as string, label: LABEL[s], count: counts[s] ?? 0 })),
  ];
  const hasFilters = Boolean(filters.q || filters.status);

  return (
    <>
      <PageHeader title="Returns" description="Items customers send back: decide, receive the parcel, put stock back and refund">
        <Button variant="outline" className="h-9" disabled={!data} onClick={() => data && setRules(data.settings)}><Settings2 /> Return rules</Button>
        <Button className="h-9" onClick={() => setOpening(true)}><Plus /> New return</Button>
      </PageHeader>

      {data ? (
        <p className="mb-4 text-sm text-muted-foreground">
          {data.settings.windowDays === 0 ? "Customers cannot ask for a return online." : `Customers can ask for a return for ${data.settings.windowDays} ${data.settings.windowDays === 1 ? "day" : "days"} after delivery.`}{" "}
          {data.settings.autoApprove ? "Requests are approved automatically." : "You decide each request."}{" "}
          {data.automaticRefunds ? "Refunds for online payments go out as soon as the parcel is received." : "Refunds wait for you to send them."}
        </p>
      ) : null}

      <FilterChips ariaLabel="Status" className="mb-3" value={filters.status || "all"} onChange={(v) => url.set({ status: v === "all" ? "" : v })} options={tabs.map((tab) => ({ value: tab.value || "all", label: tab.label, count: tab.count }))} />

      <SectionCard flush>
        <div className="flex flex-wrap items-center gap-2 border-b border-foreground/18 bg-surface-2 px-3 py-2">
          <SearchInput value={filters.q} onChange={(q) => url.set({ q })} placeholder="Return, order, customer or phone…" className="w-full sm:w-72" />
          {hasFilters ? <Button variant="ghost" className="h-9" onClick={url.clear}>Clear filters</Button> : null}
          <BulkActions table="returns" noun="returns" selection={selection} exportable={false} refresh={["returns"]} deleteNote="Only rejected and cancelled returns are removed. Returns that are open, received or refunded are kept." />
        </div>

        {isError ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Could not load returns. Check that the backend is running.</p>
        ) : isPending || !data ? (
          <div className="grid gap-2 p-4">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : data.items.length === 0 ? (
          <EmptyState
            icon={Undo2}
            title={hasFilters ? "No returns match" : "No returns yet"}
            description={hasFilters ? "Try a different search or status, or clear the filters." : "When a customer asks to send something back it appears here. For a customer who phones in, use New return."}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 pl-4"><SelectPage selection={selection} noun="returns" /></TableHead>
                <TableHead>Return</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Units</TableHead>
                <TableHead className="text-right">Refund</TableHead>
                <TableHead className="pr-4">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((row) => (
                <TableRow key={row.id} className="cursor-pointer" data-state={selection.has(row.id) ? "selected" : undefined} onClick={() => url.set({ open: row.id, page: filters.page })}>
                  <TableCell className="pl-4"><SelectRow selection={selection} id={row.id} label={row.returnNumber} /></TableCell>
                  <TableCell>
                    <div className="font-medium">{row.returnNumber}</div>
                    <div className="text-xs text-muted-foreground">{formatDateTime(row.createdAt)}</div>
                  </TableCell>
                  <TableCell>{row.order.orderNumber}</TableCell>
                  <TableCell><div className="max-w-44 truncate">{row.order.customerName ?? "—"}</div></TableCell>
                  <TableCell><div className="max-w-52 truncate text-muted-foreground" title={row.reason}>{row.reason}</div></TableCell>
                  <TableCell className="text-right ledger">{formatNumber(row.units)}</TableCell>
                  <TableCell className="text-right font-medium ledger">{formatMoneyExact(row.refundAmount ?? 0)}</TableCell>
                  <TableCell className="pr-4">
                    <StatusBadge status={TONE[row.status]} label={LABEL[row.status]} />
                    {row.refund?.status === "PENDING" ? <div className="mt-0.5 text-xs text-muted-foreground">Refund on its way</div> : null}
                    {row.status === "PICKED_UP" && row.pickupArrivedAt ? <div className="mt-0.5 text-xs font-medium text-success">Parcel has arrived: open it</div> : null}
                    {row.status === "APPROVED" && row.pickupBooked && !row.pickupProblem ? <div className="mt-0.5 text-xs text-muted-foreground">Courier booked</div> : null}
                    {(row.status === "APPROVED" || row.status === "PICKED_UP") && row.pickupProblem ? <div className="mt-0.5 text-xs text-destructive">Pickup problem</div> : null}
                    {row.status === "RECEIVED" && row.refund?.status === "FAILED" ? <div className="mt-0.5 text-xs text-destructive">Refund did not go through</div> : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {data ? (
          <PaginationBar page={data.page} pageCount={data.pageCount} pageSize={data.pageSize} total={data.total} noun="returns" onPage={(page) => url.set({ page })} onPageSize={(pageSize) => url.set({ pageSize })} />
        ) : null}
      </SectionCard>

      <ReturnPanel key={openId ?? "none"} returnId={openId} automaticRefunds={data?.automaticRefunds ?? false} onClose={() => url.set({ open: null, page: filters.page })} />
      <NewReturnDialog open={opening} onClose={() => setOpening(false)} />
      <RulesDialog rules={rules} onClose={() => setRules(null)} />
    </>
  );
}

export default function ReturnsPage() {
  return (
    <Suspense>
      <ReturnsView />
    </Suspense>
  );
}
