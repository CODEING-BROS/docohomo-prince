"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Combobox } from "@/components/admin/combobox";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { STATE_OPTIONS } from "@/lib/india";

const blank = { firstName: "", lastName: "", phone: "", email: "", gender: "", addressLine: "", city: "", state: "", pincode: "" };

/** Adds a retail customer by hand, for example for a phone order. */
export function AddCustomerDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(blank);
  const set = (key: keyof typeof blank, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const save = useMutation({
    mutationFn: () => api("/admin/customers", { method: "POST", body: form }),
    onSuccess: () => {
      toast.success("Customer added");
      setForm(blank);
      onOpenChange(false);
      ["customers", "dashboard"].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add customer</DialogTitle>
          <DialogDescription>They sign in to the store with the mobile number and a one-time code. No password is needed.</DialogDescription>
        </DialogHeader>
        <form id="customer-form" className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <div className="grid gap-1.5">
            <Label htmlFor="customer-first">First name</Label>
            <Input id="customer-first" required autoFocus value={form.firstName} onChange={(e) => set("firstName", e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="customer-last">Last name</Label>
            <Input id="customer-last" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="customer-phone">Mobile number</Label>
            <Input id="customer-phone" required type="tel" inputMode="numeric" pattern="[6-9][0-9]{9}" maxLength={10} title="A 10-digit mobile number" placeholder="9876543210"
              value={form.phone} onChange={(e) => set("phone", e.target.value.replace(/\D/g, ""))} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="customer-email">Email <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id="customer-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Gender <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Select value={form.gender || "none"} onValueChange={(v) => set("gender", v === "none" ? "" : v)}>
              <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not given</SelectItem>
                <SelectItem value="FEMALE">Female</SelectItem>
                <SelectItem value="MALE">Male</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="customer-pincode">Pincode <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id="customer-pincode" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} title="A 6-digit pincode" value={form.pincode} onChange={(e) => set("pincode", e.target.value.replace(/\D/g, ""))} />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="customer-address">Address <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id="customer-address" value={form.addressLine} placeholder="House, street, area" onChange={(e) => set("addressLine", e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="customer-city">City</Label>
            <Input id="customer-city" value={form.city} onChange={(e) => set("city", e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>State</Label>
            <Combobox value={form.state} onChange={(v) => set("state", v)} options={STATE_OPTIONS} allLabel="Choose a state" searchPlaceholder="Search states…" className="w-full" />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="customer-form" loading={save.isPending}>Add customer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
