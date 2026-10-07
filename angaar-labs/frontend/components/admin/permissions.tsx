"use client";

import { Eye, Lock } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext } from "react";
import { Button } from "@/components/ui/button";
import type { SessionUser } from "@/lib/types";

// What the signed-in staff member's role lets them see and change.
// The server checks every request itself; this only keeps the panel from showing doors that are locked.

/** Which area each section of the panel belongs to, by the part of the address after /admin/. */
const AREA_OF_SECTION: Record<string, string> = {
  "": "dashboard",
  orders: "orders", returns: "returns", payments: "payments", refunds: "payments", shipping: "shipping",
  customers: "customers", b2b: "b2b",
  brands: "catalog", categories: "catalog", products: "catalog", inventory: "catalog",
  discounts: "discounts", coupons: "discounts",
  doctors: "doctors", streams: "doctors", "doctor-tiers": "doctors", "doctor-reviews": "doctors",
  appointments: "consultations", prescriptions: "consultations", payouts: "payouts",
  banners: "content", blog: "content", enquiries: "content",
  reports: "reports", "report-emails": "reports",
  messages: "settings", invoices: "settings",
  staff: "staff", "data-import": "staff",
};
export const areaOfPath = (pathname: string) => AREA_OF_SECTION[pathname.split("/")[2] ?? ""] ?? null;

type Permissions = { roleName: string; can: (area: string, level?: "view" | "manage") => boolean };
const Context = createContext<Permissions>({ roleName: "", can: () => true });
export const usePermissions = () => useContext(Context);

export function PermissionsProvider({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const held = new Set(user.permissions ?? []);
  const can = (area: string, level: "view" | "manage" = "view") => held.has(`${area}.${level}`);
  return <Context.Provider value={{ roleName: user.roleName ?? "", can }}>{children}</Context.Provider>;
}

/** Wraps a page: shows it, shows it with a "you can only look" note, or explains that the role does not include it. */
export function SectionGuard({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const { can, roleName } = usePermissions();
  const area = areaOfPath(pathname);
  if (!area || can(area, "manage")) return <>{children}</>;

  if (can(area, "view")) {
    return (
      <>
        <p className="mb-4 flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <Eye className="size-4 shrink-0" /> Your role ({roleName}) can look at this section but not change it. Buttons that change something will be refused.
        </p>
        {children}
      </>
    );
  }

  // the landing page for someone whose role has no dashboard: a welcome, not a locked door
  const first = Object.entries(AREA_OF_SECTION).find(([section, sectionArea]) => section && can(sectionArea));
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-20 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground"><Lock className="size-5" /></span>
      {area === "dashboard" && first ? (
        <>
          <h1 className="text-lg font-semibold">Welcome{user.name ? `, ${user.name.split(" ")[0]}` : ""}</h1>
          <p className="text-sm text-muted-foreground">Your role ({roleName}) does not include the sales dashboard. Use the menu on the left to open the sections you work with.</p>
          <Button asChild className="mt-1"><Link href={`/admin/${first[0]}`}>Open {first[0].replace(/-/g, " ")}</Link></Button>
        </>
      ) : (
        <>
          <h1 className="text-lg font-semibold">{first ? "This section is not part of your role" : "Your account has no access yet"}</h1>
          <p className="text-sm text-muted-foreground">
            {first
              ? `Your role (${roleName}) does not include this part of the panel. Ask the owner if you need it.`
              : "You are signed in, but no role has been chosen for you. Ask the owner to give you one under Staff and roles."}
          </p>
          {first ? <Button asChild variant="outline" className="mt-1"><Link href={`/admin/${first[0]}`}>Go to {first[0].replace(/-/g, " ")}</Link></Button> : null}
        </>
      )}
    </div>
  );
}
