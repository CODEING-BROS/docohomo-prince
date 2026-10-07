import { redirect } from "next/navigation";

// Finding and booking a doctor now lives inside the patient's own dashboard.
export default function DoctorsPage() {
  redirect("/patient/book");
}
