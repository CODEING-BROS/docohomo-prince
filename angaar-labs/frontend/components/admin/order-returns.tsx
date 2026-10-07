"use client";

import { Undo2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { NewReturnDialog } from "@/components/admin/new-return-dialog";
import { Button } from "@/components/ui/button";

/** On a delivered order: start a return for the customer, or jump to the ones already opened. */
export function OrderReturns({ orderId, orderNumber, status }: { orderId: number; orderNumber: string; status: string }) {
  const [opening, setOpening] = useState(false);
  if (!["DELIVERED", "RETURN_REQUESTED", "RETURNED", "REFUNDED"].includes(status)) return null;
  const canStart = status === "DELIVERED";

  return (
    <section className="grid gap-2">
      <h3 className="text-[0.6875rem]/none font-semibold tracking-[0.12em] text-muted-foreground uppercase">Returns</h3>
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-3 text-sm">
        <span className="min-w-0 flex-1 text-muted-foreground">
          {canStart ? "The customer wants to send something back? Open a return, then receive the parcel and refund from the Returns page." : "This order has a return."}{" "}
          <Link href={`/admin/returns?q=${encodeURIComponent(orderNumber)}`} className="text-primary hover:underline">See its returns</Link>
        </span>
        {canStart ? <Button size="sm" variant="outline" onClick={() => setOpening(true)}><Undo2 /> Start a return</Button> : null}
      </div>
      <NewReturnDialog open={opening} orderId={orderId} onClose={() => setOpening(false)} />
    </section>
  );
}
