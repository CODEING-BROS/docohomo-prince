import { formatDate } from "@/lib/format";

export type PrescriptionItem = {
  id: number;
  medicineName: string;
  potency: string | null;
  dosage: string | null;
  frequency: string | null;
  duration: string | null;
  instructions: string | null;
  quantity: number;
};

/** A date with no time ("2026-10-05"). Noon UTC falls on that same day in every timezone the header offers. */
export const formatDay = (day: string) => formatDate(`${day}T12:00:00Z`);

const heading = "mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase";

/** What the doctor wrote: diagnosis, medicines, advice and follow-up. Used on the appointment and prescription panels. */
export function PrescriptionBody({
  diagnosis, advice, followUpDate, items,
}: { diagnosis: string | null; advice: string | null; followUpDate: string | null; items: PrescriptionItem[] }) {
  return (
    <div className="grid gap-4">
      <div>
        <h3 className={heading}>Diagnosis</h3>
        <p className="whitespace-pre-wrap">{diagnosis ?? <span className="text-muted-foreground">Not written</span>}</p>
      </div>

      <div>
        <h3 className={heading}>Medicines ({items.length})</h3>
        {items.length === 0 ? (
          <p className="text-muted-foreground">No medicines were prescribed, only advice.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Medicine</th>
                  <th className="px-3 py-2 font-medium">How to take</th>
                  <th className="px-3 py-2 font-medium">For</th>
                  <th className="px-3 py-2 text-right font-medium">Qty</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t align-top">
                    <td className="px-3 py-2">
                      <p className="font-medium">{item.medicineName}</p>
                      {item.potency ? <p className="text-xs text-muted-foreground">{item.potency}</p> : null}
                      {item.instructions ? <p className="mt-1 text-xs text-muted-foreground">{item.instructions}</p> : null}
                    </td>
                    <td className="px-3 py-2">{[item.dosage, item.frequency].filter(Boolean).join(", ") || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{item.duration ?? "—"}</td>
                    <td className="px-3 py-2 text-right ledger">{item.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h3 className={heading}>Advice</h3>
        <p className="whitespace-pre-wrap">{advice ?? <span className="text-muted-foreground">None</span>}</p>
      </div>

      <div>
        <h3 className={heading}>Follow-up</h3>
        <p>{followUpDate ? formatDay(followUpDate) : <span className="text-muted-foreground">No follow-up date set</span>}</p>
      </div>
    </div>
  );
}
