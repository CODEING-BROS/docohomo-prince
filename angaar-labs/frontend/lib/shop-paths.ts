"use client";

import { usePathname } from "next/navigation";

/**
 * The same shop pages serve two areas: a doctor buying wholesale inside the doctor dashboard, and a
 * customer buying at retail prices inside their own account. This says which one the page is in.
 */
export function useShop() {
  const doctor = usePathname().split("/")[1] === "doctor";
  return { doctor, base: doctor ? "/doctor/wholesale" : "/patient/shop", orders: doctor ? "/doctor/orders" : "/patient/orders" };
}
