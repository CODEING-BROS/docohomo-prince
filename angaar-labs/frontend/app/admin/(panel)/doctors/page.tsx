"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, Plus } from "lucide-react";
import Link from "next/link";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { BulkActions, SelectPage, SelectRow, useSelection } from "@/components/admin/bulk";
import { GradientAvatar } from "@/components/custom/avatar";
import { ColHead, DataTable, DataTableRow, DataTableToolbar, PaginationBar } from "@/components/custom/data-table";
import { ReasonDialog } from "@/components/custom/dialogs";
import { FilterChips } from "@/components/custom/filter-chips";
import { SearchField } from "@/components/custom/form-field";
import { Spinner } from "@/components/custom/loaders";
import { PageHero } from "@/components/custom/page-hero";
import { SectionCard } from "@/components/custom/section-card";
import { StatusPill } from "@/components/custom/status-pill";
import { Mono } from "@/components/custom/typography";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { useUrlState } from "@/hooks/use-url-state";
import { api } from "@/lib/api";
import { formatMoney, formatNumber, humanize } from "@/lib/format";
import type { DoctorRow, Paged, VerificationStatus } from "@/lib/types";

type Decision = "APPROVED" | "REJECTED" | "SUSPENDED" | "UNDER_REVIEW";
type DoctorList = Paged<DoctorRow> & { statusCounts: Partial<Record<VerificationStatus, number>> };

const STATUSES: VerificationStatus[] = ["PENDING", "UNDER_REVIEW", "APPROVED", "REJECTED", "SUSPENDED", "DRAFT"];
const DONE_LABEL: Record<Decision, string> = {
  APPROVED: "approved", REJECTED: "rejected", SUSPENDED: "suspended", UNDER_REVIEW: "marked as under review",
};

function DoctorsView() {
  const url = useUrlState();
  const queryClient = useQueryClient();
  // rejecting or suspending asks for a reason first
  const [asking, setAsking] = useState<{ doctor: DoctorRow; decision: "REJECTED" | "SUSPENDED" } | null>(null);

  const filters = { q: url.get("q"), status: url.get("status"), page: url.get("page") || "1", pageSize: url.get("pageSize") || "20" };
  const { data, isPending, isError, isPlaceholderData, refetch } = useQuery({
    queryKey: ["doctors", filters],
    queryFn: () => api<DoctorList>("/admin/doctors", { query: filters }),
    placeholderData: (previous) => previous,
  });

  const review = useMutation({
    mutationFn: (input: { doctor: DoctorRow; decision: Decision; reason?: string }) =>
      api(`/admin/doctors/${input.doctor.id}/verification`, { method: "PATCH", body: { decision: input.decision, reason: input.reason } }),
    onSuccess: (_result, input) => {
      toast.success(`${input.doctor.displayName} ${DONE_LABEL[input.decision]}`);
      setAsking(null);
      queryClient.invalidateQueries({ queryKey: ["doctors"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err) => toast.error(err.message),
  });

  const selection = useSelection((data?.items ?? []).map((doctor) => doctor.id));

  const counts = data?.statusCounts ?? {};
  const total = Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0);
  const chips = [
    { value: "all", label: "All", count: total },
    ...STATUSES.filter((s) => counts[s] || filters.status === s).map((s) => ({ value: s as string, label: humanize(s), count: counts[s] ?? 0, tone: s === "PENDING" || s === "UNDER_REVIEW" ? ("warning" as const) : undefined })),
  ];

  return (
    <>
      <PageHero
        eyebrow={`Care · Doctors${total ? ` · ${formatNumber(total)}` : ""}`}
        title="Doctors"
        description="One account per doctor. Verify their registration, then switch on consultations, wholesale buying, or both."
        actions={<Button asChild size="lg"><Link href="/admin/doctors/new"><Plus data-icon="inline-start" /> Add doctor</Link></Button>}
      >
        <FilterChips ariaLabel="Verification status" value={filters.status || "all"} onChange={(v) => url.set({ status: v === "all" ? "" : v })} options={chips} />
      </PageHero>

      <SectionCard flush>
        <DataTableToolbar
          search={<SearchField value={filters.q} onChange={(q) => url.set({ q })} placeholder="Name, specialization or registration number" />}
          hasFilters={url.hasAny}
          onClear={url.clear}
          actions={<BulkActions table="doctors" noun="doctors" refresh={["doctors", "dashboard"]} deleteNote="Doctors who have seen patients are kept; suspend those instead." selection={selection} filters={filters} />}
        />

        <DataTable
          isPending={isPending || !data}
          isError={isError}
          isEmpty={data?.items.length === 0}
          isStale={isPlaceholderData}
          onRetry={() => refetch()}
          skeletonCols={6}
          empty={{ illustration: "doctors", title: "No doctors match", description: "Try a different search, or clear the filters.", action: url.hasAny ? <Button variant="outline" onClick={url.clear}>Clear filters</Button> : undefined }}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <ColHead className="w-10 pl-4"><SelectPage selection={selection} noun="doctors" /></ColHead>
                <ColHead>Doctor</ColHead>
                <ColHead>Experience</ColHead>
                <ColHead>Can</ColHead>
                <ColHead>Registration</ColHead>
                <ColHead align="right">Video fee</ColHead>
                <ColHead>Verification</ColHead>
                <ColHead className="w-10 pr-4"><span className="sr-only">Actions</span></ColHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.items.map((doctor) => (
                <DataTableRow key={doctor.id} selected={selection.has(doctor.id)} href={`/admin/doctors/${doctor.id}`} className="h-14!">
                  <TableCell className="pl-4"><SelectRow selection={selection} id={doctor.id} label={doctor.displayName} /></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <GradientAvatar name={doctor.displayName} src={doctor.photoUrl} size="md" ring={doctor.verificationStatus === "APPROVED" ? "terracotta" : null} />
                      <div className="min-w-0">
                        <div className="max-w-56 truncate font-medium">{doctor.displayName}</div>
                        <div className="max-w-56 truncate text-xs text-muted-foreground">{[doctor.qualification, doctor.specialization].filter(Boolean).join(" · ") || "—"}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="ledger">{doctor.experienceYears !== null ? `${doctor.experienceYears} yrs` : "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {doctor.acceptsConsultations ? <StatusPill status="CONFIRMED" label="Consult" dot={false} /> : null}
                      {doctor.wholesaleStatus === "APPROVED" ? <StatusPill status="B2B" label="Wholesale" dot={false} /> : null}
                      {!doctor.acceptsConsultations && doctor.wholesaleStatus !== "APPROVED" ? <span className="text-muted-foreground">—</span> : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>{doctor.registrationNumber ? <Mono>{doctor.registrationNumber}</Mono> : <span className="text-muted-foreground">Not provided</span>}</div>
                    <div className="text-xs text-muted-foreground">{doctor.documentCount} {doctor.documentCount === 1 ? "document" : "documents"}</div>
                  </TableCell>
                  <TableCell className="ledger text-right">{doctor.videoFee !== null ? formatMoney(doctor.videoFee) : "—"}</TableCell>
                  <TableCell><StatusPill status={doctor.verificationStatus} kind="doctor" /></TableCell>
                  <TableCell className="pr-4">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${doctor.displayName}`}>
                          {review.isPending && review.variables?.doctor.id === doctor.id ? <Spinner size="xs" /> : <MoreHorizontal />}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-44">
                        <DropdownMenuItem asChild><Link href={`/admin/doctors/${doctor.id}`}>Open</Link></DropdownMenuItem>
                        {doctor.verificationStatus !== "APPROVED" ? (
                          <DropdownMenuItem onSelect={() => review.mutate({ doctor, decision: "APPROVED" })}>Approve</DropdownMenuItem>
                        ) : null}
                        {doctor.verificationStatus !== "UNDER_REVIEW" && doctor.verificationStatus !== "APPROVED" ? (
                          <DropdownMenuItem onSelect={() => review.mutate({ doctor, decision: "UNDER_REVIEW" })}>Mark as under review</DropdownMenuItem>
                        ) : null}
                        <DropdownMenuSeparator />
                        {doctor.verificationStatus === "APPROVED" ? (
                          <DropdownMenuItem variant="destructive" onSelect={() => setAsking({ doctor, decision: "SUSPENDED" })}>Suspend…</DropdownMenuItem>
                        ) : doctor.verificationStatus !== "REJECTED" ? (
                          <DropdownMenuItem variant="destructive" onSelect={() => setAsking({ doctor, decision: "REJECTED" })}>Reject…</DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </DataTableRow>
              ))}
            </TableBody>
          </Table>
        </DataTable>

        {data ? (
          <PaginationBar
            page={data.page} pageCount={data.pageCount} pageSize={data.pageSize} total={data.total} noun="doctors"
            onPage={(page) => url.set({ page })} onPageSize={(pageSize) => url.set({ pageSize })}
          />
        ) : null}
      </SectionCard>

      <ReasonDialog
        open={asking !== null}
        onOpenChange={(open) => { if (!open) setAsking(null); }}
        title={`${asking?.decision === "SUSPENDED" ? "Suspend" : "Reject"} ${asking?.doctor.displayName ?? ""}?`}
        description={asking?.decision === "SUSPENDED" ? "They will stop appearing for consultations until approved again." : "The doctor is told why, so they can fix it and apply again."}
        tone="destructive"
        confirmLabel={asking?.decision === "SUSPENDED" ? "Suspend" : "Reject"}
        placeholder="Reason"
        minLength={4}
        pending={review.isPending}
        onConfirm={(reason) => asking && review.mutate({ doctor: asking.doctor, decision: asking.decision, reason })}
      />
    </>
  );
}

export default function DoctorsPage() {
  return (
    <Suspense>
      <DoctorsView />
    </Suspense>
  );
}
