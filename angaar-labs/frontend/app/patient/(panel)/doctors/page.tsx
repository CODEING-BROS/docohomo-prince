import { redirect } from "next/navigation";

// There is no list of every doctor any more. A patient is guided to two or three doctors that suit
// them (/patient/book); a doctor they have already seen is booked again from Consultations.
export default function AllDoctorsPage() {
  redirect("/patient/book");
}
