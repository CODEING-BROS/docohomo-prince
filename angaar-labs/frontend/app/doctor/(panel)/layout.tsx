import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DoctorShell } from "@/components/doctor/doctor-shell";
import type { SiteUser } from "@/hooks/use-session";

const API_URL = process.env.API_URL ?? "http://localhost:4000";
const USER_COOKIE = "dh_doctor"; // doctors sign in separately from staff and from patients

/** Asks the backend who the doctor-side cookie belongs to; null when nobody is signed in. */
const currentUser = async (): Promise<SiteUser | null> => {
  const session = (await cookies()).get(USER_COOKIE);
  if (!session) return null;
  try {
    const response = await fetch(`${API_URL}/api/auth/session`, { headers: { cookie: `${USER_COOKIE}=${session.value}`, "x-panel": "doctor" }, cache: "no-store" });
    return response.ok ? (await response.json()).user : null;
  } catch {
    return null;
  }
};

export const metadata = { title: "Doctor dashboard | DocHomoeo" };

export default async function DoctorPanelLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/doctor/login");
  if (!user.doctor) redirect("/doctor/register"); // has an account, has not registered a practice yet
  return <DoctorShell user={user}>{children}</DoctorShell>;
}
