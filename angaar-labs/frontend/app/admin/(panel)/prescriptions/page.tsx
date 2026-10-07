"use client";

import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import Link from "next/link";
import { Suspense, useState } from "react";
import { BulkActions, SelectPage, SelectRow, useSelection } from "@/components/admin/bulk";
import { DateRangePicker } from "@/components/admin/date-range-picker";
import { EmptyState, PageHeader, PaginationBar, SearchInput, StatusBadge } from "@/components/admin/parts";
import { PrescriptionBody, type PrescriptionItem } from "@/components/admin/prescription-body";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useUrlState } from "@/hooks/use-url-state";
import { api } from "@/lib/api";
import { formatDate, formatDateTime, formatMoneyExact, humanize } from "@/lib/format";
import { useTimeZone } from "@/lib/timezone";
import type { Paged } from "@/lib/types";
import { SectionCard } from "@/components/custom/section-card";
import { DataTableRow } from "@/components/custom/data-table";

type PrescriptionRow = {
  id: number;
  prescriptionNumber: string;
  issuedAt: string | null;
  patientName: string;
  patientPhone: string | null;
  diagnosis: string | null;
  doctorId: number;
  doctorName: string;
  medicineCount: number;
  orderCount: number;
};

type PrescriptionDetail = {
  id: number;
  prescriptionNumber: string;
  issuedAt: string | null;
  patientName: string;
  diagnosis: string | null;
  advice: string | null;
  followUpDate: string | null;
  doctor: { id: number; name: string; qualification: string | null; specialization: string | null; registrationNumber: string | null };
  bookedBy: { id: number; name: string | null; phone: string | null };
  appointment: {
    id: number;
    appointmentNumber: string;
    scheduledAt: string;
    mode: string;
    patientAge: number | null;
    patientGender: string | null;
    symptoms: string | null;
  } | null;
  items: PrescriptionItem[];
  orders: { id: number; orderNumber: string; status: string; paymentStatus: string; grandTotal: number; placedAt: string }[];
};


const heading = "mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase";

function PrescriptionPanel({ prescriptionId, onClose }: { prescriptionId: number | null; onClose: () => void }) {
  const { data: prescription, isPending, isError } = useQuery({
    queryKey: ["prescription", prescriptionId],
    queryFn: () => api<PrescriptionDetail>(`/admin/prescriptions/${prescriptionId}`),
    enabled: prescriptionId !== null,
  });

  const appointment = prescription?.appointment;
  const patientLine = appointment
    ? [
        appointment.patientAge !== null ? `${appointment.patientAge} ${appointment.patientAge === 1 ? "year" : "years"}` : null,
        appointment.patientGender ? humanize(appointment.patientGender) : null,
      ].filter(Boolean).join(", ")
    : "";

  return (
    <Sheet open={prescriptionId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-xl">
        {isError ? (
          <SheetHeader><SheetTitle>Prescription</SheetTitle><SheetDescription>Could not load this prescription. Close this panel and try again.</SheetDescription></SheetHeader>
        ) : isPending || !prescription ? (
          <>
            <SheetHeader><SheetTitle>Prescription</SheetTitle><SheetDescription>Loading…</SheetDescription></SheetHeader>
            <div className="grid gap-3 p-4"><Skeleton className="h-24" /><Skeleton className="h-40" /></div>
          </>
        ) : (
          <>
            <SheetHeader className="border-b">
              <SheetTitle className="pr-8">Prescription {prescription.prescriptionNumber}</SheetTitle>
              <SheetDescription>
                {prescription.issuedAt ? `Given to the patient on ${formatDateTime(prescription.issuedAt)}` : "Given to the patient"}
              </SheetDescription>
            </SheetHeader>

            <div className="grid gap-5 p-4 text-sm">
              <section className="grid gap-3 sm:grid-cols-2">
                <div>
                  <h3 className={heading}>Doctor</h3>
                  <p className="font-medium">
                    <Link href={`/admin/doctors/${prescription.doctor.id}`} className="underline-offset-4 hover:underline">{prescription.doctor.name}</Link>
                  </p>
                  <p className="text-muted-foreground">{[prescription.doctor.qualification, prescription.doctor.specialization].filter(Boolean).join(" · ")}</p>
                  {prescription.doctor.registrationNumber ? <p className="text-muted-foreground">Registration no. {prescription.doctor.registrationNumber}</p> : null}
                </div>
                <div>
                  <h3 className={heading}>Patient</h3>
                  <p className="font-medium">{prescription.patientName}</p>
                  {patientLine ? <p className="text-muted-foreground">{patientLine}</p> : null}
                  <p className="text-muted-foreground">{prescription.bookedBy.phone}</p>
                  {prescription.bookedBy.name && prescription.bookedBy.name !== prescription.patientName ? (
                    <p className="mt-1 text-xs text-muted-foreground">Account of {prescription.bookedBy.name}</p>
                  ) : null}
                </div>
              </section>

              {appointment ? (
                <p className="text-muted-foreground">
                  Written after appointment{" "}
                  <Link href={`/admin/appointments?q=${appointment.appointmentNumber}`} className="text-foreground underline underline-offset-4">{appointment.appointmentNumber}</Link>
                  {" "}on {formatDateTime(appointment.scheduledAt)}.
                </p>
              ) : null}

              <Separator />

              <PrescriptionBody diagnosis={prescription.diagnosis} advice={prescription.advice} followUpDate={prescription.followUpDate} items={prescription.items} />

              <Separator />

              <section>
                <h3 className={heading}>Orders placed from this prescription</h3>
                {prescription.orders.length === 0 ? (
                  <p className="text-muted-foreground">The patient has not ordered these medicines from the store yet.</p>
                ) : (
                  <ul className="grid gap-2">
                    {prescription.orders.map((order) => (
                      <li key={order.id} className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <Link href={`/admin/orders?q=${order.orderNumber}`} className="font-medium underline underline-offset-4">{order.orderNumber}</Link>
                          <p className="text-xs text-muted-foreground">{formatDateTime(order.placedAt)}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="font-medium ledger">{formatMoneyExact(order.grandTotal)}</span>
                          <StatusBadge status={order.status} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function PrescriptionsView() {
  const url = useUrlState();
  const tz = useTimeZone();
  const [openId, setOpenId] = useState<number | null>(null);

  const filters = {
    tz, q: url.get("q"), from: url.get("from"), to: url.get("to"),
    page: url.get("page") || "1", pageSize: url.get("pageSize") || "20",
  };
  const { data, isPending, isError } = useQuery({
    queryKey: ["prescriptions", filters],
    queryFn: () => api<Paged<PrescriptionRow>>("/admin/prescriptions", { query: filters }),
    placeholderData: (previous) => previous,
  });
  const selection = useSelection((data?.items ?? []).map((prescription) => prescription.id));

  return (
    <>
      <PageHeader title="Prescriptions" description="Prescriptions your doctors have given to patients after a consultation" />

      <SectionCard flush>
        <div className="flex flex-wrap items-center gap-2 border-b border-foreground/18 bg-surface-2 px-3 py-2">
          <SearchInput value={filters.q} onChange={(q) => url.set({ q })} placeholder="Prescription number, patient or doctor" className="w-full sm:w-80" />
          <DateRangePicker
            align="start"
            placeholder="Any issue date"
            value={filters.from && filters.to ? { from: filters.from, to: filters.to } : null}
            onChange={(range) => url.set({ from: range?.from, to: range?.to })}
          />
          {url.hasAny ? <Button variant="ghost" className="h-9" onClick={url.clear}>Clear filters</Button> : null}
          {/* a prescription given to a patient is their medical record: it can be exported, never deleted */}
          <BulkActions table="prescriptions" noun="prescriptions" selection={selection} filters={filters} deletable={false} />
        </div>

        {isError ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Could not load prescriptions. Check that the backend is running.</p>
        ) : isPending || !data ? (
          <div className="grid gap-2 p-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : data.items.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={url.hasAny ? "No prescriptions match" : "No prescriptions yet"}
            description={
              url.hasAny
                ? "Try a different search, or clear the filters to see every prescription."
                : "When a doctor finishes a consultation and gives the patient a prescription, it appears here. Drafts the doctor is still writing are not shown."
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 pl-4"><SelectPage selection={selection} noun="prescriptions" /></TableHead>
                <TableHead>Prescription</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Doctor</TableHead>
                <TableHead className="text-right">Medicines</TableHead>
                <TableHead className="pr-4">Ordered from store</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((prescription) => (
                <DataTableRow key={prescription.id} selected={selection.has(prescription.id)} onOpen={() => setOpenId(prescription.id)}>
                  <TableCell className="pl-4"><SelectRow selection={selection} id={prescription.id} label={prescription.prescriptionNumber} /></TableCell>
                  <TableCell>
                    <div className="font-medium">{prescription.prescriptionNumber}</div>
                    <div className="text-xs text-muted-foreground">{prescription.issuedAt ? formatDate(prescription.issuedAt) : "—"}</div>
                  </TableCell>
                  <TableCell>
                    <div className="max-w-52 truncate">{prescription.patientName}</div>
                    <div className="text-xs text-muted-foreground">{prescription.patientPhone}</div>
                  </TableCell>
                  <TableCell><div className="max-w-52 truncate">{prescription.doctorName}</div></TableCell>
                  <TableCell className="text-right ledger">{prescription.medicineCount}</TableCell>
                  <TableCell className="pr-4">
                    {prescription.orderCount > 0 ? (
                      <StatusBadge status="SUCCESS" label={prescription.orderCount === 1 ? "Order placed" : `${prescription.orderCount} orders placed`} />
                    ) : (
                      <span className="text-muted-foreground">Not yet</span>
                    )}
                  </TableCell>
                </DataTableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {data ? (
          <PaginationBar
            page={data.page} pageCount={data.pageCount} pageSize={data.pageSize} total={data.total} noun="prescriptions"
            onPage={(page) => url.set({ page })} onPageSize={(pageSize) => url.set({ pageSize })}
          />
        ) : null}
      </SectionCard>

      <PrescriptionPanel prescriptionId={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

export default function PrescriptionsPage() {
  return (
    <Suspense>
      <PrescriptionsView />
    </Suspense>
  );
}
