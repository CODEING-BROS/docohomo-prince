import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import type { SessionUser } from "@/lib/types";

const API_URL = process.env.API_URL ?? "http://localhost:4000";
const SESSION_COOKIE = "dh_session";

/** Asks the backend who the session cookie belongs to; null when nobody is signed in. */
const currentUser = async (): Promise<SessionUser | null> => {
  const session = (await cookies()).get(SESSION_COOKIE);
  if (!session) return null;
  try {
    const response = await fetch(`${API_URL}/api/auth/me`, {
      headers: { cookie: `${SESSION_COOKIE}=${session.value}` },
      cache: "no-store",
    });
    return response.ok ? (await response.json()).user : null;
  } catch {
    return null;
  }
};

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/admin/login");
  return <AdminShell user={user}>{children}</AdminShell>;
}
