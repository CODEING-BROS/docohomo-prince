"use client";

import { BadgeCheck, CalendarClock, CalendarDays, Clock, LayoutDashboard, type LucideIcon, Package, Pill, Star, UserRound, Wallet, XCircle } from "lucide-react";
import { CartButton, type NavGroup, PanelFooterStatus, PanelShell } from "@/components/custom/panel-shell";
import { type SiteUser, useSession } from "@/hooks/use-session";
import { useCart } from "@/lib/cart";
import { goFresh } from "@/lib/navigate";

const NAV: NavGroup[] = [
  {
    label: "Practice",
    items: [
      { title: "Overview", href: "/doctor", icon: LayoutDashboard },
      { title: "Appointments", href: "/doctor/appointments", icon: CalendarClock },
      { title: "Earnings", href: "/doctor/earnings", icon: Wallet },
      { title: "Working hours", href: "/doctor/schedule", icon: CalendarDays },
      { title: "Patient reviews", href: "/doctor/reviews", icon: Star },
    ],
  },
  {
    label: "Wholesale",
    items: [
      { title: "Order medicines", href: "/doctor/wholesale", icon: Pill },
      { title: "My orders", href: "/doctor/orders", icon: Package },
    ],
  },
  { label: "Account", items: [{ title: "Profile", href: "/doctor/profile", icon: UserRound }] },
];

const STATUS: Record<string, { label: string; icon: LucideIcon }> = {
  APPROVED: { label: "Verified doctor", icon: BadgeCheck },
  PENDING: { label: "Verification in progress", icon: Clock },
  UNDER_REVIEW: { label: "Verification in progress", icon: Clock },
  DRAFT: { label: "Registration not finished", icon: Clock },
  REJECTED: { label: "Registration not accepted", icon: XCircle },
  SUSPENDED: { label: "Account suspended", icon: XCircle },
};

/** The frame of the doctor dashboard: the menu on the left, the cart and the doctor's own menu on top. */
export function DoctorShell({ user: initialUser, children }: { user: SiteUser; children: React.ReactNode }) {
  const session = useSession();
  const user = session.user ?? initialUser; // the server's answer first, then kept fresh in the browser
  const { count } = useCart();
  const verification = user.doctor?.verificationStatus ?? "PENDING";
  const status = STATUS[verification] ?? STATUS.PENDING;

  return (
    <PanelShell
      panel="doctor"
      nav={NAV}
      home="/doctor"
      headerActions={<CartButton count={count} href="/doctor/wholesale/cart" />}
      footer={<PanelFooterStatus status={verification} kind="doctor" label={status.label} icon={status.icon} />}
      user={{
        name: user.name,
        lines: [user.phone ? `+91 ${user.phone}` : null],
        status: { status: verification, kind: "doctor", label: status.label },
        items: [{ label: "Profile", href: "/doctor/profile", icon: UserRound }],
        signOut: async () => {
          await session.signOut();
          goFresh("/doctor/login");
        },
      }}
    >
      {children}
    </PanelShell>
  );
}
