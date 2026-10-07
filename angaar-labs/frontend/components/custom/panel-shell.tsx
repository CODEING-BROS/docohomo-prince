"use client";

import { LogOut, type LucideIcon, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInset,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarRail, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { GradientAvatar } from "./avatar";
import { KEYS, Shortcut } from "./kbd";
import { Spinner } from "./loaders";
import { Num } from "./number";
import { StatusPill } from "./status-pill";
import type { StatusKind } from "./status-registry";
import { ThemeToggle } from "./theme-toggle";
import { Eyebrow, Title } from "./typography";
import { cn } from "@/lib/utils";

// The frame around every panel page: brand, menu, sticky header, the person's own menu.
// data-panel on the root is what the per-panel tokens and the admin:/doctor:/patient: variants key off.

export type Panel = "admin" | "doctor" | "patient";
export type NavItem = { title: string; href: string; icon: LucideIcon; badge?: number; exact?: boolean };
export type NavGroup = { label?: string; items: NavItem[] };

const PANEL_NAME: Record<Panel, string> = { admin: "Admin panel", doctor: "Doctor dashboard", patient: "My account" };

// pages may set a title for the header; the shell shows the panel name until one is set
const TitleContext = createContext<{ title: string | null; setTitle: (title: string | null) => void }>({ title: null, setTitle: () => {} });
export const usePanelTitle = () => useContext(TitleContext);

/** The logo on a paper tile: the mark when the sidebar is collapsed, the wordmark when open. */
export function SidebarBrand({ panel, href }: { panel: Panel; href: string }) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" asChild className="h-12 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-0!">
          <Link href={href} aria-label={`DocHomoeo ${PANEL_NAME[panel].toLowerCase()}, go to the start`}>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-card p-0.5 ring-1 ring-foreground/10">
              {/* eslint-disable-next-line @next/next/no-img-element -- small static logo */}
              <img src="/logo-mark.png" alt="" className="size-full object-contain" />
            </span>
            <span className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
              <span className="font-display truncate text-lg/none font-medium">DocHomoeo</span>
              <Eyebrow as="span" className="mt-1 text-[9px] text-sidebar-foreground/60">{PANEL_NAME[panel]}</Eyebrow>
            </span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export function SidebarNav({ groups, home }: { groups: NavGroup[]; home: string }) {
  const pathname = usePathname();
  const isActive = (item: NavItem) => (item.exact || item.href === home ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`));
  return (
    <>
      {groups.map((group, index) => (
        <SidebarGroup key={group.label ?? index}>
          {group.label ? <SidebarGroupLabel className="text-[0.6875rem] font-semibold tracking-[0.12em] text-sidebar-foreground/55 uppercase">{group.label}</SidebarGroupLabel> : null}
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => {
                const active = isActive(item);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.title} className={cn("transition-[box-shadow,background-color]", active && "shadow-[inset_3px_0_0_var(--sidebar-primary)]")}>
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.title}</span>
                        {item.badge ? <span className="ledger ml-auto rounded-full bg-sidebar-primary px-1.5 text-[10px] font-semibold text-sidebar-primary-foreground">{item.badge > 99 ? "99+" : item.badge}</span> : null}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}

function TriggerWithHint() {
  const { open } = useSidebar();
  return (
    <Tooltip>
      <TooltipTrigger asChild><SidebarTrigger className="-ml-1 size-9" /></TooltipTrigger>
      <TooltipContent className="flex items-center gap-2">{open ? "Hide menu" : "Show menu"} <Shortcut keys={[KEYS.mod, "B"]} size="xs" /></TooltipContent>
    </Tooltip>
  );
}

/** The sticky header: menu button, the page title, then the actions and the person's menu on the right. */
export function PanelHeader({ left, actions, children, className }: { left?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  const { title } = useContext(TitleContext);
  return (
    <header data-slot="panel-header" className={cn("glass-header sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 px-4 print:hidden", className)}>
      <TriggerWithHint />
      <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-5" />
      {left}
      {title ? <Title as="div" className="hidden truncate text-base sm:block">{title}</Title> : null}
      <div className="flex-1" />
      <div className="flex items-center gap-1">{actions}{children}</div>
    </header>
  );
}

/** A 36px icon button for the header, with a tooltip and an optional count. */
export function HeaderAction({ icon: Icon, label, badge, href, className, ...props }: { icon: LucideIcon; label: string; badge?: number; href?: string } & Omit<React.ComponentProps<typeof Button>, "children">) {
  const inner = (
    <>
      <Icon />
      {badge ? (
        <span className="ledger absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-terracotta px-1 text-[10px] font-semibold text-terracotta-foreground">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </>
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {href ? (
          <Button asChild variant="ghost" size="icon-lg" className={cn("relative", className)} {...props}>
            <Link href={href} aria-label={badge ? `${label}, ${badge}` : label}>{inner}</Link>
          </Button>
        ) : (
          <Button variant="ghost" size="icon-lg" aria-label={badge ? `${label}, ${badge}` : label} className={cn("relative", className)} {...props}>{inner}</Button>
        )}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function CartButton({ count, href }: { count: number; href: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button asChild variant="ghost" size="icon-lg" className="relative">
          <Link href={href} aria-label={`Cart, ${count} ${count === 1 ? "item" : "items"}`}>
            <ShoppingCart />
            {count > 0 ? (
              <span className="ledger absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-terracotta px-1 text-[10px] font-semibold text-terracotta-foreground">
                <Num value={Math.min(count, 99)} className="overflow-visible" />{count > 99 ? "+" : ""}
              </span>
            ) : null}
          </Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent>Cart</TooltipContent>
    </Tooltip>
  );
}

export type UserMenuProps = {
  name: string | null; lines?: (string | null | undefined)[]; avatarSrc?: string | null; status?: { status: string; kind?: StatusKind; label?: string };
  items?: { label: string; href?: string; onSelect?: () => void; icon: LucideIcon }[]; signOut: () => Promise<void> | void;
};

export function UserMenu({ name, lines = [], avatarSrc, status, items = [], signOut }: UserMenuProps) {
  const [leaving, setLeaving] = useState(false);
  const shown = name ?? lines.find(Boolean) ?? "Account";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-2 pr-2 pl-1" aria-label={`Account menu for ${shown}`}>
          <GradientAvatar name={name ?? shown} src={avatarSrc} size="sm" />
          <span className="hidden max-w-40 truncate text-sm font-medium sm:inline">{shown}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel className="grid gap-1">
          <span className="font-display text-base/tight font-medium text-foreground">{shown}</span>
          {lines.filter(Boolean).map((line) => <span key={line} className="text-xs font-normal text-muted-foreground">{line}</span>)}
          {status ? <StatusPill {...status} className="mt-1 w-fit" /> : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.map((item) =>
          item.href ? (
            <DropdownMenuItem key={item.label} asChild><Link href={item.href}><item.icon className="size-4" /> {item.label}</Link></DropdownMenuItem>
          ) : (
            <DropdownMenuItem key={item.label} onSelect={item.onSelect}><item.icon className="size-4" /> {item.label}</DropdownMenuItem>
          ),
        )}
        <DropdownMenuItem
          onSelect={async (e) => { e.preventDefault(); setLeaving(true); try { await signOut(); } finally { setLeaving(false); } }}
          disabled={leaving}
        >
          {leaving ? <Spinner size="xs" /> : <LogOut className="size-4" />} Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The doctor's verification line at the foot of the menu; only the icon when collapsed. */
export function PanelFooterStatus({ status, kind, label, icon: Icon }: { status: string; kind?: StatusKind; label?: string; icon: LucideIcon }) {
  return (
    <>
      <div className="group-data-[collapsible=icon]:hidden"><StatusPill status={status} kind={kind} label={label} size="md" className="w-full justify-center" /></div>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="hidden size-8 items-center justify-center rounded-md text-sidebar-foreground/70 group-data-[collapsible=icon]:flex"><Icon className="size-4" /></span>
        </TooltipTrigger>
        <TooltipContent side="right">{label ?? status}</TooltipContent>
      </Tooltip>
    </>
  );
}

export function PanelShell({ panel, nav, home, headerLeft, headerActions, user, footer, mainKey, children }: {
  panel: Panel; nav: NavGroup[]; home: string; headerLeft?: React.ReactNode; headerActions?: React.ReactNode; user: UserMenuProps; footer?: React.ReactNode;
  /** remounts the page body when it changes (the admin uses the chosen timezone) */
  mainKey?: string; children: React.ReactNode;
}) {
  const [title, setTitle] = useState<string | null>(null);
  return (
    <div data-panel={panel} className="contents">
      <TitleContext.Provider value={{ title, setTitle }}>
        <SidebarProvider>
          <Sidebar collapsible="icon" className="print:hidden">
            <SidebarHeader className="border-b border-sidebar-border"><SidebarBrand panel={panel} href={home} /></SidebarHeader>
            <SidebarContent><SidebarNav groups={nav} home={home} /></SidebarContent>
            {footer ? <SidebarFooter>{footer}</SidebarFooter> : null}
            <SidebarRail />
          </Sidebar>
          <SidebarInset className="min-w-0 bg-background">
            <PanelHeader left={headerLeft} actions={headerActions}>
              <ThemeToggle />
              <UserMenu {...user} />
            </PanelHeader>
            <main key={mainKey} className={cn("min-w-0 flex-1 p-4 md:p-6 print:p-0", panel === "patient" && "md:p-8")}>{children}</main>
          </SidebarInset>
        </SidebarProvider>
      </TitleContext.Provider>
    </div>
  );
}
