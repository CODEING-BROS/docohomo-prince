"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/admin/parts";
import { WorkingHours } from "@/components/admin/working-hours";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";

type Availability = { slotMinutes: number; hours: { id: number; dayOfWeek: number; startTime: string; endTime: string }[] };

export default function DoctorSchedulePage() {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({ queryKey: ["doctor-availability"], queryFn: () => api<Availability>("/doctor/availability") });

  return (
    <>
      <PageHeader title="Working hours" description="The times patients can book you, how long each consultation lasts, and the days you are away." />
      {isPending || !data ? <Skeleton className="h-96 rounded-xl" /> : (
        <WorkingHours
          key={`${data.hours.map((h) => h.id).join("-")}-${data.slotMinutes}`}
          base="/doctor" saved={data.hours} slotMinutes={data.slotMinutes}
          onSaved={() => ["doctor-availability", "doctor-overview", "doctor-slots"].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }))}
        />
      )}
    </>
  );
}
