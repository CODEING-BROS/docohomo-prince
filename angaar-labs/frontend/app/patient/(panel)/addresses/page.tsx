"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader, StatusBadge } from "@/components/admin/parts";
import { AddressFields, type AddressForm, addressLine, blankAddress, fromSaved } from "@/components/patient/address-fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";
import type { SavedAddress } from "@/lib/shop";
import { ButtonSpinner } from "@/components/custom/loaders";

type Draft = { id: number | null; form: AddressForm; isDefault: boolean };

export default function AddressesPage() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<SavedAddress | null>(null);
  const { data, isPending, isError } = useQuery({ queryKey: ["my-addresses"], queryFn: () => api<{ items: SavedAddress[] }>("/me/addresses") });
  const addresses = data?.items ?? [];
  const refresh = () => ["my-addresses", "patient-overview"].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));

  const save = useMutation({
    mutationFn: (d: Draft) => api(d.id ? `/me/addresses/${d.id}` : "/me/addresses", { method: d.id ? "PATCH" : "POST", body: { ...d.form, isDefault: d.isDefault } }),
    onSuccess: (_result, d) => { toast.success(d.id ? "Address updated" : "Address added"); setDraft(null); refresh(); },
    onError: (err) => toast.error(err.message),
  });
  const makeDefault = useMutation({
    mutationFn: (a: SavedAddress) => api(`/me/addresses/${a.id}`, { method: "PATCH", body: { isDefault: true } }),
    onSuccess: () => { toast.success("This is now your usual address"); refresh(); },
    onError: (err) => toast.error(err.message),
  });
  const remove = useMutation({
    mutationFn: (a: SavedAddress) => api(`/me/addresses/${a.id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Address deleted"); setDeleting(null); refresh(); },
    onError: (err) => toast.error(err.message),
  });

  const add = () => setDraft({
    id: null, isDefault: addresses.length === 0,
    form: { ...blankAddress, fullName: [user?.firstName, user?.lastName].filter(Boolean).join(" "), phone: user?.phone?.replace(/^\+?91/, "").slice(-10) ?? "" },
  });
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft || save.isPending) return;
    if (!draft.form.state) return toast.error("Choose the state");
    save.mutate(draft);
  };

  return (
    <>
      <PageHeader title="Addresses" description="Where we deliver your medicines. Your usual address is chosen for you when you order.">
        <Button className="h-9" onClick={add}><Plus /> Add address</Button>
      </PageHeader>

      {isError ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Your addresses could not be loaded. Please try again in a moment.</p>
      ) : isPending ? (
        <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 2 }, (_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}</div>
      ) : addresses.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-14 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground"><MapPin className="size-5" /></span>
          <p className="font-medium">No saved addresses</p>
          <p className="max-w-sm text-sm text-muted-foreground">Add one now, or it is saved for you the first time you order.</p>
          <Button className="mt-2" onClick={add}><Plus /> Add address</Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {addresses.map((a) => (
            <Card key={a.id}>
              <CardContent className="flex h-full flex-col gap-2 text-sm">
                <p className="flex flex-wrap items-center gap-2 font-medium">{a.fullName} {a.isDefault ? <StatusBadge status="CONFIRMED" label="Usual address" /> : null}</p>
                <p className="text-muted-foreground">{addressLine(a)}</p>
                <p className="text-muted-foreground">Mobile {a.phone}</p>
                <div className="mt-auto flex flex-wrap gap-1 pt-2">
                  <Button variant="outline" size="sm" onClick={() => setDraft({ id: a.id, form: fromSaved(a), isDefault: a.isDefault })}><Pencil /> Edit</Button>
                  {a.isDefault ? null : <Button variant="ghost" size="sm" disabled={makeDefault.isPending} onClick={() => makeDefault.mutate(a)}>Make usual</Button>}
                  <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground" onClick={() => setDeleting(a)}><Trash2 /> Delete</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit address" : "Add an address"}</DialogTitle>
            <DialogDescription>The courier calls this mobile number if they cannot find the place.</DialogDescription>
          </DialogHeader>
          {draft ? (
            <form id="address-form" className="grid gap-4" onSubmit={submit}>
              <AddressFields value={draft.form} onChange={(form) => setDraft({ ...draft, form })} idPrefix="saved" />
              <label className="flex items-center gap-2.5 text-sm">
                <Checkbox checked={draft.isDefault} onCheckedChange={(checked) => setDraft({ ...draft, isDefault: checked === true })} />
                Make this my usual address
              </label>
            </form>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
            <Button type="submit" form="address-form" loading={save.isPending}>{draft?.id ? "Save changes" : "Add address"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this address?</DialogTitle>
            <DialogDescription>{deleting ? addressLine(deleting) : ""}. Orders already placed to it are not affected.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>Keep it</Button>
            <Button variant="destructive" disabled={remove.isPending} onClick={() => deleting && remove.mutate(deleting)}>{remove.isPending ? <ButtonSpinner /> : null}Delete address</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
