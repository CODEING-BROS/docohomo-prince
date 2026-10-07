import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono, Public_Sans } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

// Public Sans for text (the font the previous admin panel used), Fraunces for titles and big
// figures, IBM Plex Mono for order numbers, SKUs and references. See components/custom/DESIGN.md.
const publicSans = Public_Sans({ variable: "--font-sans", subsets: ["latin"], display: "swap" });
// only the optical-size axis is loaded; the "SOFT" axis can be added once the login page's load time is measured
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], axes: ["opsz"], display: "swap" });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "DocHomoeo", template: "%s · DocHomoeo" },
  description: "DocHomoeo store management",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${publicSans.variable} ${fraunces.variable} ${plexMono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
