"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Star, Trash2, X } from "lucide-react";
import Link from "next/link";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { BulkActions, SelectPage, SelectRow, useSelection } from "@/components/admin/bulk";
import { Combobox } from "@/components/admin/combobox";
import { EmptyState, PageHeader, PaginationBar, SearchInput, StatusBadge, Thumb } from "@/components/admin/parts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useUrlState } from "@/hooks/use-url-state";
import { api } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/format";
import type { Paged } from "@/lib/types";
import { cn } from "@/lib/utils";
import { FilterChips } from "@/components/custom/filter-chips";
import { SectionCard } from "@/components/custom/section-card";
import { ButtonSpinner } from "@/components/custom/loaders";

type ReviewStatus = "PENDING" | "APPROVED" | "REJECTED";

type ReviewRow = {
  id: number; rating: number; comment: string | null; status: ReviewStatus; createdAt: string;
  doctorId: number; doctorName: string; doctorPhotoUrl: string | null;
  patientName: string | null; patientPhone: string | null;
  appointmentId: number; appointmentNumber: string; consultedAt: string;
};
type ReviewList = Paged<ReviewRow> & {
  statusCounts: Partial<Record<ReviewStatus, number>>;
  doctors: { id: number; name: string }[];
};

const STATUSES: ReviewStatus[] = ["PENDING", "APPROVED", "REJECTED"];
const STATUS: Record<ReviewStatus, { label: string; done: string }> = {
  PENDING: { label: "Waiting for a decision", done: "moved back to waiting" },
  APPROVED: { label: "Shown to patients", done: "approved" },
  REJECTED: { label: "Hidden", done: "rejected and hidden" },
};

const starWord = (rating: number) => `${rating} ${rating === 1 ? "star" : "stars"}`;

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className={cn("size-3.5", i < rating ? "fill-warning text-warning" : "text-muted-foreground/40")} />
      ))}
    </span>
  );
}

function ReviewsView() {
  const url = useUrlState();
  const queryClient = useQueryClient();
  const [reading, setReading] = useState<ReviewRow | null>(null);
  const [deleting, setDeleting] = useState<ReviewRow | null>(null);

  const filters = {
    q: url.get("q"), status: url.get("status"), rating: url.get("rating"), doctorId: url.get("doctorId"),
    page: url.get("page") || "1", pageSize: url.get("pageSize") || "20",
  };
  const { data, isPending, isError } = useQuery({
    queryKey: ["doctor-reviews", filters],
    queryFn: () => api<ReviewList>("/admin/doctor-reviews", { query: filters }),
    placeholderData: (previous) => previous,
  });
  const selection = useSelection((data?.items ?? []).map((review) => review.id));
  // a doctor's stars change with every decision
  const refresh = () => ["doctor-reviews", "doctor", "doctor-onboarding", "doctors"].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));

  const decide = useMutation({
    mutationFn: (input: { review: ReviewRow; status: ReviewStatus }) => api(`/admin/doctor-reviews/${input.review.id}`, { method: "PATCH", body: { status: input.status } }),
    onSuccess: (_r, input) => {
      toast.success(`Review of ${input.review.doctorName} ${STATUS[input.status].done}`);
      setReading(null);
      refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: (review: ReviewRow) => api(`/admin/doctor-reviews/${review.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Review deleted");
      setDeleting(null);
      refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  const counts = data?.statusCounts ?? {};
  const tabs = [
    { value: "", label: "All", count: Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0) },
    ...STATUSES.filter((s) => s !== "PENDING" || counts[s] || filters.status === s).map((s) => ({ value: s as string, label: STATUS[s].label, count: counts[s] ?? 0 })),
  ];
  const doctorOptions = (data?.doctors ?? []).map((doctor) => ({ value: String(doctor.id), label: doctor.name }));

  const actions = (review: ReviewRow) => {
    const busy = decide.isPending && decide.variables?.review.id === review.id;
    return (
      <>
        {review.status !== "APPROVED" ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => decide.mutate({ review, status: "APPROVED" })}><Check /> Approve</Button>
        ) : null}
        {review.status !== "REJECTED" ? (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => decide.mutate({ review, status: "REJECTED" })}><X /> Reject</Button>
        ) : null}
      </>
    );
  };

  return (
    <>
      <PageHeader title="Doctor reviews" description="What patients said after a consultation. Approved reviews show on the doctor's page and count towards their stars." />

      <FilterChips ariaLabel="Status" className="mb-3" value={filters.status || "all"} onChange={(v) => url.set({ status: v === "all" ? "" : v })} options={tabs.map((tab) => ({ value: tab.value || "all", label: tab.label, count: tab.count }))} />

      <SectionCard flush>
        <div className="flex flex-wrap items-center gap-2 border-b border-foreground/18 bg-surface-2 px-3 py-2">
          <SearchInput value={filters.q} onChange={(q) => url.set({ q })} placeholder="Doctor, patient or words in the review" className="w-full sm:w-72" />
          <Combobox value={filters.doctorId} onChange={(doctorId) => url.set({ doctorId })} options={doctorOptions} allLabel="All doctors" searchPlaceholder="Search doctors…" className="w-52" />
          <Select value={filters.rating || "all"} onValueChange={(v) => url.set({ rating: v === "all" ? "" : v })}>
            <SelectTrigger className="h-9 w-36" aria-label="Stars"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any stars</SelectItem>
              {[5, 4, 3, 2, 1].map((rating) => <SelectItem key={rating} value={String(rating)}>{starWord(rating)}</SelectItem>)}
            </SelectContent>
          </Select>
          {url.hasAny ? <Button variant="ghost" className="h-9" onClick={url.clear}>Clear filters</Button> : null}
          <BulkActions table="doctor-reviews" noun="reviews" selection={selection} exportable={false} refresh={["doctor-reviews", "doctor", "doctor-onboarding", "doctors"]} deleteNote="Each doctor's stars are worked out again from the reviews that are left." />
        </div>

        {isError ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Could not load reviews. Check that the backend is running.</p>
        ) : isPending || !data ? (
          <div className="grid gap-2 p-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : data.items.length === 0 ? (
          <EmptyState
            icon={Star}
            title={url.hasAny ? "No reviews match" : "No reviews yet"}
            description={url.hasAny ? "Try a different search, or clear the filters." : "When a patient rates a finished consultation, the review appears here."}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 pl-4"><SelectPage selection={selection} noun="reviews" /></TableHead>
                <TableHead>Doctor</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Stars</TableHead>
                <TableHead>What they said</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-4"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((review) => (
                <TableRow key={review.id} data-state={selection.has(review.id) ? "selected" : undefined}>
                  <TableCell className="pl-4"><SelectRow selection={selection} id={review.id} label={`the review of ${review.doctorName}`} /></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Thumb src={review.doctorPhotoUrl} name={review.doctorName.replace(/^dr\.?\s*/i, "")} className="rounded-full" />
                      <Link href={`/admin/doctors/${review.doctorId}`} className="max-w-44 truncate font-medium hover:underline">{review.doctorName}</Link>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="max-w-40 truncate">{review.patientName ?? "Name not given"}</div>
                    <div className="text-xs text-muted-foreground">{review.patientPhone ?? review.appointmentNumber}</div>
                  </TableCell>
                  <TableCell><Stars rating={review.rating} /></TableCell>
                  <TableCell className="max-w-80 whitespace-normal">
                    {review.comment ? (
                      <button type="button" className="line-clamp-2 text-left break-words hover:underline" title="Read the full review" onClick={() => setReading(review)}>{review.comment}</button>
                    ) : (
                      <span className="text-muted-foreground">Stars only, nothing written</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground" title={formatDateTime(review.createdAt)}>{formatDate(review.createdAt)}</TableCell>
                  <TableCell><StatusBadge status={review.status} label={STATUS[review.status].label} /></TableCell>
                  <TableCell className="pr-4">
                    <div className="flex items-center justify-end gap-1">
                      {actions(review)}
                      <Button variant="ghost" size="icon-sm" aria-label={`Delete the review of ${review.doctorName} by ${review.patientName ?? "a patient"}`} onClick={() => setDeleting(review)}><Trash2 /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {data ? (
          <PaginationBar
            page={data.page} pageCount={data.pageCount} pageSize={data.pageSize} total={data.total} noun="reviews"
            onPage={(page) => url.set({ page })} onPageSize={(pageSize) => url.set({ pageSize })}
          />
        ) : null}
      </SectionCard>

      {/* the whole review, for comments too long for the table */}
      <Dialog open={reading !== null} onOpenChange={(open) => !open && setReading(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="pr-8 leading-snug">Review of {reading?.doctorName}</DialogTitle>
            <DialogDescription>
              {reading ? `By ${reading.patientName ?? "a patient"} on ${formatDateTime(reading.createdAt)}, after consultation ${reading.appointmentNumber} on ${formatDate(reading.consultedAt)}.` : null}
            </DialogDescription>
          </DialogHeader>
          {reading ? (
            <div className="grid gap-3 text-sm">
              <div className="flex flex-wrap items-center gap-2"><Stars rating={reading.rating} /> <span className="text-muted-foreground">{starWord(reading.rating)}</span> <StatusBadge status={reading.status} label={STATUS[reading.status].label} /></div>
              <p className="max-h-[50dvh] overflow-y-auto rounded-lg bg-surface-2 p-3 break-words whitespace-pre-line">{reading.comment}</p>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReading(null)}>Close</Button>
            {reading ? actions(reading) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="pr-8 leading-snug">Delete this review of {deleting?.doctorName}?</DialogTitle>
            <DialogDescription>
              {deleting ? `${starWord(deleting.rating)} from ${deleting.patientName ?? "a patient"}. ` : null}
              The doctor&apos;s stars are worked out again without it. This cannot be undone; to keep the review but stop showing it, reject it instead.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="destructive" disabled={!deleting || remove.isPending} onClick={() => deleting && remove.mutate(deleting)}>
              {remove.isPending ? <ButtonSpinner /> : null}Delete review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function DoctorReviewsPage() {
  return (
    <Suspense>
      <ReviewsView />
    </Suspense>
  );
}
