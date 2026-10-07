"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { type B2BAccountDetail, type B2BDraft, B2BForm } from "@/components/admin/b2b-form";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";

const toDraft = (a: B2BAccountDetail): B2BDraft => ({
  doctorName: a.doctorName, phone: a.phone ?? "", email: a.email ?? "", qualification: a.qualification ?? "",
  registrationNumber: a.registrationNumber ?? "", registrationCouncil: a.registrationCouncil ?? "",
  businessName: a.businessName, type: a.type, addressLine: a.addressLine ?? "", city: a.city ?? "", state: a.state ?? "", pincode: a.pincode ?? "",
  gstNumber: a.gstNumber ?? "", panNumber: a.panNumber ?? "", drugLicenseNumber: a.drugLicenseNumber ?? "",
  priceTierId: a.priceTierId ? String(a.priceTierId) : "", creditLimit: String(a.creditLimit), creditDays: String(a.creditDays), notes: a.notes ?? "",
});

export default function EditB2BCustomerPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isPending, isError } = useQuery({
    queryKey: ["b2b-account", Number(id)],
    queryFn: () => api<B2BAccountDetail>(`/admin/b2b/${id}`),
    // never start the form from a remembered copy: it must show what is saved right now
    gcTime: 0,
  });

  if (isError) {
    return (
      <div className="py-16 text-center">
        <p className="font-medium">This B2B customer could not be found</p>
        <Button asChild variant="outline" className="mt-3"><Link href="/admin/b2b">Back to B2B customers</Link></Button>
      </div>
    );
  }
  if (isPending || !data) {
    return <div className="grid gap-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-64" /><Skeleton className="h-64" /></div>;
  }
  return <B2BForm key={data.id} initial={toDraft(data)} account={data} />;
}
