"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/**
 * Keeps list filters in the address bar, so a filtered view can be refreshed, bookmarked or shared.
 * Changing any filter other than the page sends the list back to page 1.
 */
export function useUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const get = useCallback((key: string) => searchParams.get(key) ?? "", [searchParams]);

  const set = useCallback(
    (changes: Record<string, string | number | undefined | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      if (!("page" in changes)) params.delete("page");
      for (const [key, value] of Object.entries(changes)) {
        if (value === undefined || value === null || value === "") params.delete(key);
        else params.set(key, String(value));
      }
      const text = params.toString();
      router.replace(text ? `${pathname}?${text}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const clear = useCallback(() => router.replace(pathname, { scroll: false }), [pathname, router]);

  return { get, set, clear, hasAny: searchParams.size > 0 };
}
