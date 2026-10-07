"use client";

import {
  Award, BadgePercent, BarChart3, Boxes, Building2, CalendarClock, ClipboardList, CreditCard, FolderTree, GraduationCap, Image as ImageIcon, LayoutDashboard,
  MessageSquare, MessagesSquare, Newspaper, Package, ReceiptText, ShoppingCart, Star, Stethoscope, Tags, TicketPercent, Truck, Undo2, DatabaseBackup, UserCog, Users, Wallet, PackageOpen, MailCheck,
} from "lucide-react";
import type { NavGroup } from "@/components/custom/panel-shell";

// The admin menu. The shell drops the sections a role does not include.
export const AREA_NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [{ title: "Dashboard", href: "/admin", icon: LayoutDashboard }],
  },
  {
    label: "Sales",
    items: [
      { title: "Orders", href: "/admin/orders", icon: ShoppingCart },
      { title: "Customers", href: "/admin/customers", icon: Users },
      { title: "B2B customers", href: "/admin/b2b", icon: Building2 },
      { title: "Payments", href: "/admin/payments", icon: CreditCard },
      { title: "Returns", href: "/admin/returns", icon: PackageOpen },
      { title: "Refunds", href: "/admin/refunds", icon: Undo2 },
      { title: "Shipping", href: "/admin/shipping", icon: Truck },
    ],
  },
  {
    label: "Catalog",
    items: [
      { title: "Brands", href: "/admin/brands", icon: Tags },
      { title: "Categories", href: "/admin/categories", icon: FolderTree },
      { title: "Products", href: "/admin/products", icon: Package },
      { title: "Inventory", href: "/admin/inventory", icon: Boxes },
      { title: "B2B discounts", href: "/admin/discounts", icon: BadgePercent },
      { title: "Coupons", href: "/admin/coupons", icon: TicketPercent },
    ],
  },
  {
    label: "Care",
    items: [
      { title: "Doctors", href: "/admin/doctors", icon: Stethoscope },
      { title: "Appointments", href: "/admin/appointments", icon: CalendarClock },
      { title: "Prescriptions", href: "/admin/prescriptions", icon: ClipboardList },
      { title: "Doctor payouts", href: "/admin/payouts", icon: Wallet },
      { title: "Consulting streams", href: "/admin/streams", icon: GraduationCap },
      { title: "Doctor levels", href: "/admin/doctor-tiers", icon: Award },
      { title: "Doctor reviews", href: "/admin/doctor-reviews", icon: Star },
    ],
  },
  {
    label: "Content",
    items: [
      { title: "Banners", href: "/admin/banners", icon: ImageIcon },
      { title: "Blog", href: "/admin/blog", icon: Newspaper },
      { title: "Enquiries", href: "/admin/enquiries", icon: MessageSquare },
    ],
  },
  {
    label: "Insights",
    items: [{ title: "Reports", href: "/admin/reports", icon: BarChart3 }],
  },
  {
    label: "Settings",
    items: [
      { title: "Automatic messages", href: "/admin/messages", icon: MessagesSquare },
      { title: "Invoices", href: "/admin/invoices", icon: ReceiptText },
      { title: "Report emails", href: "/admin/report-emails", icon: MailCheck },
      { title: "Staff and roles", href: "/admin/staff", icon: UserCog },
      { title: "Import from old site", href: "/admin/data-import", icon: DatabaseBackup },
    ],
  },
];
