"use client";

import { useRouter } from "next/navigation";
import { AREA_NAV } from "@/components/admin/app-sidebar";
import { NotificationBell } from "@/components/admin/notification-bell";
import { PermissionsProvider, SectionGuard, areaOfPath, usePermissions } from "@/components/admin/permissions";
import { TimeZoneSelect } from "@/components/admin/timezone-select";
import { PanelShell } from "@/components/custom/panel-shell";
import { api } from "@/lib/api";
import { humanize } from "@/lib/format";
import { useTimeZone } from "@/lib/timezone";
import type { SessionUser } from "@/lib/types";

function Frame({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const router = useRouter();
  const timeZone = useTimeZone();
  const { can } = usePermissions();
  // sections the person's role does not include are left out of the menu
  const nav = AREA_NAV.map((group) => ({ ...group, items: group.items.filter((item) => { const area = areaOfPath(item.href); return !area || can(area); }) })).filter((group) => group.items.length > 0);

  return (
    <PanelShell
      panel="admin"
      nav={nav}
      home="/admin"
      mainKey={timeZone} // every date on the page is redrawn when the timezone changes
      headerActions={<><TimeZoneSelect /><NotificationBell /></>}
      user={{
        name: user.name,
        lines: [user.email, user.roleName || humanize(user.role)],
        signOut: async () => {
          await api("/auth/logout", { method: "POST" });
          router.replace("/admin/login");
        },
      }}
    >
      <SectionGuard user={user}>{children}</SectionGuard>
    </PanelShell>
  );
}

export function AdminShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  return (
    <PermissionsProvider user={user}>
      <Frame user={user}>{children}</Frame>
    </PermissionsProvider>
  );
}
