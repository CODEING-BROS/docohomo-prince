"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/admin/parts";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import type { ShippingSettings, ShiprocketStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ButtonSpinner } from "@/components/custom/loaders";

/** Shared with the order panel, which needs to know whether the "Send to Shiprocket" button can work. */
export const shiprocketStatusQuery = {
  queryKey: ["shiprocket-status"],
  queryFn: () => api<ShiprocketStatus>("/admin/shiprocket/status"),
  staleTime: 5 * 60_000, // each load asks Shiprocket for the pickup addresses
};

const MODES: { value: ShippingSettings["mode"]; title: string; text: string }[] = [
  { value: "off", title: "Off", text: "Nothing is sent to Shiprocket from this site. You send parcels your own way." },
  { value: "manual", title: "By hand", text: "Each order gets a \"Send to Shiprocket\" button. Nothing goes until you press it." },
  { value: "auto", title: "Automatically", text: "Every order goes by itself as soon as it is confirmed: pay-on-delivery and credit orders when placed, online orders when paid. The courier and the pickup are booked too." },
];

const NONE = "__none";

type Draft = Omit<ShippingSettings, "weightKg" | "lengthCm" | "breadthCm" | "heightCm" | "pickupPincode"> & {
  weightKg: string; lengthCm: string; breadthCm: string; heightCm: string;
};

const toDraft = (s: ShippingSettings): Draft => ({
  mode: s.mode, bookCourier: s.bookCourier, pickupPlace: s.pickupPlace,
  weightKg: String(s.weightKg), lengthCm: String(s.lengthCm), breadthCm: String(s.breadthCm), heightCm: String(s.heightCm),
});

export function CourierSettings() {
  const { data, isPending, isError } = useQuery(shiprocketStatusQuery);

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Courier (Shiprocket)</CardTitle>
        <CardDescription>Shiprocket books the courier, picks up the parcel and tracks it. Orders move to shipped and delivered by themselves.</CardDescription>
        <CardAction>
          {isPending ? <Skeleton className="h-5 w-24" /> : <StatusBadge status={data?.connected ? "SUCCESS" : "FAILED"} label={data?.connected ? "Connected" : "Not connected"} />}
        </CardAction>
      </CardHeader>
      <CardContent>
        {isError ? (
          <p className="text-sm text-muted-foreground">Could not load the courier settings. Check that the backend is running.</p>
        ) : isPending || !data ? (
          <div className="grid gap-3"><Skeleton className="h-20" /><Skeleton className="h-28" /></div>
        ) : (
          // starts again from the saved settings whenever they change
          <SettingsForm key={JSON.stringify(data.settings)} status={data} />
        )}
      </CardContent>
    </Card>
  );
}

function SettingsForm({ status }: { status: ShiprocketStatus }) {
  const queryClient = useQueryClient();
  const saved = status.settings;
  const [draft, setDraft] = useState<Draft>(() => toDraft(saved));
  const [confirmAuto, setConfirmAuto] = useState(false);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  // Shiprocket's names can end in a space; ours are stored trimmed
  const places = status.pickupPlaces;
  const chosen = places.find((p) => p.name.trim() === draft.pickupPlace.trim()) ?? null;
  const unknownSaved = draft.pickupPlace && !chosen ? draft.pickupPlace : null;
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(saved));

  const save = useMutation({
    mutationFn: (d: Draft) =>
      api<ShippingSettings>("/admin/shiprocket/settings", {
        method: "PUT",
        body: {
          mode: d.mode, bookCourier: d.bookCourier, pickupPlace: d.pickupPlace,
          // the server fills the pincode from the chosen address
          pickupPincode: d.pickupPlace === saved.pickupPlace ? saved.pickupPincode : (chosen?.pincode ?? ""),
          weightKg: Number(d.weightKg), lengthCm: Number(d.lengthCm), breadthCm: Number(d.breadthCm), heightCm: Number(d.heightCm),
        },
      }),
    onSuccess: (next) => {
      toast.success("Courier settings saved");
      setConfirmAuto(false);
      queryClient.setQueryData<ShiprocketStatus>(["shiprocket-status"], (old) => (old ? { ...old, settings: next } : old));
    },
    onError: (err) => toast.error(err.message),
  });

  const submit = () => {
    if (draft.mode === "auto" && saved.mode !== "auto") setConfirmAuto(true);
    else save.mutate(draft);
  };

  return (
    <>
      <form className="grid gap-5 text-sm" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        {status.error ? (
          <p className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-destructive">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>Shiprocket could not be reached: {status.error}</span>
          </p>
        ) : !status.connected ? (
          <p className="rounded-lg bg-muted p-3 text-muted-foreground">
            Shiprocket is not connected yet. Your developer adds the Shiprocket login to the server; the settings below are kept until then.
          </p>
        ) : null}
        {status.testMode ? (
          <p className="flex items-start gap-2 rounded-lg bg-info/10 p-3">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-info" />
            <span>
              <span className="font-medium">This computer uses a pretend courier.</span> Orders are sent, tracked and delivered by themselves within a few minutes, but nothing is booked at Shiprocket and nothing costs money.
              On the live server real couriers are booked.
            </span>
          </p>
        ) : null}

        <fieldset className="grid gap-2">
          <legend className="mb-2 font-medium">How orders go to the courier</legend>
          <div role="radiogroup" aria-label="How orders go to the courier" className="grid gap-2 sm:grid-cols-3">
            {MODES.map((mode) => {
              const on = draft.mode === mode.value;
              return (
                <button
                  key={mode.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => set({ mode: mode.value })}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
                    on ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-surface-2",
                  )}
                >
                  <span className="flex items-center gap-2 font-medium">
                    <span className={cn("flex size-4 items-center justify-center rounded-full border", on ? "border-primary" : "border-muted-foreground/40")}>
                      {on ? <span className="size-2 rounded-full bg-primary" /> : null}
                    </span>
                    {mode.title}
                  </span>
                  <span className="text-xs text-muted-foreground">{mode.text}</span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            The old website still sends its orders to the same Shiprocket account, so switch on &quot;Automatically&quot; only when the new site goes live.
          </p>
        </fieldset>

        <label className="flex items-start justify-between gap-4 rounded-lg border p-3">
          <span>
            <span className="font-medium">Also book the courier and pickup straight away</span>
            <span className="block text-xs text-muted-foreground">
              {draft.bookCourier
                ? "The courier is booked as soon as the order reaches Shiprocket, and gets a tracking number."
                : "Orders wait in Shiprocket until you press \"Book courier\" on the order."}
            </span>
          </span>
          <Switch checked={draft.bookCourier} onCheckedChange={(bookCourier) => set({ bookCourier })} aria-label="Also book the courier and pickup straight away" />
        </label>

        <div className="grid gap-1.5">
          <Label>Pickup address</Label>
          {places.length === 0 && !unknownSaved ? (
            <p className="text-muted-foreground">
              {status.connected ? "Shiprocket has no pickup addresses yet. Add one in the Shiprocket panel." : "The pickup addresses from Shiprocket show here once it is connected."}
            </p>
          ) : (
            <Select value={chosen?.name ?? (unknownSaved || NONE)} onValueChange={(v) => set({ pickupPlace: v === NONE ? "" : v })}>
              <SelectTrigger className="h-auto min-h-9 w-full sm:w-[28rem]" aria-label="Pickup address"><SelectValue /></SelectTrigger>
              <SelectContent className="max-w-[calc(100vw-2rem)]">
                <SelectItem value={NONE}><span className="text-muted-foreground">Not chosen yet</span></SelectItem>
                {unknownSaved ? <SelectItem value={unknownSaved}>{unknownSaved} (no longer in Shiprocket)</SelectItem> : null}
                {places.map((p) => (
                  <SelectItem key={p.name} value={p.name}>
                    <span className="flex min-w-0 flex-col items-start gap-0.5 py-0.5 text-left">
                      <span className="max-w-full truncate">{p.name.trim()}</span>
                      <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {p.city}, {p.pincode}
                        <StatusBadge status={p.verified ? "SUCCESS" : "PENDING"} label={p.verified ? "Verified" : "Not verified"} />
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <p className="text-xs text-muted-foreground">Where the courier collects the parcels. Nothing is sent to Shiprocket until one is chosen.</p>
          {chosen && !chosen.verified ? (
            <p className="flex items-start gap-2 rounded-lg bg-warning/15 p-3">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
              <span>Shiprocket has not verified this address yet, so couriers may not come to it. Verify it in the Shiprocket panel, or choose a verified one.</span>
            </p>
          ) : null}
          {unknownSaved ? (
            <p className="flex items-start gap-2 rounded-lg bg-warning/15 p-3">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
              <span>&quot;{unknownSaved}&quot; is not among Shiprocket&apos;s pickup addresses any more. Choose another one.</span>
            </p>
          ) : null}
        </div>

        <div className="grid gap-1.5">
          <span className="font-medium">The usual parcel</span>
          <p className="text-xs text-muted-foreground">Used when the packs in an order have no weight saved.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field id="parcel-weight" label="Weight (kg)" value={draft.weightKg} min={0.05} max={50} onChange={(weightKg) => set({ weightKg })} />
            <Field id="parcel-length" label="Length (cm)" value={draft.lengthCm} min={1} max={200} onChange={(lengthCm) => set({ lengthCm })} />
            <Field id="parcel-breadth" label="Width (cm)" value={draft.breadthCm} min={1} max={200} onChange={(breadthCm) => set({ breadthCm })} />
            <Field id="parcel-height" label="Height (cm)" value={draft.heightCm} min={1} max={200} onChange={(heightCm) => set({ heightCm })} />
          </div>
        </div>

        {draft.mode === "auto" && !draft.pickupPlace && !status.testMode ? (
          <p className="flex items-start gap-2 rounded-lg bg-warning/15 p-3">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
            <span>No pickup address is chosen, so the verified one in Shiprocket is used. Choose another above if parcels leave from somewhere else.</span>
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" className="h-9" loading={save.isPending} disabled={!dirty}>Save courier settings
          </Button>
          {dirty ? <Button type="button" variant="ghost" className="h-9" onClick={() => setDraft(toDraft(saved))}>Undo changes</Button> : null}
        </div>
      </form>

      <Dialog open={confirmAuto} onOpenChange={setConfirmAuto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send every order automatically?</DialogTitle>
            <DialogDescription>
              From now on every new order goes to Shiprocket by itself{draft.bookCourier ? ", and a real courier is booked and paid for from your Shiprocket balance" : ""}.
              The old website uses the same Shiprocket account, so do this only once the new site is live.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAuto(false)}>Cancel</Button>
            <Button disabled={save.isPending} onClick={() => save.mutate(draft)}>
              {save.isPending ? <ButtonSpinner /> : null}Yes, send automatically
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ id, label, value, min, max, onChange }: { id: string; label: string; value: string; min: number; max: number; onChange: (value: string) => void }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-xs font-normal text-muted-foreground">{label}</Label>
      <Input id={id} required type="number" inputMode="decimal" min={min} max={max} step="any" className="h-9" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
