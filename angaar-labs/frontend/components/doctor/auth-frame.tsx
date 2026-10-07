import { BadgePercent, CalendarClock, IndianRupee } from "lucide-react";
import { AuthFrame as Frame } from "@/components/custom/auth-frame";

const ASIDE = {
  headline: "Run your online practice from one dashboard.",
  illustration: "doctors" as const,
  points: [
    { icon: CalendarClock, text: "Appointments, the video call and the prescription on one screen." },
    { icon: IndianRupee, text: "Earnings, what is waiting and what has reached your bank." },
    { icon: BadgePercent, text: "Medicines for your practice at doctor prices, with GST invoices." },
  ],
  note: "Every doctor is verified against their registration certificate.",
};

/** The two-sided screen used before a doctor is inside the dashboard (sign in, sign up, register). */
export function AuthFrame({ title, description, eyebrow, header, footer, wide, children }: { title: string; description?: React.ReactNode; eyebrow?: string; header?: React.ReactNode; footer?: React.ReactNode; wide?: boolean; children: React.ReactNode }) {
  return (
    <Frame panel="doctor" title={title} description={description} eyebrow={eyebrow} width={wide ? "lg" : "sm"} aside={ASIDE} header={header} footer={footer}>
      {children}
    </Frame>
  );
}
