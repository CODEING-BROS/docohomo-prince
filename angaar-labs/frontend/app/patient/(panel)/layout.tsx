import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PatientShell } from "@/components/patient/patient-shell";
import type { SiteUser } from "@/hooks/use-session";

const API_URL = process.env.API_URL ?? "http://localhost:4000";
const USER_COOKIE = "dh_user"; // customers sign in separately from staff and from doctors

/** Asks the backend who the customer-side cookie belongs to; null when nobody is signed in. */
const currentUser = async (): Promise<SiteUser | null> => {
  const session = (await cookies()).get(USER_COOKIE);
  if (!session) return null;
  try {
    const response = await fetch(`${API_URL}/api/auth/session`, { headers: { cookie: `${USER_COOKIE}=${session.value}` }, cache: "no-store" });
    return response.ok ? (await response.json()).user : null;
  } catch {
    return null;
  }
};

export const metadata = { title: "My account | DocHomoeo" };

export default async function PatientPanelLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/patient/login");
  return <PatientShell user={user}>{children}</PatientShell>;
}
