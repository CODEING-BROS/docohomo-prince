"use client";

import { CalendarPlus, ClipboardList, LayoutDashboard, MapPin, Package, Pill, Stethoscope, UserRound, Video } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CartButton, type NavGroup, PanelShell } from "@/components/custom/panel-shell";
import { Button } from "@/components/ui/button";
import { type SiteUser, useSession } from "@/hooks/use-session";
import { useCart } from "@/lib/cart";
import { goFresh } from "@/lib/navigate";

const NAV: NavGroup[] = [
  {
    label: "My health",
    items: [
      { title: "Overview", href: "/patient", icon: LayoutDashboard },
      { title: "Consultations", href: "/patient/consultations", icon: Video },
      { title: "Book a consultation", href: "/patient/book", icon: CalendarPlus },
      { title: "Prescriptions", href: "/patient/prescriptions", icon: ClipboardList },
    ],
  },
  {
    label: "Medicines",
    items: [
      { title: "Order medicines", href: "/patient/shop", icon: Pill },
      { title: "My orders", href: "/patient/orders", icon: Package },
      { title: "Addresses", href: "/patient/addresses", icon: MapPin },
    ],
  },
  { label: "Account", items: [{ title: "My details", href: "/patient/profile", icon: UserRound }] },
];

/** The frame of the patient's dashboard: the menu on the left, their own menu on top. */
export function PatientShell({ user: initialUser, children }: { user: SiteUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const session = useSession();
  const user = session.user ?? initialUser; // the server's answer first, then kept fresh in the browser
  // a doctor can be a patient too; here they are shown by their own name, not their practice name
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.name;
  const { count } = useCart();
  // checking out from a prescription belongs under Prescriptions in the menu
  const nav = pathname.startsWith("/patient/checkout") ? NAV.map((g) => ({ ...g, items: g.items.map((i) => (i.href === "/patient/prescriptions" ? { ...i, href: pathname } : i)) })) : NAV;

  return (
    <PanelShell
      panel="patient"
      nav={nav}
      home="/patient"
      headerActions={<CartButton count={count} href="/patient/shop/cart" />}
      footer={
        <Button asChild className="w-full bg-terracotta text-terracotta-foreground not-disabled:hover:bg-terracotta/90 group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:p-0">
          <Link href="/patient/book" aria-label="Book a consultation"><CalendarPlus /><span className="group-data-[collapsible=icon]:hidden">Book a consultation</span></Link>
        </Button>
      }
      user={{
        name,
        lines: [user.phone ? `+91 ${user.phone}` : null],
        items: [
          { label: "My details", href: "/patient/profile", icon: UserRound },
          ...(user.doctor ? [{ label: "Doctor dashboard", onSelect: () => goFresh("/doctor"), icon: Stethoscope }] : []),
        ],
        signOut: async () => {
          await session.signOut();
          goFresh("/patient/login");
        },
      }}
    >
      {children}
    </PanelShell>
  );
}
