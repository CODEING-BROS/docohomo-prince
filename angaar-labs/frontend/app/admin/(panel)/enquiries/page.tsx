"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, MessageSquare, MoreHorizontal, Phone } from "lucide-react";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { BulkActions, SelectPage, SelectRow, useSelection } from "@/components/admin/bulk";
import { EmptyState, PageHeader, PaginationBar, SearchInput, StatusBadge } from "@/components/admin/parts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useUrlState } from "@/hooks/use-url-state";
import { api } from "@/lib/api";
import { formatDate, formatDateTime, humanize } from "@/lib/format";
import type { Paged } from "@/lib/types";
import { cn } from "@/lib/utils";
import { FilterChips } from "@/components/custom/filter-chips";
import { SectionCard } from "@/components/custom/section-card";
import { DataTableRow } from "@/components/custom/data-table";
import { Spinner } from "@/components/custom/loaders";

type EnquiryType = "CONTACT" | "WHOLESALE" | "DOCTOR_CONSULTATION" | "ORDER";
type EnquiryStatus = "NEW" | "IN_PROGRESS" | "CLOSED";

/** A message sent from one of the website forms. `details` holds whatever extra fields that form had. */
type Enquiry = {
  id: number; type: EnquiryType; name: string | null; phone: string | null; email: string | null;
  message: string | null; details: unknown; status: EnquiryStatus; createdAt: string; updatedAt: string;
};
type EnquiryList = Paged<Enquiry> & { statusCounts: Partial<Record<EnquiryStatus, number>> };

const STATUSES: EnquiryStatus[] = ["NEW", "IN_PROGRESS", "CLOSED"];
const STATUS: Record<EnquiryStatus, { label: string; tone: string; action: string }> = {
  NEW: { label: "New", tone: "PENDING", action: "Mark as new" },
  IN_PROGRESS: { label: "In progress", tone: "CONFIRMED", action: "Mark as in progress" },
  CLOSED: { label: "Closed", tone: "ARCHIVED", action: "Mark as closed" },
};

const TYPES: EnquiryType[] = ["CONTACT", "WHOLESALE", "DOCTOR_CONSULTATION", "ORDER"];
const TYPE_LABEL: Record<EnquiryType, string> = {
  CONTACT: "Contact form", WHOLESALE: "Wholesale", DOCTOR_CONSULTATION: "Doctor consultation", ORDER: "About an order",
};

// readable names for the extra fields the forms send
const DETAIL_LABEL: Record<string, string> = {
  productName: "Product", productCode: "Product code", quantity: "Quantity", country: "Country",
  doctorName: "Doctor", doctorCode: "Doctor code", consultationType: "Consultation type",
  orderRef: "Order reference", userRef: "Customer reference",
  city: "City", state: "State", pincode: "Pincode", address: "Address", company: "Business name", businessName: "Business name",
  subject: "Subject", preferredDate: "Preferred date", preferredTime: "Preferred time", age: "Age", gender: "Gender",
};
// short answers picked from a list read better with a capital letter
const HUMANIZED = new Set(["consultationType", "gender"]);

/** "preferredSlot" -> "Preferred slot", for fields that have no label above. */
const labelFor = (key: string) => DETAIL_LABEL[key] ?? humanize(key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[-_]+/g, " "));

const detailLines = (details: unknown): { label: string; value: string }[] => {
  if (details === null || details === undefined || details === "") return [];
  if (typeof details !== "object" || Array.isArray(details)) {
    return [{ label: "Details", value: typeof details === "string" ? details : JSON.stringify(details) }];
  }
  return Object.entries(details)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => {
      const text = typeof value === "object" ? JSON.stringify(value) : String(value).trim();
      return { label: labelFor(key), value: HUMANIZED.has(key) ? humanize(text) : text };
    });
};

/** One place for the status change, used by the row menu and the side panel. */
function useStatusChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { enquiry: Enquiry; status: EnquiryStatus }) =>
      api<Enquiry>(`/admin/enquiries/${input.enquiry.id}`, { method: "PATCH", body: { status: input.status } }),
    onSuccess: (_result, input) => {
      toast.success(`${input.enquiry.name ?? "Enquiry"} marked as ${STATUS[input.status].label.toLowerCase()}`);
      ["enquiries", "enquiry", "notifications", "dashboard"].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
    },
    onError: (err) => toast.error(err.message),
  });
}

function EnquiryPanel({ enquiryId, onClose }: { enquiryId: number | null; onClose: () => void }) {
  const update = useStatusChange();
  const { data: enquiry, isPending, isError } = useQuery({
    queryKey: ["enquiry", enquiryId],
    queryFn: () => api<Enquiry>(`/admin/enquiries/${enquiryId}`),
    enabled: enquiryId !== null,
  });
  const lines = enquiry ? detailLines(enquiry.details) : [];

  return (
    <Sheet open={enquiryId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-lg">
        {isError ? (
          <SheetHeader><SheetTitle>Enquiry</SheetTitle><SheetDescription>Could not load this enquiry. It may have been deleted.</SheetDescription></SheetHeader>
        ) : isPending || !enquiry ? (
          <>
            <SheetHeader><SheetTitle>Enquiry</SheetTitle><SheetDescription>Loading…</SheetDescription></SheetHeader>
            <div className="grid gap-3 p-4"><Skeleton className="h-20" /><Skeleton className="h-40" /></div>
          </>
        ) : (
          <>
            <SheetHeader className="border-b">
              <SheetTitle className="flex flex-wrap items-center gap-2 pr-6">
                {enquiry.name ?? "No name given"}
                <StatusBadge status={STATUS[enquiry.status].tone} label={STATUS[enquiry.status].label} />
              </SheetTitle>
              <SheetDescription>{TYPE_LABEL[enquiry.type] ?? humanize(enquiry.type)} · Received {formatDateTime(enquiry.createdAt)}</SheetDescription>
            </SheetHeader>

            <div className="grid gap-5 p-4 text-sm">
              <section>
                <h3 className="mb-2 text-[0.6875rem]/none font-semibold tracking-[0.12em] text-muted-foreground uppercase">Contact</h3>
                <div className="grid gap-1.5">
                  {enquiry.phone ? (
                    <a href={`tel:${enquiry.phone}`} className="flex w-fit items-center gap-2 text-primary hover:underline"><Phone className="size-4" /> {enquiry.phone}</a>
                  ) : null}
                  {enquiry.email ? (
                    <a href={`mailto:${enquiry.email}`} className="flex w-fit items-center gap-2 break-all text-primary hover:underline"><Mail className="size-4 shrink-0" /> {enquiry.email}</a>
                  ) : null}
                  {!enquiry.phone && !enquiry.email ? <p className="text-muted-foreground">No phone number or email was given.</p> : null}
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-[0.6875rem]/none font-semibold tracking-[0.12em] text-muted-foreground uppercase">Message</h3>
                {enquiry.message ? (
                  <p className="rounded-lg bg-surface-2 p-3 break-words whitespace-pre-line">{enquiry.message}</p>
                ) : (
                  <p className="text-muted-foreground">No message was written.</p>
                )}
              </section>

              {lines.length ? (
                <section>
                  <h3 className="mb-2 text-[0.6875rem]/none font-semibold tracking-[0.12em] text-muted-foreground uppercase">Details</h3>
                  <dl className="grid gap-2">
                    {lines.map((line) => (
                      <div key={line.label} className="grid grid-cols-[9rem_1fr] gap-3">
                        <dt className="text-muted-foreground">{line.label}</dt>
                        <dd className="break-words">{line.value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ) : null}

              <section className="grid gap-2 border-t pt-4">
                <h3 className="text-[0.6875rem]/none font-semibold tracking-[0.12em] text-muted-foreground uppercase">Status</h3>
                <div className="flex flex-wrap gap-2">
                  {STATUSES.map((status) => (
                    <Button
                      key={status}
                      variant={enquiry.status === status ? "default" : "outline"}
                      className="h-9"
                      aria-pressed={enquiry.status === status}
                      disabled={update.isPending}
                      onClick={() => enquiry.status !== status && update.mutate({ enquiry, status })}
                    >
                      {update.isPending && update.variables?.status === status ? <Spinner size="sm" /> : null}
                      {STATUS[status].label}
                    </Button>
                  ))}
                </div>
                {enquiry.updatedAt !== enquiry.createdAt ? (
                  <p className="text-xs text-muted-foreground">Last changed {formatDateTime(enquiry.updatedAt)}</p>
                ) : null}
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function EnquiriesView() {
  const url = useUrlState();
  const update = useStatusChange();
  const [openId, setOpenId] = useState<number | null>(null);

  const filters = {
    q: url.get("q"), type: url.get("type"), status: url.get("status"),
    page: url.get("page") || "1", pageSize: url.get("pageSize") || "20",
  };
  const { data, isPending, isError } = useQuery({
    queryKey: ["enquiries", filters],
    queryFn: () => api<EnquiryList>("/admin/enquiries", { query: filters }),
    placeholderData: (previous) => previous,
  });
  const selection = useSelection((data?.items ?? []).map((enquiry) => enquiry.id));

  const counts = data?.statusCounts ?? {};
  const tabs = [
    { value: "", label: "All", count: Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0) },
    ...STATUSES.map((s) => ({ value: s as string, label: STATUS[s].label, count: counts[s] ?? 0 })),
  ];

  return (
    <>
      <PageHeader title="Enquiries" description="Messages people sent from the contact, wholesale and doctor consultation forms on the store" />

      <FilterChips ariaLabel="Status" className="mb-3" value={filters.status || "all"} onChange={(v) => url.set({ status: v === "all" ? "" : v })} options={tabs.map((tab) => ({ value: tab.value || "all", label: tab.label, count: tab.count }))} />

      <SectionCard flush>
        <div className="flex flex-wrap items-center gap-2 border-b border-foreground/18 bg-surface-2 px-3 py-2">
          <SearchInput value={filters.q} onChange={(q) => url.set({ q })} placeholder="Name, phone, email or message" className="w-full sm:w-72" />
          <Select value={filters.type || "all"} onValueChange={(v) => url.set({ type: v === "all" ? "" : v })}>
            <SelectTrigger className="h-9 w-48" aria-label="Type of enquiry"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {TYPES.map((type) => <SelectItem key={type} value={type}>{TYPE_LABEL[type]}</SelectItem>)}
            </SelectContent>
          </Select>
          {url.hasAny ? <Button variant="ghost" className="h-9" onClick={url.clear}>Clear filters</Button> : null}
          <BulkActions table="enquiries" noun="enquiries" selection={selection} filters={filters} refresh={["enquiries", "notifications", "dashboard"]} />
        </div>

        {isError ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Could not load enquiries. Check that the backend is running.</p>
        ) : isPending || !data ? (
          <div className="grid gap-2 p-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : data.items.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title={url.hasAny ? "No enquiries match" : "No enquiries yet"}
            description={url.hasAny ? "Try a different search, or clear the filters." : "When someone fills in a form on the store, their message appears here."}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 pl-4"><SelectPage selection={selection} noun="enquiries" /></TableHead>
                <TableHead>From</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Received</TableHead>
                <TableHead className="w-10 pr-4"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((enquiry) => {
                const busy = update.isPending && update.variables?.enquiry.id === enquiry.id;
                const who = enquiry.name ?? enquiry.phone ?? enquiry.email ?? `enquiry ${enquiry.id}`;
                return (
                  <DataTableRow key={enquiry.id} selected={selection.has(enquiry.id)} onOpen={() => setOpenId(enquiry.id)}>
                    <TableCell className="pl-4"><SelectRow selection={selection} id={enquiry.id} label={who} /></TableCell>
                    <TableCell>
                      <div className={cn("max-w-48 truncate", enquiry.status === "NEW" ? "font-semibold" : "font-medium")}>{enquiry.name ?? "No name given"}</div>
                      <div className="max-w-48 truncate text-xs text-muted-foreground">{[enquiry.phone, enquiry.email].filter(Boolean).join(" · ") || "—"}</div>
                    </TableCell>
                    <TableCell><Badge variant="outline" className="font-normal">{TYPE_LABEL[enquiry.type] ?? humanize(enquiry.type)}</Badge></TableCell>
                    <TableCell className="max-w-80 truncate text-muted-foreground">{enquiry.message?.replace(/\s+/g, " ") || "—"}</TableCell>
                    <TableCell><StatusBadge status={STATUS[enquiry.status].tone} label={STATUS[enquiry.status].label} /></TableCell>
                    <TableCell className="text-muted-foreground" title={formatDateTime(enquiry.createdAt)}>{formatDate(enquiry.createdAt)}</TableCell>
                    <TableCell className="pr-4" onClick={(event) => event.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${who}`}>
                            {busy ? <Spinner size="sm" /> : <MoreHorizontal />}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-48">
                          <DropdownMenuItem onSelect={() => setOpenId(enquiry.id)}>Read the full message</DropdownMenuItem>
                          {STATUSES.filter((status) => status !== enquiry.status).map((status) => (
                            <DropdownMenuItem key={status} onSelect={() => update.mutate({ enquiry, status })}>{STATUS[status].action}</DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </DataTableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {data ? (
          <PaginationBar
            page={data.page} pageCount={data.pageCount} pageSize={data.pageSize} total={data.total} noun="enquiries"
            onPage={(page) => url.set({ page })} onPageSize={(pageSize) => url.set({ pageSize })}
          />
        ) : null}
      </SectionCard>

      <EnquiryPanel enquiryId={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

export default function EnquiriesPage() {
  return (
    <Suspense>
      <EnquiriesView />
    </Suspense>
  );
}
