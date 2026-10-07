"use client";

import { Reveal } from "@/components/custom/motion";

// Remounts on every navigation inside this panel, so each page fades in once (search-param changes do not count).
export default function Template({ children }: { children: React.ReactNode }) {
  return <Reveal y={4}>{children}</Reveal>;
}
