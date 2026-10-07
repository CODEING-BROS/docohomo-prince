"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { INDIAN_STATES } from "@/lib/india";
import type { SavedAddress } from "@/lib/shop";

export type AddressForm = { fullName: string; phone: string; line1: string; landmark: string; city: string; state: string; pincode: string };
export const blankAddress: AddressForm = { fullName: "", phone: "", line1: "", landmark: "", city: "", state: "", pincode: "" };
export const fromSaved = (a: SavedAddress): AddressForm => ({
  fullName: a.fullName ?? "", phone: a.phone ?? "", line1: a.line1, landmark: a.landmark ?? "", city: a.city ?? "", state: a.state ?? "", pincode: a.pincode ?? "",
});
export const addressLine = (a: Pick<SavedAddress, "line1" | "landmark" | "city" | "state" | "pincode">) =>
  [a.line1, a.landmark ? `Near ${a.landmark}` : null, a.city, a.state, a.pincode].filter(Boolean).join(", ");

/** The fields of one delivery address. Used when ordering and on the saved-addresses page. */
export function AddressFields({ value, onChange, idPrefix = "a" }: { value: AddressForm; onChange: (next: AddressForm) => void; idPrefix?: string }) {
  const set = (field: keyof AddressForm, text: string) => onChange({ ...value, [field]: text });
  const id = (name: string) => `${idPrefix}-${name}`;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="grid gap-1.5"><Label htmlFor={id("name")}>Full name</Label><Input id={id("name")} required minLength={2} maxLength={120} autoComplete="name" value={value.fullName} onChange={(e) => set("fullName", e.target.value)} /></div>
      <div className="grid gap-1.5">
        <Label htmlFor={id("phone")}>Mobile number</Label>
        <Input id={id("phone")} required inputMode="numeric" pattern="[6-9][0-9]{9}" maxLength={10} title="A 10-digit mobile number" autoComplete="tel-national" value={value.phone} onChange={(e) => set("phone", e.target.value.replace(/\D/g, ""))} />
      </div>
      <div className="grid gap-1.5 sm:col-span-2"><Label htmlFor={id("line")}>House number, building and street</Label><Input id={id("line")} required minLength={5} maxLength={300} autoComplete="street-address" value={value.line1} onChange={(e) => set("line1", e.target.value)} /></div>
      <div className="grid gap-1.5"><Label htmlFor={id("landmark")}>Landmark <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id={id("landmark")} maxLength={120} value={value.landmark} onChange={(e) => set("landmark", e.target.value)} /></div>
      <div className="grid gap-1.5">
        <Label htmlFor={id("pin")}>Pincode</Label>
        <Input id={id("pin")} required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} title="A 6-digit pincode" autoComplete="postal-code" value={value.pincode} onChange={(e) => set("pincode", e.target.value.replace(/\D/g, ""))} />
      </div>
      <div className="grid gap-1.5"><Label htmlFor={id("city")}>City</Label><Input id={id("city")} required minLength={2} maxLength={80} autoComplete="address-level2" value={value.city} onChange={(e) => set("city", e.target.value)} /></div>
      <div className="grid gap-1.5">
        <Label>State</Label>
        <Select value={value.state} onValueChange={(state) => set("state", state)}>
          <SelectTrigger className="h-9 w-full"><SelectValue placeholder="Choose" /></SelectTrigger>
          <SelectContent className="max-h-72">{INDIAN_STATES.map((state) => <SelectItem key={state} value={state}>{state}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    </div>
  );
}
