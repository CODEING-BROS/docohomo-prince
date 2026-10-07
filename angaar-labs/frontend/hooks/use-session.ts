"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { ApiError, api } from "@/lib/api";

/**
 * Whoever is signed in to the area this page belongs to: the doctor dashboard and the patient's
 * account are separate sign-ins, so a doctor page sees the doctor and a patient page the patient.
 * Staff sign in separately again, on the admin panel.
 */
export type SiteUser = {
  id: number; role: string; phone: string | null; email: string | null; name: string | null;
  firstName: string | null; lastName: string | null; gender: "MALE" | "FEMALE" | "OTHER" | null; dateOfBirth: string | null;
  hasPassword: boolean;
  doctor: { id: number; verificationStatus: string; consulting: boolean } | null;
  wholesale: boolean;
};

export function useSession() {
  const queryClient = useQueryClient();
  // kept apart per area, so the doctor's details are never shown for a moment on a patient page
  const panel = usePathname().split("/")[1] === "doctor" ? "doctor" : "patient";
  const { data, isPending } = useQuery({
    queryKey: ["session", panel],
    queryFn: async () => {
      try {
        return (await api<{ user: SiteUser }>("/auth/session")).user;
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return null; // nobody signed in
        throw err;
      }
    },
    staleTime: 60_000,
    retry: false,
  });

  const signOut = async () => {
    await api("/auth/user-logout", { method: "POST" });
    queryClient.clear();
  };

  return { user: data ?? null, loading: isPending, signOut, refresh: () => queryClient.invalidateQueries({ queryKey: ["session"] }) };
}
