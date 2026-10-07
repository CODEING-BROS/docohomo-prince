import { redirect } from "next/navigation";

// Finding and booking a doctor now lives inside the patient's own dashboard.
export default async function DoctorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/patient/doctors/${encodeURIComponent(slug)}`);
}
