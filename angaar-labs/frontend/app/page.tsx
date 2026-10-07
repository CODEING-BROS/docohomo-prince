import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

// The public website is built separately. This page only points to the three panels.
export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 p-6 text-center">
      {/* the logo is drawn for a light background, so it sits on a white tile in dark mode */}
      {/* eslint-disable-next-line @next/next/no-img-element -- small static logo */}
      <img src="/logo.png" alt="DocHomoeo" className="h-28 w-auto rounded-md object-contain dark:bg-white dark:px-3 dark:py-1.5" />
      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href="/admin">
            Admin panel <ArrowRight />
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/doctor">
            Doctor dashboard <ArrowRight />
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/patient">
            Patient account <ArrowRight />
          </Link>
        </Button>
      </div>
    </main>
  );
}
