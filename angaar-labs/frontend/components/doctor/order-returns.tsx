"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Truck, Undo2, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { type ReturnableItem, ReturnItemsPicker } from "@/components/admin/new-return-dialog";
import { StatusBadge } from "@/components/admin/parts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { formatDate, formatMoneyExact, titleCase } from "@/lib/format";
import { uploadReturnPhoto } from "@/lib/upload";
import { Spinner } from "@/components/custom/loaders";

type MyReturn = {
  id: number; returnNumber: string; status: string; statusText: string; reason: string; createdAt: string; refundAmount: number | null; note: string | null;
  items: { productName: string; variantTitle: string | null; quantity: number }[];
  pickup: { courier: string | null; tracking: string; url: string | null; status: string | null } | null;
};
type ReturnInfo = { canReturn: boolean; why: string | null; windowEnds: string | null; windowDays: number; reasons: string[]; items: ReturnableItem[]; returns: MyReturn[] };

const TONE: Record<string, string> = { REQUESTED: "PENDING", APPROVED: "CONFIRMED", PICKED_UP: "SHIPPED", RECEIVED: "PROCESSING", REFUNDED: "SUCCESS", CLOSED: "ARCHIVED", REJECTED: "CANCELLED", CANCELLED: "ARCHIVED" };
const MAX_PHOTOS = 4;

/** On a delivered order: ask to send items back, and follow the returns already asked for. */
export function MyOrderReturns({ orderId, status }: { orderId: number; status: string }) {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [asking, setAsking] = useState(false);
  const [chosen, setChosen] = useState<Record<number, number>>({});
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const relevant = ["DELIVERED", "RETURN_REQUESTED", "RETURNED", "REFUNDED"].includes(status);
  const { data } = useQuery({ queryKey: ["my-order", String(orderId), "returns"], queryFn: () => api<ReturnInfo>(`/me/orders/${orderId}/returns`), enabled: relevant });

  const close = () => { setAsking(false); setChosen({}); setReason(""); setDescription(""); setPhotos([]); };

  const send = useMutation({
    mutationFn: () =>
      api<{ returnNumber: string; status: string }>(`/me/orders/${orderId}/returns`, {
        method: "POST",
        body: { reason, description, photoUrls: photos, items: Object.entries(chosen).filter(([, quantity]) => quantity > 0).map(([id, quantity]) => ({ orderItemId: Number(id), quantity })) },
      }),
    onSuccess: (result) => {
      toast.success(result.status === "APPROVED" ? `Return ${result.returnNumber} is approved. Keep the parcel ready for pickup.` : `We have your request ${result.returnNumber}. We will write to you shortly.`);
      queryClient.invalidateQueries({ queryKey: ["my-order"] });
      close();
    },
    onError: (err) => toast.error(err.message),
  });

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const added: string[] = [];
      for (const file of [...files].slice(0, MAX_PHOTOS - photos.length)) added.push(await uploadReturnPhoto(file));
      setPhotos((current) => [...current, ...added]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload the photo");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  if (!relevant || !data) return null;
  if (data.returns.length === 0 && !data.canReturn && status !== "DELIVERED") return null;
  const units = Object.values(chosen).reduce((sum, quantity) => sum + quantity, 0);

  return (
    <Card>
      <CardHeader><CardTitle>Returns</CardTitle></CardHeader>
      <CardContent className="grid gap-3 text-sm">
        {data.returns.map((request) => (
          <div key={request.id} className="grid gap-1 rounded-lg border p-3">
            <p className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{request.returnNumber}</span>
              <StatusBadge status={TONE[request.status] ?? "DRAFT"} label={request.statusText} />
            </p>
            <p className="text-muted-foreground">{request.items.map((item) => `${titleCase(item.productName)} × ${item.quantity}`).join(", ")}</p>
            <p className="text-muted-foreground">
              Asked on {formatDate(request.createdAt)} · {request.reason}
              {request.refundAmount && !["REJECTED", "CLOSED", "CANCELLED"].includes(request.status) ? ` · Refund ${formatMoneyExact(request.refundAmount)}` : ""}
            </p>
            {request.pickup && ["APPROVED", "PICKED_UP"].includes(request.status) ? (
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <Truck className="size-4 text-primary" />
                {request.status === "APPROVED" ? "Pickup by" : "Collected by"} {request.pickup.courier ?? "our courier"} · {request.pickup.tracking}
                {request.pickup.url ? <a href={request.pickup.url} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">Track</a> : null}
              </p>
            ) : null}
            {request.note && !["RECEIVED", "REFUNDED"].includes(request.status) ? <p className="rounded-md bg-muted/50 p-2">{request.note}</p> : null}
          </div>
        ))}

        {data.canReturn ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground">
              Something wrong with this order? You can ask to return it{data.windowEnds ? ` until ${formatDate(data.windowEnds)}` : ""}.
            </p>
            <Button variant="outline" size="sm" onClick={() => setAsking(true)}><Undo2 /> Return items</Button>
          </div>
        ) : data.returns.length === 0 && data.why ? (
          <p className="text-muted-foreground">{data.why}.</p>
        ) : null}
      </CardContent>

      <Dialog open={asking} onOpenChange={(open) => !open && close()}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Return items</DialogTitle>
            <DialogDescription>Tell us what you want to send back and why. We collect the parcel from your delivery address.</DialogDescription>
          </DialogHeader>
          <form id="my-return" className="grid gap-4" onSubmit={(event) => { event.preventDefault(); if (!send.isPending) send.mutate(); }}>
            <div className="grid gap-1.5">
              <Label>What are you returning?</Label>
              <ReturnItemsPicker items={data.items} chosen={chosen} onChange={setChosen} />
            </div>
            <div className="grid gap-1.5">
              <Label>Reason</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger className="h-9 w-full"><SelectValue placeholder="Choose a reason" /></SelectTrigger>
                <SelectContent>{data.reasons.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="my-return-details">Details <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Textarea id="my-return-details" rows={2} maxLength={1000} placeholder="Anything that helps us understand the problem" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Photos <span className="font-normal text-muted-foreground">(optional, up to {MAX_PHOTOS})</span></Label>
              <div className="flex flex-wrap gap-2">
                {photos.map((url) => (
                  <span key={url} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="Photo of the item" className="size-16 rounded-md border object-cover" />
                    <button type="button" aria-label="Remove this photo" onClick={() => setPhotos(photos.filter((p) => p !== url))} className="absolute -top-1.5 -right-1.5 rounded-full border bg-background p-0.5 text-muted-foreground hover:text-foreground"><X className="size-3" /></button>
                  </span>
                ))}
                {photos.length < MAX_PHOTOS ? (
                  <button type="button" disabled={uploading} onClick={() => fileInput.current?.click()} className="flex size-16 flex-col items-center justify-center gap-0.5 rounded-md border border-dashed text-xs text-muted-foreground hover:bg-surface-2">
                    {uploading ? <Spinner size="md" /> : <ImagePlus className="size-4" />}
                    Add
                  </button>
                ) : null}
              </div>
              <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => addPhotos(e.target.files)} />
              <p className="text-xs text-muted-foreground">A photo of a damaged or wrong item helps us approve the return quickly.</p>
            </div>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={close}>Cancel</Button>
            <Button type="submit" form="my-return" loading={send.isPending} disabled={units === 0 || !reason || uploading}>Ask for a return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
