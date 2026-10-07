"use client";

import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ZONES, setTimeZone, useTimeZone, zoneShortName } from "@/lib/timezone";

const offsetLabel = (zone: string) =>
  new Intl.DateTimeFormat("en", { timeZone: zone, timeZoneName: "shortOffset" })
    .formatToParts(new Date())
    .find((part) => part.type === "timeZoneName")?.value.replace("GMT", "UTC") ?? "";

/** Header control for the timezone every date in the admin is shown and counted in. */
export function TimeZoneSelect() {
  const zone = useTimeZone();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="lg" className="gap-1.5 px-2 text-sm font-medium" aria-label={`Timezone: ${zoneShortName(zone)}`}>
          <Globe className="size-4" />
          {zoneShortName(zone)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Show dates and times in</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={zone} onValueChange={setTimeZone}>
          {ZONES.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              <span className="flex-1">{option.label}</span>
              <span className="text-xs text-muted-foreground ledger">{offsetLabel(option.value)}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
