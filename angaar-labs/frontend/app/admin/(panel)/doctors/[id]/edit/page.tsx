"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { type DoctorDraft, DoctorForm } from "@/components/admin/doctor-form";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { DoctorDetail } from "@/lib/doctor";

const text = (value: string | number | null) => (value === null ? "" : String(value));

const toDraft = (d: DoctorDetail): DoctorDraft => ({
  displayName: d.displayName, phone: text(d.phone), email: text(d.email), photoUrl: text(d.photoUrl), stream: d.stream ?? "Homeopathy",
  qualification: text(d.qualification), specialization: text(d.specialization), specializationId: text(d.specializationId), experienceYears: text(d.experienceYears),
  languages: d.languages.join(", "), bio: text(d.bio),
  registrationNumber: text(d.registrationNumber), registrationCouncil: text(d.registrationCouncil), registrationYear: text(d.registrationYear),
  clinicName: text(d.clinicName), clinicAddress: text(d.clinicAddress), clinicCity: text(d.clinicCity), clinicState: text(d.clinicState), clinicPincode: text(d.clinicPincode),
  videoFee: text(d.videoFee), audioFee: text(d.audioFee), slotMinutes: String(d.slotMinutes), commissionPercent: String(d.commissionPercent),
  consulting: d.consulting, wholesale: d.wholesale?.status === "APPROVED" || d.wholesale?.status === "PENDING",
});

export default function EditDoctorPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isPending, isError } = useQuery({ queryKey: ["doctor", Number(id)], queryFn: () => api<DoctorDetail>(`/admin/doctors/${id}`), staleTime: 0 });

  if (isError) return <p className="py-16 text-center text-sm text-muted-foreground">This doctor could not be found.</p>;
  if (isPending || !data) return <div className="grid gap-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-72" /></div>;
  return <DoctorForm doctorId={data.id} initial={toDraft(data)} verified={data.verificationStatus === "APPROVED"} />;
}
