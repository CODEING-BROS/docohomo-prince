"use client";

import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Suspense, useState } from "react";
import { AddCustomerDialog } from "@/components/admin/add-customer-dialog";
import { BulkActions, SelectPage, SelectRow, useSelection } from "@/components/admin/bulk";
import { GradientAvatar } from "@/components/custom/avatar";
import { ColHead, DataTable, DataTableToolbar, PaginationBar } from "@/components/custom/data-table";
import { SearchField } from "@/components/custom/form-field";
import { PageHero } from "@/components/custom/page-hero";
import { SectionCard } from "@/components/custom/section-card";
import { StatusPill } from "@/components/custom/status-pill";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { useUrlState } from "@/hooks/use-url-state";
import { api } from "@/lib/api";
import { formatDate, formatMoney, formatNumber, humanize, titleCase } from "@/lib/format";
import type { CustomerRow, Paged } from "@/lib/types";

function CustomersView() {
  const url = useUrlState();
  const [adding, setAdding] = useState(false);
  const filters = {
    q: url.get("q"), verified: url.get("verified"), sort: url.get("sort"),
    page: url.get("page") || "1", pageSize: url.get("pageSize") || "20",
  };
  const { data, isPending, isError, isPlaceholderData, refetch } = useQuery({
    queryKey: ["customers", filters],
    queryFn: () => api<Paged<CustomerRow>>("/admin/customers", { query: filters }),
    placeholderData: (previous) => previous,
  });
  const selection = useSelection((data?.items ?? []).map((customer) => customer.id));

  return (
    <>
      <PageHero
        eyebrow={`Sales · Customers${data ? ` · ${formatNumber(data.total)}` : ""}`}
        title="Customers"
        description="Everyone with a store account, and what they have ordered."
        actions={<Button size="lg" onClick={() => setAdding(true)}><Plus data-icon="inline-start" /> Add customer</Button>}
      />
      <AddCustomerDialog open={adding} onOpenChange={setAdding} />

      <SectionCard flush>
        <DataTableToolbar
          search={<SearchField value={filters.q} onChange={(q) => url.set({ q })} placeholder="Name, phone or email" />}
          hasFilters={url.hasAny}
          onClear={url.clear}
          filters={
            <>
              <Select value={filters.verified || "all"} onValueChange={(v) => url.set({ verified: v === "all" ? "" : v })}>
                <SelectTrigger className="h-9 w-44" aria-label="Phone verification"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Verified or not</SelectItem>
                  <SelectItem value="yes">Phone verified</SelectItem>
                  <SelectItem value="no">Phone not verified</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filters.sort || "newest"} onValueChange={(v) => url.set({ sort: v === "newest" ? "" : v })}>
                <SelectTrigger className="h-9 w-40" aria-label="Sort"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest first</SelectItem>
                  <SelectItem value="oldest">Oldest first</SelectItem>
                </SelectContent>
              </Select>
            </>
          }
          actions={<BulkActions table="customers" noun="customers" refresh={["customers", "dashboard"]} deleteNote="Their past orders are kept, without a customer account attached." selection={selection} filters={filters} />}
        />

        <DataTable
          isPending={isPending || !data}
          isError={isError}
          isEmpty={data?.items.length === 0}
          isStale={isPlaceholderData}
          onRetry={() => refetch()}
          skeletonCols={7}
          empty={{ illustration: "patients", title: "No customers match", description: "Try a different search, or clear the filters.", action: url.hasAny ? <Button variant="outline" onClick={url.clear}>Clear filters</Button> : undefined }}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <ColHead className="w-10 pl-4"><SelectPage selection={selection} noun="customers" /></ColHead>
                <ColHead>Customer</ColHead>
                <ColHead>Contact</ColHead>
                <ColHead>Location</ColHead>
                <ColHead>Type</ColHead>
                <ColHead align="right">Orders</ColHead>
                <ColHead align="right">Spent</ColHead>
                <ColHead className="pr-4">Joined</ColHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.items.map((customer) => (
                <TableRow key={customer.id} data-state={selection.has(customer.id) ? "selected" : undefined} className="h-14!">
                  <TableCell className="pl-4"><SelectRow selection={selection} id={customer.id} label={customer.name ?? customer.phone ?? "customer"} /></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <GradientAvatar name={customer.name ?? customer.phone ?? "?"} size="sm" stripDoctorPrefix={false} />
                      <div className="min-w-0">
                        <div className="max-w-52 truncate font-medium">{customer.name ? titleCase(customer.name) : "No name yet"}</div>
                        {customer.phoneVerifiedAt ? null : <div className="text-xs text-muted-foreground">Phone not verified</div>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="ledger">{customer.phone ?? "—"}</div>
                    <div className="max-w-52 truncate text-xs text-muted-foreground">{customer.email}</div>
                  </TableCell>
                  <TableCell className="max-w-40 truncate">{[customer.city, customer.state].filter(Boolean).map((part) => titleCase(part!.toLowerCase())).join(", ") || "—"}</TableCell>
                  <TableCell>
                    {customer.b2bAccount ? <StatusPill status="B2B" label={`Wholesale · ${humanize(customer.b2bAccount.type)}`} dot={false} /> : <StatusPill status="D2C" label="Retail" dot={false} />}
                  </TableCell>
                  <TableCell className="ledger text-right">{formatNumber(customer.orderCount)}</TableCell>
                  <TableCell className="ledger text-right font-medium">{customer.totalSpent ? formatMoney(customer.totalSpent) : "—"}</TableCell>
                  <TableCell className="pr-4 text-muted-foreground">{formatDate(customer.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataTable>

        {data ? (
          <PaginationBar
            page={data.page} pageCount={data.pageCount} pageSize={data.pageSize} total={data.total} noun="customers"
            onPage={(page) => url.set({ page })} onPageSize={(pageSize) => url.set({ pageSize })}
          />
        ) : null}
      </SectionCard>
    </>
  );
}

export default function CustomersPage() {
  return (
    <Suspense>
      <CustomersView />
    </Suspense>
  );
}
