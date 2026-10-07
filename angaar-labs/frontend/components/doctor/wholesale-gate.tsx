"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgePercent, Clock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { ButtonSpinner } from "@/components/custom/loaders";

export type Wholesale = {
  account: {
    status: string; businessName: string; gstNumber: string | null; rejectionReason: string | null; tier: string | null; discountPercent: number | null;
    creditLimit: number; creditDays: number; creditUsed: number;
  } | null;
  stats: { orders: number; spent: number; saved: number } | null;
  orders: { id: number; orderNumber: string; status: string; paymentMethod: string; paymentStatus: string; grandTotal: number; placedAt: string; items: number }[];
};

export const useWholesale = () => useQuery({ queryKey: ["doctor-wholesale"], queryFn: () => api<Wholesale>("/doctor/wholesale") });

/** Shows the wholesale pages only to a doctor whose wholesale account is switched on; otherwise says where things stand. */
export function WholesaleGate({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isPending } = useWholesale();
  const request = useMutation({
    mutationFn: () => api("/doctor/wholesale/request", { method: "POST" }),
    onSuccess: () => { toast.success("Done"); ["doctor-wholesale", "doctor-overview", "session"].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] })); },
    onError: (err) => toast.error(err.message),
  });

  if (isPending) return <Skeleton className="h-72 rounded-xl" />;
  const status = data?.account?.status;
  if (status === "APPROVED") return <>{children}</>;

  const waiting = status === "PENDING" || status === "UNDER_REVIEW";
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">{waiting ? <Clock className="size-7" /> : <BadgePercent className="size-7" />}</span>
      <h2 className="text-lg font-semibold">{waiting ? "Wholesale prices open after verification" : status ? "Wholesale buying is switched off" : "Buy medicines at doctor prices"}</h2>
      <p className="text-sm text-muted-foreground">
        {waiting ? "Your wholesale account is ready and waiting. As soon as our team verifies your documents, you can order here at doctor prices."
          : status ? (data?.account?.rejectionReason ?? "Please contact us to switch it back on.")
          : "Order for your practice at wholesale rates, with a GST invoice. It takes one click to ask for it."}
      </p>
      {!status ? <Button disabled={request.isPending} onClick={() => request.mutate()}>{request.isPending ? <ButtonSpinner /> : null}Switch on wholesale buying</Button> : null}
    </div>
  );
}
