"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, PackageCheck, Printer, RefreshCw, Send, Truck, TriangleAlert, Undo2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { shiprocketStatusQuery } from "@/components/admin/courier-settings";
import { StatusBadge } from "@/components/admin/parts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { formatDateTime, formatMoneyExact } from "@/lib/format";
import type { OrderDetail, Shipment, ShipmentStatus } from "@/lib/types";
import { ButtonSpinner, Spinner } from "@/components/custom/loaders";

// the plain words for a parcel's state, and the badge colour borrowed from the matching order status
const SHIPMENT_STATUS: Record<ShipmentStatus, { label: string; tone: string }> = {
  PENDING: { label: "Waiting", tone: "PENDING" },
  PICKUP_SCHEDULED: { label: "Pickup booked", tone: "CONFIRMED" },
  IN_TRANSIT: { label: "On the way", tone: "SHIPPED" },
  OUT_FOR_DELIVERY: { label: "Out for delivery", tone: "OUT_FOR_DELIVERY" },
  DELIVERED: { label: "Delivered", tone: "DELIVERED" },
  RTO: { label: "Returning", tone: "UNDELIVERED" },
  LOST: { label: "Lost", tone: "FAILED" },
  CANCELLED: { label: "Cancelled", tone: "ARCHIVED" },
};

// orders the server will not send to the courier
const CANNOT_SEND = ["CANCELLED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED", "RETURNED", "REFUNDED"];
const BEFORE_PICKUP: ShipmentStatus[] = ["PENDING", "PICKUP_SCHEDULED"];
const FINISHED: ShipmentStatus[] = ["DELIVERED", "RTO", "LOST", "CANCELLED"];

/** A delivery date is a plain date; show it as saved, whatever the timezone. */
const dayOnly = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });

/** Shiprocket gives times like "2024-01-12 14:22:00", in India time. */
const eventTime = (at: string) => {
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)$/.exec(at.trim());
  const date = new Date(match ? `${match[1]}T${match[2]}+05:30` : at);
  return Number.isNaN(date.getTime()) ? at : formatDateTime(date);
};

type Action =
  | { kind: "send" }
  | { kind: "book"; shipment: Shipment }
  | { kind: "label"; shipment: Shipment; tab: Window | null }
  | { kind: "refresh"; shipment: Shipment }
  | { kind: "recall"; shipment: Shipment };

type Confirm = { title: string; text: string; button: string; destructive?: boolean; action: Action };

export function OrderDelivery({ order }: { order: OrderDetail }) {
  const queryClient = useQueryClient();
  const { data: courier } = useQuery(shiprocketStatusQuery);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const refreshOrder = () => {
    queryClient.invalidateQueries({ queryKey: ["order", order.id] });
    queryClient.invalidateQueries({ queryKey: ["orders"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const act = useMutation({
    mutationFn: async (action: Action) => {
      switch (action.kind) {
        case "send": {
          const shipment = await api<Shipment>(`/admin/shiprocket/orders/${order.id}/ship`, { method: "POST" });
          if (shipment.trackingNumber) toast.success(`Sent to Shiprocket and the courier is booked. Tracking number ${shipment.trackingNumber}.`);
          else if (shipment.problem) toast.warning(`Sent to Shiprocket, but the courier could not be booked: ${shipment.problem}`, { duration: 12000 });
          else toast.success("Sent to Shiprocket. Press \"Book courier\" when the parcel is ready.");
          return;
        }
        case "book": {
          const shipment = await api<Shipment>(`/admin/shiprocket/shipments/${action.shipment.id}/book`, { method: "POST" });
          if (shipment.problem) toast.warning(shipment.problem, { duration: 12000 });
          else toast.success(`Courier booked${shipment.trackingNumber ? `. Tracking number ${shipment.trackingNumber}` : ""}. The pickup is scheduled.`);
          return;
        }
        case "label": {
          try {
            const { labelUrl } = await api<{ labelUrl: string }>(`/admin/shiprocket/shipments/${action.shipment.id}/label`, { method: "POST" });
            if (action.tab) action.tab.location.href = labelUrl;
            else toast.success("The label is ready", { action: { label: "Open", onClick: () => window.open(labelUrl, "_blank", "noopener") } });
          } catch (error) {
            action.tab?.close();
            throw error;
          }
          return;
        }
        case "refresh": {
          const shipment = await api<Shipment | null>(`/admin/shiprocket/shipments/${action.shipment.id}/refresh`, { method: "POST" });
          toast.success(shipment ? `Tracking checked: ${SHIPMENT_STATUS[shipment.status].label.toLowerCase()}` : "Tracking checked");
          return;
        }
        case "recall": {
          await api(`/admin/shiprocket/orders/${order.id}/cancel-shipment`, { method: "POST" });
          // the server notes on the parcel when Shiprocket says no, so look at it again
          const fresh = await api<OrderDetail>(`/admin/orders/${order.id}`);
          const after = fresh.shipments.find((s) => s.id === action.shipment.id);
          if (after?.status === "CANCELLED") toast.success("The parcel is called back. The order itself is still open; change its status below if needed.");
          else toast.warning(after?.problem ?? "Shiprocket did not call the parcel back. Check it in the Shiprocket panel.", { duration: 12000 });
          return;
        }
      }
    },
    onSuccess: () => setConfirm(null),
    onError: (err) => toast.error(err.message, { duration: 10000 }),
    onSettled: refreshOrder, // a failed step is noted on the parcel, so show that too
  });

  // the one step no system can do: someone packs the parcel and says so
  const markPacked = useMutation({
    mutationFn: () => api(`/admin/orders/${order.id}/status`, { method: "PATCH", body: { status: "PACKED", note: "Packed and labelled" } }),
    onSuccess: () => toast.success("Marked as packed. The courier will collect it and the rest happens by itself."),
    onError: (err) => toast.error(err.message),
    onSettled: refreshOrder,
  });

  const busy = (kind: Action["kind"], shipmentId?: number) =>
    act.isPending && act.variables?.kind === kind && (shipmentId === undefined || ("shipment" in act.variables && act.variables.shipment.id === shipmentId));

  const shipments = order.shipments ?? [];
  const withShiprocket = shipments.find((s) => s.providerOrderId && s.status !== "CANCELLED");
  const connected = courier?.connected ?? false;
  const mode = courier?.settings.mode;

  // why the order cannot go to Shiprocket right now, if it cannot
  const sendBlock = !courier?.settings.pickupPlace ? "Choose the pickup address in Shipping settings first."
    : order.paymentMethod === "ONLINE" && order.paymentStatus !== "PAID" ? "This order is waiting for its online payment."
    : !order.shippingAddress || !order.shippingPincode || !order.customerPhone ? "The order has no full delivery address or phone number."
    : null;
  const showSend = connected && !withShiprocket && mode !== undefined && mode !== "off" && !CANNOT_SEND.includes(order.status);

  return (
    <section className="grid gap-3">
      <h3 className="text-[0.6875rem]/none font-semibold tracking-[0.12em] text-muted-foreground uppercase">Delivery</h3>

      {shipments.length === 0 ? (
        <p className="text-muted-foreground">
          {mode === "auto" && connected && !CANNOT_SEND.includes(order.status)
            ? "Not with a courier yet. It goes to Shiprocket by itself once the order is ready."
            : "Not with a courier yet."}
        </p>
      ) : null}

      {shipments.map((shipment) => (
        <ShipmentCard
          key={shipment.id}
          shipment={shipment}
          connected={connected}
          busy={busy}
          onBook={() => setConfirm({
            title: "Book the courier?",
            text: "This books a real courier and a pickup through Shiprocket. The charge comes out of your Shiprocket balance.",
            button: "Book courier", action: { kind: "book", shipment },
          })}
          onLabel={() => act.mutate({ kind: "label", shipment, tab: window.open("about:blank", "_blank") })}
          onRefresh={() => act.mutate({ kind: "refresh", shipment })}
          onRecall={() => setConfirm({
            title: "Call back the parcel?",
            text: "Shiprocket cancels the parcel and the courier will not come for it. This only works before the pickup. The order itself stays open.",
            button: "Call back the parcel", destructive: true, action: { kind: "recall", shipment },
          })}
        />
      ))}

      {["CONFIRMED", "PROCESSING"].includes(order.status) && shipments.some((s) => s.trackingNumber && s.status !== "CANCELLED") ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
          <span className="min-w-0 flex-1">
            <span className="block font-medium">Pack this order</span>
            <span className="block text-muted-foreground">The courier is booked. Print the label, pack the parcel, stick the label on, then mark it as packed.</span>
          </span>
          <Button size="sm" disabled={markPacked.isPending} onClick={() => markPacked.mutate()}>
            {markPacked.isPending ? <Spinner size="sm" /> : <PackageCheck />}
            Mark as packed
          </Button>
        </div>
      ) : null}

      {showSend ? (
        <div className="grid gap-1.5">
          <Button
            className="h-9 w-fit"
            disabled={Boolean(sendBlock) || busy("send")}
            onClick={() => setConfirm({
              title: `Send ${order.orderNumber} to Shiprocket?`,
              text: courier?.settings.bookCourier
                ? "The order goes to Shiprocket and a real courier is booked straight away to collect the parcel. The charge comes out of your Shiprocket balance."
                : "The order goes to Shiprocket. The courier is booked when you press \"Book courier\" afterwards.",
              button: "Send to Shiprocket", action: { kind: "send" },
            })}
          >
            {busy("send") ? <Spinner size="sm" /> : <Send />}
            Send to Shiprocket
          </Button>
          {sendBlock ? (
            <p className="text-xs text-muted-foreground">
              {sendBlock}{" "}
              {sendBlock.startsWith("Choose") ? <Link href="/admin/shipping" className="text-primary underline-offset-2 hover:underline">Open Shipping settings</Link> : null}
            </p>
          ) : null}
        </div>
      ) : !withShiprocket && courier && !connected && shipments.length === 0 ? (
        <p className="text-xs text-muted-foreground">Shiprocket is not connected, so parcels cannot be sent from here.</p>
      ) : !withShiprocket && mode === "off" && shipments.length === 0 && connected ? (
        <p className="text-xs text-muted-foreground">
          Sending to Shiprocket is switched off in <Link href="/admin/shipping" className="text-primary underline-offset-2 hover:underline">Shipping settings</Link>.
        </p>
      ) : null}

      <Dialog open={confirm !== null} onOpenChange={(open) => !open && !act.isPending && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm?.title}</DialogTitle>
            <DialogDescription>{confirm?.text}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={act.isPending} onClick={() => setConfirm(null)}>Not now</Button>
            <Button variant={confirm?.destructive ? "destructive" : "default"} disabled={!confirm || act.isPending} onClick={() => confirm && act.mutate(confirm.action)}>
              {act.isPending ? <ButtonSpinner /> : null}{confirm?.button}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ShipmentCard({
  shipment, connected, busy, onBook, onLabel, onRefresh, onRecall,
}: {
  shipment: Shipment; connected: boolean; busy: (kind: Action["kind"], shipmentId?: number) => boolean;
  onBook: () => void; onLabel: () => void; onRefresh: () => void; onRecall: () => void;
}) {
  const [allEvents, setAllEvents] = useState(false);
  const status = SHIPMENT_STATUS[shipment.status] ?? { label: shipment.status, tone: "" };
  const atShiprocket = Boolean(shipment.providerRef) && connected;
  const open = !FINISHED.includes(shipment.status);
  const events = shipment.trackingEvents ?? [];
  const shownEvents = allEvents ? events : events.slice(0, 4);

  const canBook = atShiprocket && BEFORE_PICKUP.includes(shipment.status) && (!shipment.trackingNumber || Boolean(shipment.problem));
  const canLabel = atShiprocket && Boolean(shipment.trackingNumber) && shipment.status !== "CANCELLED";
  const canRefresh = atShiprocket && Boolean(shipment.trackingNumber) && shipment.status !== "CANCELLED";
  const canRecall = atShiprocket && Boolean(shipment.providerOrderId) && BEFORE_PICKUP.includes(shipment.status);

  return (
    <div className="grid gap-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-medium">
          <Truck className="size-4 text-muted-foreground" />
          {shipment.carrier ?? "Courier not booked yet"}
        </p>
        <StatusBadge status={status.tone} label={status.label} />
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div>
          <dt className="text-xs text-muted-foreground">Tracking number</dt>
          <dd>
            {shipment.trackingNumber ? (
              shipment.trackingUrl ? (
                <a href={shipment.trackingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline">
                  {shipment.trackingNumber} <ExternalLink className="size-3" />
                </a>
              ) : shipment.trackingNumber
            ) : <span className="text-muted-foreground">Not yet</span>}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{shipment.deliveredAt ? "Delivered" : "Expected delivery"}</dt>
          <dd>
            {shipment.deliveredAt ? formatDateTime(shipment.deliveredAt)
              : shipment.estimatedDelivery ? dayOnly.format(new Date(shipment.estimatedDelivery))
              : <span className="text-muted-foreground">Not known yet</span>}
          </dd>
        </div>
        {shipment.trackingNumber ? (
          <div>
            <dt className="text-xs text-muted-foreground">Tracking last checked</dt>
            <dd>{shipment.lastCheckedAt ? formatDateTime(shipment.lastCheckedAt) : <span className="text-muted-foreground">Not yet</span>}</dd>
          </div>
        ) : null}
        {shipment.shippingCost !== null || shipment.weightGrams ? (
          <div>
            <dt className="text-xs text-muted-foreground">Courier charge · weight</dt>
            <dd className="ledger">
              {[shipment.shippingCost !== null ? formatMoneyExact(shipment.shippingCost) : null, shipment.weightGrams ? `${shipment.weightGrams / 1000} kg` : null].filter(Boolean).join(" · ")}
            </dd>
          </div>
        ) : null}
      </dl>

      {shipment.problem ? (
        <p className="flex items-start gap-2 rounded-lg bg-warning/15 p-3">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>{shipment.problem}</span>
        </p>
      ) : null}

      {events.length > 0 ? (
        <div>
          <p className="mb-2 text-xs text-muted-foreground">Where the parcel has been</p>
          <ol className="grid gap-2.5">
            {shownEvents.map((event, i) => (
              <li key={`${event.at}-${i}`} className="flex gap-3">
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${i === 0 ? "bg-primary" : "bg-muted-foreground/40"}`} />
                <div>
                  <p className={i === 0 ? "font-medium" : ""}>{event.status || "Update"}</p>
                  <p className="text-xs text-muted-foreground">{[eventTime(event.at), event.place].filter(Boolean).join(" · ")}</p>
                </div>
              </li>
            ))}
          </ol>
          {events.length > 4 ? (
            <Button variant="link" className="h-auto px-0 text-xs" onClick={() => setAllEvents(!allEvents)}>
              {allEvents ? "Show fewer" : `Show all ${events.length} updates`}
            </Button>
          ) : null}
        </div>
      ) : shipment.trackingNumber && open ? (
        <p className="text-xs text-muted-foreground">No tracking updates yet. Tracking is checked by itself every half hour.</p>
      ) : null}

      {canBook || canLabel || canRefresh || canRecall ? (
        <div className="flex flex-wrap gap-2">
          {canBook ? (
            <Button size="sm" disabled={busy("book", shipment.id)} onClick={onBook}>
              {busy("book", shipment.id) ? <Spinner size="sm" /> : <Truck />}
              Book courier
            </Button>
          ) : null}
          {canLabel ? (
            shipment.labelUrl ? (
              <Button size="sm" variant="outline" asChild>
                <a href={shipment.labelUrl} target="_blank" rel="noopener noreferrer"><Printer /> Print label</a>
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled={busy("label", shipment.id)} onClick={onLabel}>
                {busy("label", shipment.id) ? <Spinner size="sm" /> : <Printer />}
                Print label
              </Button>
            )
          ) : null}
          {canRefresh ? (
            <Button size="sm" variant="outline" disabled={busy("refresh", shipment.id)} onClick={onRefresh}>
              {busy("refresh", shipment.id) ? <Spinner size="sm" /> : <RefreshCw />}
              Check tracking now
            </Button>
          ) : null}
          {canRecall ? (
            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={busy("recall", shipment.id)} onClick={onRecall}>
              {busy("recall", shipment.id) ? <Spinner size="sm" /> : <Undo2 />}
              Call back the parcel
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
