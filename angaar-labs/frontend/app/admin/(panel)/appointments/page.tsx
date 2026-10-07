"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { BulkActions, SelectPage, SelectRow, useSelection } from "@/components/admin/bulk";
import { Combobox } from "@/components/admin/combobox";
import { DateRangePicker } from "@/components/admin/date-range-picker";
import { PrescriptionBody, type PrescriptionItem } from "@/components/admin/prescription-body";
import { Callout } from "@/components/custom/callout";
import { ColHead, DataTable, DataTableRow, DataTableToolbar, PaginationBar } from "@/components/custom/data-table";
import { DetailList } from "@/components/custom/detail-list";
import { DetailSheet, ReasonDialog } from "@/components/custom/dialogs";
import { FileChips } from "@/components/custom/file-chips";
import { FilterChips } from "@/components/custom/filter-chips";
import { SearchField } from "@/components/custom/form-field";
import { Money } from "@/components/custom/number";
import { PageHero } from "@/components/custom/page-hero";
import { SectionCard } from "@/components/custom/section-card";
import { StatusPill } from "@/components/custom/status-pill";
import { Mono, SectionLabel } from "@/components/custom/typography";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { useUrlState } from "@/hooks/use-url-state";
import { api } from "@/lib/api";
import { formatDateTime, formatMoneyExact, formatNumber, humanize } from "@/lib/format";
import { useTimeZone } from "@/lib/timezone";
import type { Paged } from "@/lib/types";

type AppointmentStatus = "PENDING_PAYMENT" | "CONFIRMED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
type ConsultationMode = "VIDEO" | "AUDIO" | "CHAT" | "IN_CLINIC";
type Gender = "MALE" | "FEMALE" | "OTHER";

type AppointmentRow = {
  id: number;
  appointmentNumber: string;
  scheduledAt: string;
  durationMinutes: number;
  mode: ConsultationMode;
  status: AppointmentStatus;
  fee: number;
  doctorEarning: number;
  patientName: string;
  patientAge: number | null;
  patientGender: Gender | null;
  patientPhone: string | null;
  doctorId: number;
  doctorName: string;
  hasPrescription: boolean;
};

type AppointmentList = Paged<AppointmentRow> & { statusCounts: Partial<Record<AppointmentStatus, number>> };

type AppointmentDetail = Omit<AppointmentRow, "doctorId" | "doctorName" | "hasPrescription"> & {
  symptoms: string | null;
  doctorNotes: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  completedAt: string | null;
  createdAt: string;
  doctor: { id: number; name: string; qualification: string | null; specialization: string | null; phone: string | null };
  bookedBy: { id: number; name: string | null; phone: string | null; email: string | null };
  payments: { id: number; provider: string; method: string | null; providerRef: string | null; amount: number; refundedAmount: number; status: string; paidAt: string | null; createdAt: string }[];
  payout: { id: number; status: "PENDING" | "PAID" | "FAILED"; paidAt: string | null; reference: string | null } | null;
  refundDueAmount: number;
  prescriptionInDraft: boolean;
  files: { id: number; fileName: string; kind: string; size: number }[];
  prescription: {
    id: number;
    prescriptionNumber: string;
    diagnosis: string | null;
    advice: string | null;
    followUpDate: string | null;
    issuedAt: string | null;
    items: PrescriptionItem[];
    orders: { id: number; orderNumber: string; status: string }[];
  } | null;
};

const STATUSES: AppointmentStatus[] = ["PENDING_PAYMENT", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "NO_SHOW", "CANCELLED"];

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  PENDING_PAYMENT: "Waiting for payment",
  CONFIRMED: "Confirmed",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "Patient did not attend",
};

const MODE_LABEL: Record<ConsultationMode, string> = {
  VIDEO: "Video call",
  AUDIO: "Audio call",
  CHAT: "Chat",
  IN_CLINIC: "At the clinic",
};

const CANCELLED_BY: Record<string, string> = { ADMIN: "the clinic", PATIENT: "the patient", DOCTOR: "the doctor" };

const ageAndGender = (age: number | null, gender: Gender | null) =>
  [age !== null ? `${age} ${age === 1 ? "year" : "years"}` : null, gender ? humanize(gender) : null].filter(Boolean).join(", ");


function AppointmentPanel({ appointmentId, onClose }: { appointmentId: number | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [cancelling, setCancelling] = useState(false);

  const { data: appointment, isPending, isError, refetch } = useQuery({
    queryKey: ["appointment", appointmentId],
    queryFn: () => api<AppointmentDetail>(`/admin/appointments/${appointmentId}`),
    enabled: appointmentId !== null,
  });

  const close = () => {
    setCancelling(false);
    onClose();
  };

  const cancel = useMutation({
    mutationFn: (reason: string) =>
      api<{ refundDue: boolean; refundAmount: number }>(`/admin/appointments/${appointmentId}/cancel`, { method: "POST", body: { reason } }),
    onSuccess: (result) => {
      if (result.refundDue) {
        toast.warning(`Appointment cancelled. The patient paid ${formatMoneyExact(result.refundAmount)}. It is not refunded automatically, so send the refund yourself.`, { duration: 12000 });
      } else {
        toast.success("Appointment cancelled");
      }
      setCancelling(false);
      queryClient.invalidateQueries({ queryKey: ["appointment", appointmentId] });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: (err) => toast.error(err.message),
  });

  const canCancel = appointment?.status === "PENDING_PAYMENT" || appointment?.status === "CONFIRMED";

  return (
    <DetailSheet
      open={appointmentId !== null}
      onClose={close}
      title={appointment ? <Mono upper className="text-lg">{appointment.appointmentNumber}</Mono> : "Appointment"}
      description={appointment ? `${formatDateTime(appointment.scheduledAt)} · ${MODE_LABEL[appointment.mode]} · ${appointment.durationMinutes} minutes` : undefined}
      status={appointment ? { status: appointment.status, kind: "appointment", label: STATUS_LABEL[appointment.status] } : undefined}
      loading={isPending}
      failed={isError}
      onRetry={() => refetch()}
      actions={appointment && canCancel ? <Button variant="destructive" size="sm" onClick={() => setCancelling(true)}>Cancel appointment…</Button> : undefined}
    >
      {appointment ? (
            <div className="grid gap-6 text-sm">
              {appointment.status === "CANCELLED" ? (
                <Callout tone="danger" title={`Cancelled by ${CANCELLED_BY[appointment.cancelledBy ?? ""] ?? "someone"}`}>
                  {appointment.cancelReason ? <p>{appointment.cancelReason}</p> : null}
                  {appointment.refundDueAmount > 0 ? (
                    <p className="mt-1">
                      The patient paid {formatMoneyExact(appointment.refundDueAmount)} for this appointment. Refunds are not sent from this panel:
                      return the money to the patient yourself.
                    </p>
                  ) : null}
                </Callout>
              ) : null}

              <DetailList
                columns={2}
                items={[
                  { label: "Patient", value: <>{appointment.patientName}<span className="block font-normal text-muted-foreground">{ageAndGender(appointment.patientAge, appointment.patientGender)}</span><span className="block font-normal text-muted-foreground">{appointment.patientPhone ?? appointment.bookedBy.phone}</span>{appointment.bookedBy.name && appointment.bookedBy.name !== appointment.patientName ? <span className="block text-xs font-normal text-muted-foreground">Booked by {appointment.bookedBy.name}</span> : null}</> },
                  { label: "Doctor", value: <><Link href={`/admin/doctors/${appointment.doctor.id}`} className="underline-offset-4 hover:underline">{appointment.doctor.name}</Link><span className="block font-normal text-muted-foreground">{[appointment.doctor.qualification, appointment.doctor.specialization].filter(Boolean).join(" · ")}</span><span className="block font-normal text-muted-foreground">{appointment.doctor.phone}</span></> },
                  { label: "What the patient described", value: <span className="font-normal whitespace-pre-wrap">{appointment.symptoms ?? <span className="text-muted-foreground">Nothing was written.</span>}</span>, span: 2 },
                  { label: "Doctor\u2019s notes", value: <span className="font-normal whitespace-pre-wrap">{appointment.doctorNotes ?? <span className="text-muted-foreground">The doctor has not written any notes.</span>}</span>, span: 2 },
                ]}
              />

              {appointment.files.length ? (
                <section>
                  <SectionLabel className="mb-2">Reports and photos from the patient</SectionLabel>
                  <FileChips files={appointment.files} hrefOf={(file) => `/api/admin/appointments/files/${file.id}`} />
                  <p className="mt-1.5 text-xs text-muted-foreground">Medical files. Opening one is noted in the audit log.</p>
                </section>
              ) : null}

              <SectionCard tone="muted" bodyClassName="px-4 py-3">
                <DetailList
                  items={[
                    { label: "Consultation fee", value: <Money value={appointment.fee} exact animate={false} /> },
                    ...(appointment.doctorEarning > 0 ? [
                      { label: "Doctor\u2019s share", value: <Money value={appointment.doctorEarning} exact animate={false} /> },
                      { label: "Clinic\u2019s share", value: <Money value={appointment.fee - appointment.doctorEarning} exact animate={false} /> },
                    ] : []),
                  ]}
                />
                {appointment.status === "COMPLETED" && appointment.doctorEarning > 0 ? (
                  <p className="mt-2 border-t border-foreground/18 pt-2 text-muted-foreground">
                    {appointment.payout?.status === "PAID" && appointment.payout.paidAt
                      ? `The doctor's share was paid on ${formatDateTime(appointment.payout.paidAt)}${appointment.payout.reference ? ` (reference ${appointment.payout.reference})` : ""}.`
                      : appointment.payout
                        ? "The doctor's share is on a payout that is waiting to be paid."
                        : "The doctor's share has not been paid out yet."}{" "}
                    <Link href="/admin/payouts" className="text-foreground underline underline-offset-4">Doctor payouts</Link>
                  </p>
                ) : null}
              </SectionCard>

              <section>
                <SectionLabel className="mb-2">Payments from the patient</SectionLabel>
                {appointment.payments.length === 0 ? (
                  <p className="text-muted-foreground">The patient has not paid for this appointment.</p>
                ) : (
                  <ul className="grid gap-2">
                    {appointment.payments.map((payment) => (
                      <li key={payment.id} className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p>{[humanize(payment.provider), payment.method && payment.method !== payment.provider ? humanize(payment.method) : null].filter(Boolean).join(" · ")}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {formatDateTime(payment.paidAt ?? payment.createdAt)}{payment.providerRef ? ` · ${payment.providerRef}` : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="ledger font-medium">{formatMoneyExact(payment.amount)}</span>
                          <StatusPill status={payment.status} kind="payment" />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="grid gap-3 border-t border-foreground/18 pt-5">
                <SectionLabel action={appointment.prescription ? (
                  <Link href={`/admin/prescriptions?q=${appointment.prescription.prescriptionNumber}`} className="text-sm underline underline-offset-4"><Mono upper>{appointment.prescription.prescriptionNumber}</Mono></Link>
                ) : undefined}>Prescription</SectionLabel>
                {appointment.prescription ? (
                  <>
                    {appointment.prescription.issuedAt ? (
                      <p className="-mt-2 text-muted-foreground">Given to the patient on {formatDateTime(appointment.prescription.issuedAt)}</p>
                    ) : null}
                    <PrescriptionBody
                      diagnosis={appointment.prescription.diagnosis} advice={appointment.prescription.advice}
                      followUpDate={appointment.prescription.followUpDate} items={appointment.prescription.items}
                    />
                    {appointment.prescription.orders.length ? (
                      <p className="text-muted-foreground">
                        Medicines ordered from it:{" "}
                        {appointment.prescription.orders.map((order, index) => (
                          <span key={order.id}>
                            {index > 0 ? ", " : ""}
                            <Link href={`/admin/orders?q=${order.orderNumber}`} className="text-foreground underline underline-offset-4">{order.orderNumber}</Link>
                          </span>
                        ))}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-muted-foreground">
                    {appointment.prescriptionInDraft
                      ? "The doctor has started writing a prescription but has not given it to the patient yet."
                      : "No prescription has been written for this appointment. It appears here once the doctor gives one to the patient."}
                  </p>
                )}
              </section>

              <ReasonDialog
                open={cancelling}
                onOpenChange={setCancelling}
                title="Cancel this appointment?"
                description={`The slot becomes free for other patients.${appointment.status === "CONFIRMED" ? ` The patient has paid ${formatMoneyExact(appointment.fee)}. Cancelling does not refund it: you will need to send the refund yourself.` : " The patient has not paid yet, so there is nothing to refund."}`}
                tone="destructive"
                confirmLabel="Cancel appointment"
                cancelLabel="Keep appointment"
                placeholder="Reason for cancelling"
                minLength={4}
                pending={cancel.isPending}
                onConfirm={(reason) => cancel.mutate(reason)}
              />
            </div>
      ) : null}
    </DetailSheet>
  );
}

function AppointmentsView() {
  const url = useUrlState();
  const tz = useTimeZone();
  const [openId, setOpenId] = useState<number | null>(null);

  const filters = {
    tz, q: url.get("q"), status: url.get("status"), doctorId: url.get("doctorId"), mode: url.get("mode"),
    from: url.get("from"), to: url.get("to"), page: url.get("page") || "1", pageSize: url.get("pageSize") || "20",
  };
  const { data, isPending, isError, isPlaceholderData, refetch } = useQuery({
    queryKey: ["appointments", filters],
    queryFn: () => api<AppointmentList>("/admin/appointments", { query: filters }),
    placeholderData: (previous) => previous,
  });
  const { data: doctorData } = useQuery({
    queryKey: ["appointment-doctors"],
    queryFn: () => api<{ items: { id: number; name: string }[] }>("/admin/appointments/doctors"),
  });
  const doctorOptions = (doctorData?.items ?? []).map((doctor) => ({ value: String(doctor.id), label: doctor.name }));
  const selection = useSelection((data?.items ?? []).map((appointment) => appointment.id));

  const counts = data?.statusCounts ?? {};
  const allCount = Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0);
  const chips = [
    { value: "all", label: "All", count: allCount },
    ...STATUSES.filter((s) => counts[s] || filters.status === s).map((s) => ({ value: s as string, label: STATUS_LABEL[s], count: counts[s] ?? 0 })),
  ];

  return (
    <>
      <PageHero eyebrow={`Care · Appointments${allCount ? ` · ${formatNumber(allCount)}` : ""}`} title="Appointments" description="Every consultation patients have booked with your doctors.">
        <FilterChips ariaLabel="Appointment status" value={filters.status || "all"} onChange={(v) => url.set({ status: v === "all" ? "" : v })} options={chips} />
      </PageHero>

      <SectionCard flush>
        <DataTableToolbar
          search={<SearchField value={filters.q} onChange={(q) => url.set({ q })} placeholder="Appointment number, patient name or phone" />}
          hasFilters={url.hasAny}
          onClear={url.clear}
          actions={<BulkActions table="appointments" noun="appointments" selection={selection} filters={filters} refresh={["appointments", "dashboard"]} deleteNote="Only cancelled appointments that were never paid for are removed. Consultations that took place, or were paid for, are kept." />}
          filters={<>
          <Combobox value={filters.doctorId} onChange={(doctorId) => url.set({ doctorId })} options={doctorOptions} allLabel="All doctors" searchPlaceholder="Search doctors…" />
          <Select value={filters.mode || "all"} onValueChange={(v) => url.set({ mode: v === "all" ? "" : v })}>
            <SelectTrigger className="h-9 w-40" aria-label="Consultation type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {(Object.keys(MODE_LABEL) as ConsultationMode[]).map((mode) => <SelectItem key={mode} value={mode}>{MODE_LABEL[mode]}</SelectItem>)}
            </SelectContent>
          </Select>
          <DateRangePicker
            align="start"
            placeholder="Any appointment date"
            value={filters.from && filters.to ? { from: filters.from, to: filters.to } : null}
            onChange={(range) => url.set({ from: range?.from, to: range?.to })}
          />
          </>}
        />

        <DataTable
          isPending={isPending || !data}
          isError={isError}
          isEmpty={data?.items.length === 0}
          isStale={isPlaceholderData}
          onRetry={() => refetch()}
          skeletonCols={7}
          empty={{
            illustration: "calendar",
            title: url.hasAny ? "No appointments match" : "No appointments yet",
            description: url.hasAny ? "Try a different search, or clear the filters to see every appointment." : "When a patient books a consultation with one of your doctors, it appears here with its date, fee and status.",
            action: url.hasAny ? <Button variant="outline" onClick={url.clear}>Clear filters</Button> : undefined,
          }}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <ColHead className="w-10 pl-4"><SelectPage selection={selection} noun="appointments" /></ColHead>
                <ColHead>Appointment</ColHead>
                <ColHead>Patient</ColHead>
                <ColHead>Doctor</ColHead>
                <ColHead>Type</ColHead>
                <ColHead>Status</ColHead>
                <ColHead align="right">Fee</ColHead>
                <ColHead align="right" className="pr-4">Doctor&apos;s share</ColHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.items.map((appointment) => (
                <DataTableRow key={appointment.id} selected={selection.has(appointment.id)} onOpen={() => setOpenId(appointment.id)} className="h-14!">
                  <TableCell className="pl-4"><SelectRow selection={selection} id={appointment.id} label={appointment.appointmentNumber} /></TableCell>
                  <TableCell>
                    <div className="font-medium">{formatDateTime(appointment.scheduledAt)}</div>
                    <div className="text-xs text-muted-foreground"><Mono upper>{appointment.appointmentNumber}</Mono></div>
                  </TableCell>
                  <TableCell>
                    <div className="max-w-48 truncate">{appointment.patientName}</div>
                    <div className="text-xs text-muted-foreground">
                      {[ageAndGender(appointment.patientAge, appointment.patientGender), appointment.patientPhone].filter(Boolean).join(" · ")}
                    </div>
                  </TableCell>
                  <TableCell><div className="max-w-44 truncate">{appointment.doctorName}</div></TableCell>
                  <TableCell>{MODE_LABEL[appointment.mode]}</TableCell>
                  <TableCell>
                    <StatusPill status={appointment.status} kind="appointment" label={STATUS_LABEL[appointment.status]} />
                    {appointment.hasPrescription ? <div className="mt-0.5 text-xs text-muted-foreground">Prescription given</div> : null}
                  </TableCell>
                  <TableCell className="ledger text-right">{formatMoneyExact(appointment.fee)}</TableCell>
                  <TableCell className="ledger pr-4 text-right font-medium">
                    {appointment.doctorEarning > 0 ? formatMoneyExact(appointment.doctorEarning) : <span className="font-normal text-muted-foreground">—</span>}
                  </TableCell>
                </DataTableRow>
              ))}
            </TableBody>
          </Table>
        </DataTable>

        {data ? (
          <PaginationBar
            page={data.page} pageCount={data.pageCount} pageSize={data.pageSize} total={data.total} noun="appointments"
            onPage={(page) => url.set({ page })} onPageSize={(pageSize) => url.set({ pageSize })}
          />
        ) : null}
      </SectionCard>

      <AppointmentPanel appointmentId={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

export default function AppointmentsPage() {
  return (
    <Suspense>
      <AppointmentsView />
    </Suspense>
  );
}
