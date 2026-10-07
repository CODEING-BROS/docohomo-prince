"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CircleCheck, Download, FileSpreadsheet, History, TriangleAlert, Upload } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { EmptyState, PaginationBar, StatusBadge } from "@/components/admin/parts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { formatDateTime, formatNumber, titleCase } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SectionCard } from "@/components/custom/section-card";
import { ButtonSpinner, Spinner } from "@/components/custom/loaders";

// Add and update many products at once from a spreadsheet saved as CSV.
// The file is first checked ("preview": nothing is saved), then applied.

const MAX_BYTES = 10 * 1024 * 1024;
const TEMPLATE_URL = "/api/admin/product-import/template";
const EXPORT_URL = "/api/admin/products/export";

type Change = { field: string; from: string | null; to: string | null };
type Row = {
  row: number; action: "create" | "update" | "skip"; problem: boolean; message: string;
  product: string; variant: string; sku: string; changes: Change[];
};
type Summary = { rowsRead: number; newProducts: number; newVariants: number; updatedVariants: number; unchanged: number; problems: number };
type Result = {
  fileName: string; applied: boolean; jobId?: number; summary: Summary; rows: Row[];
  ignoredColumns: string[]; missingColumns: string[];
};
type JobProblem = { row: number; product: string; sku: string; message: string };
type Job = {
  id: number; fileName: string; status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
  totalRows: number; successRows: number; failedRows: number;
  counts: { newProducts: number; newVariants: number; updatedVariants: number; unchanged: number } | null;
  problems: JobProblem[]; moreProblems: number; createdBy: string | null; createdAt: string; finishedAt: string | null;
};
type Filter = "all" | "changes" | "problems";

/** "1 row" / "3 rows" */
const count = (value: number, one: string, many = `${one}s`) => `${formatNumber(value)} ${value === 1 ? one : many}`;

/** Posts the spreadsheet to the backend, to be checked or applied. */
const send = async (step: "preview" | "apply", file: File): Promise<Result> => {
  const body = new FormData();
  body.append("file", file);
  let response: Response;
  try {
    response = await fetch(`/api/admin/product-import/${step}`, { method: "POST", body, credentials: "include" });
  } catch {
    throw new Error("Could not send the file. If you changed it after choosing it, choose it again.");
  }
  const data = await response.json().catch(() => null);
  if (response.ok && data) return data as Result;
  if (data?.message) throw new Error(data.message);
  throw new Error(
    step === "apply"
      ? "This is taking longer than usual. It may still be running: look at “Previous uploads” below in a minute before you upload again."
      : "Could not read the file. Try again.",
  );
};

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{number}</span>
      <div className="grid min-w-0 flex-1 content-start gap-2">
        <h2 className="pt-0.5 font-medium">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function NumberCard({ label, value, tone }: { label: string; value: number; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tracking-tight ledger", value > 0 && tone === "good" && "text-success", value > 0 && tone === "bad" && "text-destructive")}>
        {formatNumber(value)}
      </p>
    </div>
  );
}

function RowBadge({ row, applied }: { row: Row; applied: boolean }) {
  if (row.problem) return <StatusBadge status="FAILED" label="Problem" />;
  if (row.action === "create") return <StatusBadge status="ACTIVE" label={applied ? "Added" : "New"} />;
  if (row.action === "update") return <StatusBadge status="CONFIRMED" label={applied ? "Updated" : "Update"} />;
  return <StatusBadge status="DRAFT" label="No change" />;
}

/** "2 products added", "3 variants added", "1 variant updated": only the ones that are not zero. */
const changeParts = (counts: { newProducts: number; newVariants: number; updatedVariants: number }) =>
  [
    counts.newProducts ? `${count(counts.newProducts, "product")} added` : "",
    counts.newVariants ? `${count(counts.newVariants, "variant")} added` : "",
    counts.updatedVariants ? `${count(counts.updatedVariants, "variant")} updated` : "",
  ].filter(Boolean);

const jobSummary = (job: Job) => {
  if (job.status === "RUNNING" || job.status === "QUEUED") return "Still working…";
  if (!job.counts) return job.status === "FAILED" ? "Stopped before it finished. Upload the file again; rows already saved will show as “No change”." : "—";
  const parts = changeParts(job.counts);
  return parts.length ? parts.join(" · ") : "Nothing changed";
};

export default function ProductImportPage() {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [dragging, setDragging] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [openJob, setOpenJob] = useState<Job | null>(null);

  const jobs = useQuery({
    queryKey: ["product-import-jobs"],
    queryFn: () => api<{ items: Job[] }>("/admin/product-import/jobs"),
    // while an upload is being applied, keep looking until it is done
    refetchInterval: (query) => (query.state.data?.items.some((job) => job.status === "RUNNING") ? 4000 : false),
  });

  const preview = useMutation({
    mutationFn: (chosen: File) => send("preview", chosen),
    onSuccess: (data) => {
      setResult(data);
      setFilter("all");
      setPage(1);
    },
    onError: (err) => {
      setFile(null);
      toast.error(err.message);
    },
  });

  const apply = useMutation({
    mutationFn: (chosen: File) => send("apply", chosen),
    onSuccess: (data) => {
      setResult(data);
      setFilter(data.summary.problems > 0 ? "problems" : "changes");
      setPage(1);
      toast.success(`Saved ${count(data.summary.newVariants + data.summary.updatedVariants, "change")}`);
    },
    onError: (err) => toast.error(err.message, { duration: 12_000 }),
    onSettled: () => {
      setConfirming(false);
      for (const key of ["product-import-jobs", "products", "dashboard"]) queryClient.invalidateQueries({ queryKey: [key] });
    },
  });

  const choose = (chosen: File | undefined) => {
    if (!chosen || preview.isPending || apply.isPending) return;
    if (/\.(xlsx|xls|ods|numbers)$/i.test(chosen.name)) {
      return toast.error("That is an Excel file. In Excel choose File › Save As › CSV (Comma delimited), then upload the CSV file.");
    }
    if (!/\.csv$/i.test(chosen.name)) return toast.error("Choose a CSV file (a file whose name ends in .csv)");
    if (chosen.size > MAX_BYTES) return toast.error(`${chosen.name} is larger than 10 MB. Split it into smaller files.`);
    setFile(chosen);
    setResult(null);
    preview.mutate(chosen);
  };

  const startOver = () => {
    setFile(null);
    setResult(null);
    preview.reset();
    apply.reset();
  };

  const rows = result?.rows;
  const shown = useMemo(() => {
    if (!rows) return [];
    if (filter === "problems") return rows.filter((row) => row.problem);
    if (filter === "changes") return rows.filter((row) => !row.problem && row.action !== "skip");
    return rows;
  }, [rows, filter]);
  const pageCount = Math.max(1, Math.ceil(shown.length / pageSize));
  const current = Math.min(page, pageCount);
  const visible = shown.slice((current - 1) * pageSize, current * pageSize);

  const summary = result?.summary;
  const changeCount = summary ? summary.newVariants + summary.updatedVariants : 0;
  const applied = result?.applied ?? false;
  const busy = preview.isPending || apply.isPending;
  const filters: { value: Filter; label: string; total: number }[] = summary
    ? [
        { value: "all", label: "All rows", total: summary.rowsRead },
        { value: "changes", label: applied ? "Saved" : "Will change", total: changeCount },
        { value: "problems", label: "Problems", total: summary.problems },
      ]
    : [];

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Back to products"><Link href="/admin/products"><ArrowLeft /></Link></Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold tracking-tight">Bulk upload products</h1>
          <p className="text-sm text-muted-foreground">Add new products or change prices and stock for many products at once, from a spreadsheet.</p>
        </div>
      </div>

      <div className="grid gap-4">
        <Card>
          <CardContent className="grid gap-6 xl:grid-cols-3">
            <Step number={1} title="Get the spreadsheet">
              <p className="text-sm text-muted-foreground">
                Start from the empty template to add new products, or export your current products to change them.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" className="h-9"><a href={TEMPLATE_URL} download><Download /> Download template</a></Button>
                <Button asChild variant="outline" className="h-9"><a href={EXPORT_URL} download><Download /> Export current products</a></Button>
              </div>
            </Step>

            <Step number={2} title="Fill it in">
              <ul className="grid list-disc gap-1 pl-4 text-sm text-muted-foreground">
                <li>One row for each variant (pack size or potency) of a product.</li>
                <li>To change a product, keep its <span className="font-medium text-foreground">SKU</span> and edit the other cells.</li>
                <li>To add something new, leave the SKU empty. Rows with the same Product and Brand become one product.</li>
                <li>An empty cell is left as it is. Delete a column, such as Stock, if you do not want to touch it.</li>
                <li>Brands and categories must already exist here, spelled the same way.</li>
              </ul>
            </Step>

            <Step number={3} title="Upload it">
              <input
                ref={inputRef} type="file" accept=".csv,text/csv" className="sr-only" tabIndex={-1} aria-hidden
                onChange={(event) => { choose(event.target.files?.[0]); event.target.value = ""; }}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
                onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => { event.preventDefault(); setDragging(false); choose(event.dataTransfer.files[0]); }}
                className={cn(
                  "flex min-h-28 w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-4 py-5 text-center text-sm transition-colors outline-none",
                  "hover:border-primary/60 hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none",
                  dragging && "border-primary bg-primary/5",
                )}
              >
                {preview.isPending ? (
                  <>
                    <Spinner size="md" />
                    <span className="font-medium">Checking {file?.name}…</span>
                    <span className="text-xs text-muted-foreground">Nothing is saved yet.</span>
                  </>
                ) : (
                  <>
                    <Upload className="size-5 text-muted-foreground" />
                    <span className="font-medium">{file && result ? "Choose another CSV file" : "Click to choose a CSV file, or drag it here"}</span>
                    <span className="text-xs text-muted-foreground">Up to 10 MB. We check it first; nothing is saved until you say so.</span>
                  </>
                )}
              </button>
              <p className="text-xs text-muted-foreground">
                Working in Excel? Save the sheet as CSV first: File › Save As › CSV (Comma delimited).
              </p>
            </Step>
          </CardContent>
        </Card>

        {result && summary ? (
          <SectionCard flush>
            <div className="flex flex-wrap items-center gap-3 border-b p-4">
              <FileSpreadsheet className="size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{result.fileName}</p>
                <p className="text-sm text-muted-foreground">
                  {applied ? "This file has been saved." : "This is only a check. Nothing has been saved yet."}
                </p>
              </div>
              <Button variant="outline" className="h-9" disabled={busy} onClick={startOver}>{applied ? "Upload another file" : "Cancel"}</Button>
              {applied ? null : (
                <Button className="h-9" disabled={changeCount === 0 || busy} onClick={() => setConfirming(true)}>
                  {apply.isPending ? <ButtonSpinner /> : null}Apply {count(changeCount, "change")}
                </Button>
              )}
            </div>

            <div className="grid gap-4 border-b p-4">
              {applied ? (
                <div className="flex items-start gap-2.5 rounded-lg bg-success/10 p-3 text-sm">
                  <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" />
                  <p>
                    <span className="font-medium">Done.</span>{" "}
                    {changeParts(summary).join(", ") || "Nothing was changed"}.
                    {summary.problems > 0 ? ` ${count(summary.problems, "row")} had a problem and ${summary.problems === 1 ? "was" : "were"} skipped: fix ${summary.problems === 1 ? "it" : "them"} in your sheet and upload it again.` : ""}
                  </p>
                </div>
              ) : summary.problems > 0 ? (
                <div className="flex items-start gap-2.5 rounded-lg bg-warning/15 p-3 text-sm">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
                  <p>
                    {count(summary.problems, "row")} {summary.problems === 1 ? "has a problem and will be skipped" : "have a problem and will be skipped"}.
                    {changeCount > 0 ? " You can apply the rest now, or fix your sheet and upload it again." : " Fix your sheet and upload it again."}
                  </p>
                </div>
              ) : changeCount === 0 ? (
                <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">Everything in this file is already the same as in your catalog, so there is nothing to change.</p>
              ) : null}

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                <NumberCard label="Rows read" value={summary.rowsRead} />
                <NumberCard label={applied ? "Products added" : "New products"} value={summary.newProducts} tone="good" />
                <NumberCard label={applied ? "Variants added" : "New variants"} value={summary.newVariants} tone="good" />
                <NumberCard label={applied ? "Variants updated" : "Variants to update"} value={summary.updatedVariants} tone="good" />
                <NumberCard label="No change" value={summary.unchanged} />
                <NumberCard label="Rows with problems" value={summary.problems} tone="bad" />
              </div>

              {result.missingColumns.length || result.ignoredColumns.length ? (
                <div className="grid gap-1 text-xs text-muted-foreground">
                  {result.missingColumns.length ? <p>Not in this file, so left as they are: {result.missingColumns.join(", ")}.</p> : null}
                  {result.ignoredColumns.length ? <p>Columns we do not use: {result.ignoredColumns.join(", ")}.</p> : null}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-b border-foreground/18 bg-surface-2 px-3 py-2">
              {filters.map((option) => (
                <Button
                  key={option.value} size="sm" variant={filter === option.value ? "secondary" : "ghost"} aria-pressed={filter === option.value}
                  onClick={() => { setFilter(option.value); setPage(1); }}
                >
                  {option.label} <span className="ledger text-muted-foreground">{formatNumber(option.total)}</span>
                </Button>
              ))}
            </div>

            {visible.length === 0 ? (
              <EmptyState
                icon={filter === "problems" ? CircleCheck : FileSpreadsheet}
                title={filter === "problems" ? "No problems" : "Nothing here"}
                description={filter === "problems" ? "Every row in this file can be saved." : "No rows in this file change anything."}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16 pl-4 text-right">Row</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Variant</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead className="pr-4">{applied ? "What happened" : "What will happen"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((row) => (
                    <TableRow key={row.row} className="align-top">
                      <TableCell className="pl-4 text-right ledger text-muted-foreground">{formatNumber(row.row)}</TableCell>
                      <TableCell className="max-w-64 whitespace-normal font-medium">{row.product ? titleCase(row.product) : <span className="font-normal text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="max-w-40 whitespace-normal">{row.variant || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{row.sku || <span className="font-sans text-muted-foreground">{row.action === "create" && !row.problem ? "Made for you" : "—"}</span>}</TableCell>
                      <TableCell><RowBadge row={row} applied={applied} /></TableCell>
                      <TableCell className="max-w-md pr-4 whitespace-normal">
                        <p className={cn(row.problem ? "text-destructive" : "text-muted-foreground")}>{row.message}</p>
                        {row.changes.length ? (
                          <ul className="mt-1 grid gap-0.5">
                            {row.changes.map((change) => (
                              <li key={change.field} className="text-sm">
                                <span className="text-muted-foreground">{change.field}:</span>{" "}
                                <span className="text-muted-foreground line-through">{change.from ?? "empty"}</span>{" → "}
                                <span className="font-medium">{change.to ?? "empty"}</span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            <PaginationBar
              page={current} pageCount={pageCount} pageSize={pageSize} total={shown.length} noun="rows"
              onPage={setPage} onPageSize={(size) => { setPageSize(size); setPage(1); }}
            />
          </SectionCard>
        ) : null}

        <SectionCard flush>
          <CardHeader className="border-b py-4"><CardTitle>Previous uploads</CardTitle></CardHeader>
          {jobs.isError ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Could not load previous uploads. Check that the backend is running.</p>
          ) : jobs.isPending ? (
            <div className="grid gap-2 p-4">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : jobs.data.items.length === 0 ? (
            <EmptyState icon={History} title="No uploads yet" description="Files you apply will be listed here, with what they changed." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">When</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead className="text-right">Rows</TableHead>
                  <TableHead>What changed</TableHead>
                  <TableHead>Problems</TableHead>
                  <TableHead className="pr-4">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.data.items.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="pl-4 text-muted-foreground">{formatDateTime(job.createdAt)}</TableCell>
                    <TableCell className="max-w-56 truncate font-medium">{job.fileName}</TableCell>
                    <TableCell className="max-w-40 truncate">{job.createdBy ?? "—"}</TableCell>
                    <TableCell className="text-right ledger">{formatNumber(job.totalRows)}</TableCell>
                    <TableCell className="max-w-72 whitespace-normal text-muted-foreground">{jobSummary(job)}</TableCell>
                    <TableCell>
                      {job.failedRows > 0 ? (
                        <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setOpenJob(job)}>{count(job.failedRows, "row")}</Button>
                      ) : (
                        <span className="text-muted-foreground">None</span>
                      )}
                    </TableCell>
                    <TableCell className="pr-4">
                      <StatusBadge
                        status={job.status === "COMPLETED" ? "SUCCESS" : job.status === "FAILED" ? "FAILED" : "PENDING"}
                        label={job.status === "COMPLETED" ? "Done" : job.status === "FAILED" ? "Did not finish" : "Working"}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>
      </div>

      <Dialog open={confirming} onOpenChange={(open) => !apply.isPending && setConfirming(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply {count(changeCount, "change")}?</DialogTitle>
            <DialogDescription>
              {summary ? `In your catalog: ${changeParts(summary).join(", ")}.` : ""}
              {summary && summary.problems > 0 ? ` ${count(summary.problems, "row")} with problems will be skipped.` : ""}
              {" "}There is no undo button, so keep a copy of your current products (step 1, “Export current products”) if you may want to go back.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={apply.isPending} onClick={() => setConfirming(false)}>Not yet</Button>
            <Button disabled={!file || apply.isPending} onClick={() => file && apply.mutate(file)}>
              {apply.isPending ? <ButtonSpinner /> : null}{apply.isPending ? "Saving…" : `Apply ${count(changeCount, "change")}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openJob !== null} onOpenChange={(open) => !open && setOpenJob(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Rows that were skipped</DialogTitle>
            <DialogDescription>{openJob ? `${openJob.fileName}, uploaded ${formatDateTime(openJob.createdAt)}` : ""}</DialogDescription>
          </DialogHeader>
          {openJob ? (
            <div className="max-h-[60vh] overflow-y-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16 text-right">Row</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Problem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {openJob.problems.map((problem) => (
                    <TableRow key={problem.row} className="align-top">
                      <TableCell className="text-right ledger text-muted-foreground">{formatNumber(problem.row)}</TableCell>
                      <TableCell className="max-w-48 whitespace-normal">
                        {problem.product ? titleCase(problem.product) : "—"}
                        {problem.sku ? <span className="block font-mono text-xs text-muted-foreground">{problem.sku}</span> : null}
                      </TableCell>
                      <TableCell className="whitespace-normal">{problem.message}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {openJob.moreProblems > 0 ? (
                <p className="border-t p-3 text-sm text-muted-foreground">And {count(openJob.moreProblems, "more row")}. Upload the file again to see them all.</p>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenJob(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
