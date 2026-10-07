"use client";

import { useQuery } from "@tanstack/react-query";
import { Bell, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/format";

type Notice = { key: string; title: string; detail: string; count: number; href: string | null };

/** The bell in the header: everything that is waiting for staff, refreshed every minute. */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<{ items: Notice[] }>("/admin/notifications"),
    refetchInterval: 60_000,
  });
  const items = data?.items ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-lg" className="relative" aria-label={`Notifications${items.length ? `, ${items.length} need attention` : ""}`}>
          <Bell />
          {items.length ? (
            <span className="ledger absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-terracotta px-1 text-[10px] font-semibold text-terracotta-foreground">
              {items.length}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-foreground/18 px-4 py-3">
          <p className="font-display text-base font-medium">Notifications</p>
          <p className="text-xs text-muted-foreground">
            {items.length ? "What is waiting for you right now" : "You are all caught up"}
          </p>
        </div>
        {items.length ? (
          <ul className="max-h-96 overflow-y-auto p-1.5">
            {items.map((item) => {
              const row = (
                <>
                  <span className="ledger flex h-7 min-w-9 shrink-0 items-center justify-center rounded-md bg-primary-soft px-1.5 text-xs font-semibold text-primary">
                    {formatNumber(item.count)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{item.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{item.detail}</span>
                  </span>
                  {item.href ? <ChevronRight className="size-4 shrink-0 text-muted-foreground" /> : null}
                </>
              );
              return (
                <li key={item.key}>
                  {item.href ? (
                    <Link href={item.href} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-md px-2.5 py-2 transition-[background-color,box-shadow] hover:bg-surface-3 hover:shadow-[inset_3px_0_0_var(--terracotta)]">
                      {row}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 px-2.5 py-2">{row}</div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
