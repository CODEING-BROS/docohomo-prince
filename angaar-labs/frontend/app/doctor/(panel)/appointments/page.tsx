"use client";

import { Search } from "lucide-react";
import { useState } from "react";
import { type DayRange, DateRangePicker } from "@/components/admin/date-range-picker";
import { PageHeader } from "@/components/admin/parts";
import { AppointmentList, useAppointments } from "@/components/doctor/appointments";
import { PrescriptionEditor } from "@/components/site/prescription-editor";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DoctorAppointment } from "@/lib/care";

export default function DoctorAppointmentsPage() {
  const [search, setSearch] = useState("");
  const [prescribing, setPrescribing] = useState<DoctorAppointment | null>(null);
  const [tab, setTab] = useState("upcoming");
  const [range, setRange] = useState<DayRange | null>(null); // past consultations only
  const upcoming = useAppointments("upcoming").data?.items.length;

  return (
    <>
      <PageHeader title="Appointments" description="Start the call, write the prescription and close the consultation from here.">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Patient name or number" aria-label="Search appointments" className="h-9 w-64 pl-8" />
        </div>
      </PageHeader>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="upcoming">Upcoming{upcoming ? ` (${upcoming})` : ""}</TabsTrigger>
            <TabsTrigger value="past">Past</TabsTrigger>
          </TabsList>
          {tab === "past" ? <DateRangePicker value={range} onChange={setRange} placeholder="Any date" /> : null}
        </div>
        <TabsContent value="upcoming" className="mt-4"><AppointmentList scope="upcoming" search={search} onPrescribe={setPrescribing} /></TabsContent>
        <TabsContent value="past" className="mt-4"><AppointmentList scope="past" search={search} range={range} onPrescribe={setPrescribing} /></TabsContent>
      </Tabs>

      <PrescriptionEditor appointment={prescribing} onClose={() => setPrescribing(null)} />
    </>
  );
}
