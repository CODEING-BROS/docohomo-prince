"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, TriangleAlert, Wallet } from "lucide-react";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { BulkActions } from "@/components/admin/bulk";
import { Combobox } from "@/components/admin/combobox";
import { PayoutAutomation } from "@/components/admin/payout-automation";
import { EmptyState, PageHeader, PaginationBar, StatusBadge, Thumb } from "@/components/admin/parts";
import { formatDay } from "@/components/admin/prescription-body";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useUrlState } from "@/hooks/use-url-state";
import { api } from "@/lib/api";
import { formatDate, formatDateTime, formatMoneyExact, formatNumber } from "@/lib/format";
import { useTimeZone } from "@/lib/timezone";
import type { Paged } from "@/lib/types";
import { FilterChips } from "@/components/custom/filter-chips";
import { SectionCard } from "@/components/custom/section-card";
import { ButtonSpinner } from "@/components/custom/loaders";

type PayoutStatus = "PENDING" | "PAID" | "FAILED";
type Bank = { accountName: string | null; accountNumber: string; ifsc: string };

type OwedRow = {
  doctorId: number;
  doctorName: string;
  photoUrl: string | null;
  consultations: number;
  amount: number;
  oldestCompletedAt: string | null;
  hasBankDetails: boolean;
  bank: Bank | null;
};

type PayoutRow = {
  id: number;
  doctorId: number;
  doctorName: string;
  periodStart: string; // yyyy-MM-dd
  periodEnd: string;
  amount: number;
  status: PayoutStatus;
  reference: string | null;
  paidAt: string | null;
  createdAt: string;
  consultations: number;
  hasBankDetails: boolean;
  bank: Bank | null;
};

type PayoutList = Paged<PayoutRow> & {
  statusCounts: Partial<Record<PayoutStatus, number>>;
  doctors: { id: number; name: string }[];
};

const STATUSES: PayoutStatus[] = ["PENDING", "PAID", "FAILED"];
const STATUS_LABEL: Record<PayoutStatus, string> = { PENDING: "Waiting to be paid", PAID: "Paid", FAILED: "Failed" };

const consultationWord = (count: number) => `${formatNumber(count)} ${count === 1 ? "consultation" : "consultations"}`;


/** Where the money goes, or a warning when the doctor has not given an account. */
function BankDetails({ bank }: { bank: Bank | null }) {
  if (!bank) {
    return (
      <div className="flex items-start gap-2 rounded-lg bg-warning/15 p-3">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
        <p>No bank details are on file for this doctor. Ask the doctor for their account number and IFSC before you send the money.</p>
      </div>
    );
  }
  return (
    <div className="rounded-lg bg-surface-2 p-3">
      <p className="mb-1 text-[0.6875rem]/none font-semibold tracking-[0.12em] text-muted-foreground uppercase">Pay into</p>
      <p className="font-medium">{bank.accountName ?? "Account name not given"}</p>
      <p className="ledger">Account number {bank.accountNumber}</p>
      <p>IFSC {bank.ifsc}</p>
    </div>
  );
}

function PayoutsView() {
  const url = useUrlState();
  const tz = useTimeZone();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState<OwedRow | null>(null);
  const [paying, setPaying] = useState<PayoutRow | null>(null);
  const [failing, setFailing] = useState<PayoutRow | null>(null);
  const [reference, setReference] = useState("");
  const [chosen, setChosen] = useState<number[]>([]);
  const [payingMany, setPayingMany] = useState(false);

  const filters = { tz, status: url.get("status"), doctorId: url.get("doctorId"), page: url.get("page") || "1", pageSize: url.get("pageSize") || "20" };

  const owed = useQuery({
    queryKey: ["payouts-owed"],
    queryFn: () => api<{ items: OwedRow[]; totalAmount: number }>("/admin/payouts/owed"),
  });
  const { data, isPending, isError } = useQuery({
    queryKey: ["payouts", filters],
    queryFn: () => api<PayoutList>("/admin/payouts", { query: filters }),
    placeholderData: (previous) => previous,
  });

  const refresh = () => ["payouts", "payouts-owed", "appointment"].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));

  const create = useMutation({
    mutationFn: (row: OwedRow) => api<{ id: number; amount: number; consultations: number }>("/admin/payouts", { method: "POST", body: { doctorId: row.doctorId } }),
    onSuccess: (result, row) => {
      toast.success(`Payout of ${formatMoneyExact(result.amount)} created for ${row.doctorName}. Send the money, then mark it as paid.`);
      setCreating(null);
      refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  const update = useMutation({
    mutationFn: (input: { payout: PayoutRow; body: { status: "PAID"; reference: string } | { status: "FAILED" } }) =>
      api<{ releasedConsultations: number }>(`/admin/payouts/${input.payout.id}`, { method: "PATCH", body: input.body }),
    onSuccess: (result, input) => {
      if (input.body.status === "PAID") {
        toast.success(`Payout to ${input.payout.doctorName} marked as paid`);
      } else {
        toast.success(`Payout marked as failed. ${consultationWord(result.releasedConsultations)} can be paid again from "Owed to doctors".`);
      }
      setPaying(null);
      setFailing(null);
      setReference("");
      refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  const payMany = useMutation({
    mutationFn: (ids: number[]) => api<{ paid: number; skipped: number }>("/admin/payouts/mark-paid", { method: "POST", body: { ids, reference: reference.trim() } }),
    onSuccess: (result) => {
      toast.success(`${formatNumber(result.paid)} ${result.paid === 1 ? "payout" : "payouts"} marked as paid. Each doctor has been told.`);
      if (result.skipped) toast.info(`${formatNumber(result.skipped)} had already been paid or marked as failed, and were left alone`);
      setPayingMany(false);
      setChosen([]);
      setReference("");
      refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  // a payout that was paid is the record of a bank transfer and cannot be ticked; the rest can be
  // ticked to delete them, and those still waiting (and still on this page) to be paid together
  const tickable = (data?.items ?? []).filter((payout) => payout.status !== "PAID");
  const waitingHere = tickable.filter((payout) => payout.status === "PENDING");
  const picked = waitingHere.filter((payout) => chosen.includes(payout.id));
  const pickedAmount = picked.reduce((sum, payout) => sum + payout.amount, 0);
  const allPicked = tickable.length > 0 && tickable.every((payout) => chosen.includes(payout.id));

  const counts = data?.statusCounts ?? {};
  const tabs: { value: string; label: string; count: number }[] = [
    { value: "", label: "All", count: Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0) },
    ...STATUSES.filter((s) => counts[s] || filters.status === s).map((s) => ({ value: s as string, label: STATUS_LABEL[s], count: counts[s] ?? 0 })),
  ];
  const doctorOptions = (data?.doctors ?? []).map((doctor) => ({ value: String(doctor.id), label: doctor.name }));

  return (
    <>
      <PageHeader title="Doctor payouts" description="Pay doctors their share of the consultations they have completed" />

      <PayoutAutomation onChanged={refresh} />

      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-medium">Owed to doctors</h2>
            <p className="text-sm text-muted-foreground">Completed consultations that are not on a payout yet</p>
          </div>
          {owed.data && owed.data.items.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              Total owed <span className="ml-1 text-base font-semibold text-foreground ledger">{formatMoneyExact(owed.data.totalAmount)}</span>
            </p>
          ) : null}
        </div>

        <SectionCard flush>
          {owed.isError ? (
            <p className="py-16 text-center text-sm text-muted-foreground">Could not load what is owed. Check that the backend is running.</p>
          ) : owed.isPending || !owed.data ? (
            <div className="grid gap-2 p-4">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : owed.data.items.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="Nothing is owed right now"
              description="When a doctor completes a consultation the patient paid for, the doctor's share appears here until you create a payout for it."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Doctor</TableHead>
                  <TableHead className="text-right">Consultations</TableHead>
                  <TableHead>Oldest unpaid</TableHead>
                  <TableHead>Bank details</TableHead>
                  <TableHead className="text-right">Amount owed</TableHead>
                  <TableHead className="w-10 pr-4"><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {owed.data.items.map((row) => (
                  <TableRow key={row.doctorId}>
                    <TableCell className="pl-4">
                      <div className="flex items-center gap-3">
                        <Thumb src={row.photoUrl} name={row.doctorName.replace(/^dr\.?\s*/i, "")} className="rounded-full" />
                        <span className="max-w-56 truncate font-medium">{row.doctorName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right ledger">{formatNumber(row.consultations)}</TableCell>
                    <TableCell className="text-muted-foreground">{row.oldestCompletedAt ? formatDate(row.oldestCompletedAt) : "—"}</TableCell>
                    <TableCell>
                      {row.hasBankDetails ? <StatusBadge status="SUCCESS" label="On file" /> : <StatusBadge status="PENDING" label="Missing" />}
                    </TableCell>
                    <TableCell className="text-right font-medium ledger">{formatMoneyExact(row.amount)}</TableCell>
                    <TableCell className="pr-4 text-right">
                      <Button size="sm" onClick={() => setCreating(row)}>Create payout</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>
      </section>

      <section>
        <div className="mb-3">
          <h2 className="font-medium">Payouts</h2>
          <p className="text-sm text-muted-foreground">Every payout you have created, and whether the money has been sent</p>
        </div>

        <FilterChips ariaLabel="Status" className="mb-3" value={filters.status || "all"} onChange={(v) => url.set({ status: v === "all" ? "" : v })} options={tabs.map((tab) => ({ value: tab.value || "all", label: tab.label, count: tab.count }))} />

        <SectionCard flush>
          <div className="flex flex-wrap items-center gap-2 border-b border-foreground/18 bg-surface-2 px-3 py-2">
            <Combobox value={filters.doctorId} onChange={(doctorId) => url.set({ doctorId })} options={doctorOptions} allLabel="All doctors" searchPlaceholder="Search doctors…" className="w-56" />
            {url.hasAny ? <Button variant="ghost" className="h-9" onClick={url.clear}>Clear filters</Button> : null}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {picked.length > 0 ? (
                <Button className="h-9" onClick={() => { setReference(""); setPayingMany(true); }}>
                  Mark {formatNumber(picked.length)} as paid
                </Button>
              ) : null}
              <BulkActions
                table="payouts" noun="payouts" filters={filters} className="ml-0"
                selection={{ ids: chosen, count: chosen.length, clear: () => setChosen([]) }}
                refresh={["payouts", "payouts-owed", "appointment"]}
                deleteNote="The consultations on a payout that was not paid are owed to the doctor again, and can go on a new payout. Payouts already paid are kept."
              />
            </div>
          </div>

          {isError ? (
            <p className="py-16 text-center text-sm text-muted-foreground">Could not load payouts. Check that the backend is running.</p>
          ) : isPending || !data ? (
            <div className="grid gap-2 p-4">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : data.items.length === 0 ? (
            <EmptyState
              icon={Banknote}
              title={url.hasAny ? "No payouts match" : "No payouts yet"}
              description={
                url.hasAny
                  ? "Try a different status or doctor, or clear the filters to see every payout."
                  : "A payout is a record of money you send to a doctor. Create one from \"Owed to doctors\" above, make the bank transfer, then mark it as paid here."
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 pl-4">
                    {tickable.length > 0 ? (
                      <Checkbox
                        aria-label="Choose every payout on this page that has not been paid" checked={allPicked}
                        onCheckedChange={(checked) => setChosen(checked === true ? tickable.map((payout) => payout.id) : [])}
                      />
                    ) : null}
                  </TableHead>
                  <TableHead>Payout</TableHead>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Consultation dates</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-4"><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((payout) => (
                  <TableRow key={payout.id} data-state={chosen.includes(payout.id) ? "selected" : undefined}>
                    <TableCell className="pl-4">
                      {payout.status !== "PAID" ? (
                        <Checkbox
                          aria-label={`Choose payout ${payout.id}`} checked={chosen.includes(payout.id)}
                          onCheckedChange={(checked) => setChosen((current) => (checked === true ? [...current, payout.id] : current.filter((id) => id !== payout.id)))}
                        />
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">#{payout.id}</div>
                      <div className="text-xs text-muted-foreground">Created {formatDate(payout.createdAt)}</div>
                    </TableCell>
                    <TableCell><div className="max-w-52 truncate">{payout.doctorName}</div></TableCell>
                    <TableCell className="text-muted-foreground">
                      {payout.periodStart === payout.periodEnd ? formatDay(payout.periodStart) : `${formatDay(payout.periodStart)} – ${formatDay(payout.periodEnd)}`}
                    </TableCell>
                    <TableCell className="text-right font-medium ledger">
                      {formatMoneyExact(payout.amount)}
                      {payout.status === "FAILED" ? null : <div className="text-xs font-normal text-muted-foreground">{consultationWord(payout.consultations)}</div>}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={payout.status} label={STATUS_LABEL[payout.status]} />
                      {payout.status === "PAID" ? (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {payout.paidAt ? <div>{formatDateTime(payout.paidAt)}</div> : null}
                          {payout.reference ? <div className="max-w-64 break-all whitespace-normal">Reference {payout.reference}</div> : null}
                        </div>
                      ) : payout.status === "FAILED" ? (
                        <div className="mt-0.5 text-xs text-muted-foreground">Its consultations are owed again</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="pr-4">
                      {payout.status === "PENDING" ? (
                        <div className="flex justify-end gap-2">
                          <Button size="sm" onClick={() => { setReference(""); setPaying(payout); }}>Mark as paid</Button>
                          <Button size="sm" variant="outline" onClick={() => setFailing(payout)}>Mark as failed</Button>
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {data ? (
            <PaginationBar
              page={data.page} pageCount={data.pageCount} pageSize={data.pageSize} total={data.total} noun="payouts"
              onPage={(page) => url.set({ page })} onPageSize={(pageSize) => url.set({ pageSize })}
            />
          ) : null}
        </SectionCard>
      </section>

      {/* create a payout for everything a doctor is owed */}
      <Dialog open={creating !== null} onOpenChange={(open) => !open && setCreating(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="pr-8 leading-snug">Create a payout for {creating?.doctorName}?</DialogTitle>
            <DialogDescription>
              {creating ? `${formatMoneyExact(creating.amount)} for ${consultationWord(creating.consultations)} completed up to today.` : null}
            </DialogDescription>
          </DialogHeader>
          {creating ? <BankDetails bank={creating.bank} /> : null}
          <p className="text-muted-foreground">
            This does not send any money. It sets the amount aside as one payment: make the bank transfer yourself, then mark the payout as paid.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(null)}>Cancel</Button>
            <Button disabled={create.isPending} onClick={() => creating && create.mutate(creating)}>
              {create.isPending ? <ButtonSpinner /> : null}Create payout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* the transfer went through: record its bank reference */}
      <Dialog open={paying !== null} onOpenChange={(open) => { if (!open) { setPaying(null); setReference(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="pr-8 leading-snug">Mark payout #{paying?.id} as paid?</DialogTitle>
            <DialogDescription>
              {paying ? `${formatMoneyExact(paying.amount)} to ${paying.doctorName} for ${consultationWord(paying.consultations)}. Do this after you have sent the money.` : null}
            </DialogDescription>
          </DialogHeader>
          {paying ? <BankDetails bank={paying.bank} /> : null}
          <div className="grid gap-1.5">
            <Label htmlFor="payout-reference">Bank reference</Label>
            <Input
              id="payout-reference" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} autoFocus
              placeholder="UTR or transaction number from your bank"
            />
            <p className="text-xs text-muted-foreground">The doctor can use this number to find the payment in their account.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPaying(null); setReference(""); }}>Cancel</Button>
            <Button
              disabled={!reference.trim() || update.isPending}
              onClick={() => paying && update.mutate({ payout: paying, body: { status: "PAID", reference: reference.trim() } })}
            >
              {update.isPending ? <ButtonSpinner /> : null}Mark as paid
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* one bank upload paid many doctors: record its reference on all of them */}
      <Dialog open={payingMany} onOpenChange={(open) => { if (!open) { setPayingMany(false); setReference(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="pr-8 leading-snug">Mark {formatNumber(picked.length)} {picked.length === 1 ? "payout" : "payouts"} as paid?</DialogTitle>
            <DialogDescription>
              {formatMoneyExact(pickedAmount)} in total. Do this after the bank has sent the money. Each doctor gets a message that they have been paid.
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-44 divide-y overflow-y-auto rounded-lg border text-sm">
            {picked.map((payout) => (
              <li key={payout.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0 truncate">{payout.doctorName}{payout.hasBankDetails ? null : <span className="ml-2 text-xs text-warning">no bank details</span>}</span>
                <span className="shrink-0 ledger">{formatMoneyExact(payout.amount)}</span>
              </li>
            ))}
          </ul>
          <div className="grid gap-1.5">
            <Label htmlFor="payouts-reference">Bank reference</Label>
            <Input
              id="payouts-reference" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} autoFocus
              placeholder="Batch or UTR number from your bank"
            />
            <p className="text-xs text-muted-foreground">The same reference is saved on every payout chosen.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPayingMany(false); setReference(""); }}>Cancel</Button>
            <Button disabled={reference.trim().length < 2 || picked.length === 0 || payMany.isPending} onClick={() => payMany.mutate(picked.map((payout) => payout.id))}>
              {payMany.isPending ? <ButtonSpinner /> : null}Mark as paid
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* the transfer did not go through */}
      <Dialog open={failing !== null} onOpenChange={(open) => !open && setFailing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="pr-8 leading-snug">Mark payout #{failing?.id} as failed?</DialogTitle>
            <DialogDescription>
              {failing
                ? `Use this if the transfer of ${formatMoneyExact(failing.amount)} to ${failing.doctorName} did not go through. Its ${consultationWord(failing.consultations)} ${failing.consultations === 1 ? "goes" : "go"} back to "Owed to doctors", so you can create a new payout. This cannot be undone.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFailing(null)}>Cancel</Button>
            <Button variant="destructive" disabled={update.isPending} onClick={() => failing && update.mutate({ payout: failing, body: { status: "FAILED" } })}>
              {update.isPending ? <ButtonSpinner /> : null}Mark as failed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function PayoutsPage() {
  return (
    <Suspense>
      <PayoutsView />
    </Suspense>
  );
}
