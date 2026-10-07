"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { StatusDot } from "@/components/admin/parts";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { humanize } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Picks one status from a grouped list. Opens under the button, scrolls when the list is long,
 * and can be narrowed by typing.
 */
export function StatusPicker<T extends string>({
  value, onChange, groups, exclude, placeholder = "Choose a status", className,
}: {
  value: T | "";
  onChange: (value: T) => void;
  groups: { label: string; statuses: T[] }[];
  exclude?: T; // the status the record already has
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className={cn("h-9 justify-between gap-2 font-normal", !value && "text-muted-foreground", className)}>
          <span className="flex min-w-0 items-center gap-2">
            {value ? <StatusDot status={value} /> : null}
            <span className="truncate">{value ? humanize(value) : placeholder}</span>
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-56 p-0">
        <Command>
          <CommandInput placeholder="Type to find a status…" />
          <CommandList className="max-h-64 overflow-y-auto">
            <CommandEmpty>No status matches.</CommandEmpty>
            {groups.map((group) => {
              const statuses = group.statuses.filter((status) => status !== exclude);
              if (statuses.length === 0) return null;
              return (
                <CommandGroup key={group.label} heading={group.label}>
                  {statuses.map((status) => (
                    <CommandItem
                      key={status}
                      value={humanize(status)}
                      onSelect={() => {
                        onChange(status);
                        setOpen(false);
                      }}
                    >
                      <StatusDot status={status} />
                      <span className="flex-1">{humanize(status)}</span>
                      <Check className={cn("size-4", value === status ? "opacity-100" : "opacity-0")} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
