"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, GraduationCap, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BulkActions, SelectPage, SelectRow, useSelection } from "@/components/admin/bulk";
import { EmptyState, PageHeader, StatusBadge, StatusDot } from "@/components/admin/parts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { STREAM_STATUS, STREAM_STATUSES, type StreamRow, type StreamStatus } from "@/lib/onboarding";
import { SectionCard } from "@/components/custom/section-card";
import { ButtonSpinner } from "@/components/custom/loaders";
import { MatchingSettings } from "@/components/admin/matching-settings";

type Draft = {
  id: number | null; name: string; savedName: string; description: string; status: StreamStatus;
  questionsPerTest: string; passPercent: string; isActive: boolean; doctorCount: number;
};
const emptyDraft: Draft = { id: null, name: "", savedName: "", description: "", status: "COMING_SOON", questionsPerTest: "10", passPercent: "60", isActive: true, doctorCount: 0 };

type Saved = StreamRow & { doctorsRenamed?: number; doctorsSwitchedOn?: number };

const doctorWord = (count: number) => `${formatNumber(count)} ${count === 1 ? "doctor" : "doctors"}`;

export default function StreamsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<StreamRow | null>(null);

  const { data, isPending, isError } = useQuery({ queryKey: ["streams"], queryFn: () => api<{ items: StreamRow[] }>("/admin/streams") });
  // there are few streams, so they are all loaded and searched here
  const streams = useMemo(
    () => (data?.items ?? []).filter((s) => s.name.toLowerCase().includes(search.trim().toLowerCase())),
    [data, search],
  );

  const streamIds = useMemo(() => streams.map((s) => s.id), [streams]);
  const selection = useSelection(streamIds);
  const refresh = () => ["streams", "stream-questions", "doctor", "doctor-onboarding", "doctors"].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
  /** Says what else changed because of a save: doctors renamed with the stream, or switched on when it opened. */
  const tellSideEffects = (saved: Saved) => {
    if (saved.doctorsSwitchedOn) toast.success(`Consultations switched on for ${doctorWord(saved.doctorsSwitchedOn)} who ${saved.doctorsSwitchedOn === 1 ? "was" : "were"} waiting for this stream to open`);
  };

  const save = useMutation({
    mutationFn: (d: Draft) =>
      api<Saved>(d.id ? `/admin/streams/${d.id}` : "/admin/streams", {
        method: d.id ? "PATCH" : "POST",
        body: { name: d.name, description: d.description, status: d.status, questionsPerTest: Number(d.questionsPerTest), passPercent: Number(d.passPercent), isActive: d.isActive },
      }),
    onSuccess: (saved, d) => {
      toast.success(d.id ? "Stream updated" : "Stream added");
      tellSideEffects(saved);
      setDraft(null);
      refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  const setStatus = useMutation({
    mutationFn: (input: { stream: StreamRow; status: StreamStatus }) => api<Saved>(`/admin/streams/${input.stream.id}`, { method: "PATCH", body: { status: input.status } }),
    onSuccess: (saved, input) => {
      toast.success(`${input.stream.name} is now ${STREAM_STATUS[input.status].label.toLowerCase()}`);
      tellSideEffects(saved);
      refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: (stream: StreamRow) => api(`/admin/streams/${stream.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Stream deleted");
      setDeleting(null);
      refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  const edit = (stream: StreamRow) =>
    setDraft({
      id: stream.id, name: stream.name, savedName: stream.name, description: stream.description ?? "", status: stream.status,
      questionsPerTest: String(stream.questionsPerTest), passPercent: String(stream.passPercent), isActive: stream.isActive, doctorCount: stream.doctorCount,
    });

  return (
    <>
      <PageHeader title="Consulting streams" description="The systems of medicine doctors can register under. Each stream has its own specializations, and the test a doctor takes before consulting.">
        <Button className="h-9" onClick={() => setDraft(emptyDraft)}><Plus /> Add stream</Button>
      </PageHeader>

      <div className="mb-4"><MatchingSettings /></div>

      <SectionCard flush>
        <div className="flex flex-wrap items-center gap-2 border-b border-foreground/18 bg-surface-2 px-3 py-2">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search streams" className="h-9 w-full sm:w-64" />
          <BulkActions table="streams" noun="streams" selection={selection} exportable={false} refresh={["streams", "stream-questions", "doctor", "doctor-onboarding", "doctors"]} deleteNote="Their specializations and test questions go with them. Streams that doctors are registered in are kept." />
        </div>

        {isError ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Could not load streams. Check that the backend is running.</p>
        ) : isPending ? (
          <div className="grid gap-2 p-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-11" />)}</div>
        ) : streams.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title={search.trim() ? "No streams match" : "No streams yet"}
            description={search.trim() ? "Try a different search, or add a new stream." : "Add a stream such as Homeopathy so doctors can register under it."}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 pl-4"><SelectPage selection={selection} noun="streams" /></TableHead>
                <TableHead>Stream</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Specializations</TableHead>
                <TableHead>Test questions</TableHead>
                <TableHead>The test</TableHead>
                <TableHead className="text-right">Doctors</TableHead>
                <TableHead className="w-28 pr-4"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {streams.map((stream) => {
                const busy = setStatus.isPending && setStatus.variables?.stream.id === stream.id;
                const short = stream.activeQuestionCount > 0 && stream.activeQuestionCount < stream.questionsPerTest;
                return (
                  <TableRow key={stream.id} className="cursor-pointer" data-state={selection.has(stream.id) ? "selected" : undefined} onClick={() => router.push(`/admin/streams/${stream.id}`)}>
                    <TableCell className="pl-4"><SelectRow selection={selection} id={stream.id} label={stream.name} /></TableCell>
                    <TableCell>
                      <Link href={`/admin/streams/${stream.id}`} className="font-medium hover:underline" onClick={(event) => event.stopPropagation()}>{stream.name}</Link>
                      {stream.description ? <div className="max-w-72 truncate text-xs text-muted-foreground">{stream.description}</div> : null}
                    </TableCell>
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button type="button" disabled={busy} aria-label={`Status of ${stream.name}: ${STREAM_STATUS[stream.status].label}. Change it`} className="inline-flex items-center gap-1 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60">
                              <StatusBadge status={STREAM_STATUS[stream.status].tone} label={STREAM_STATUS[stream.status].label} />
                              {busy ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : <ChevronDown className="size-3.5 text-muted-foreground" />}
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="min-w-72">
                            {STREAM_STATUSES.map((status) => (
                              <DropdownMenuItem key={status} disabled={status === stream.status} onSelect={() => setStatus.mutate({ stream, status })} className="items-start">
                                <span className="mt-1.5"><StatusDot status={STREAM_STATUS[status].tone} /></span>
                                <span>{STREAM_STATUS[status].label}<span className="block text-xs text-muted-foreground">{STREAM_STATUS[status].hint}</span></span>
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        {stream.isActive ? null : <StatusBadge status="ARCHIVED" label="Switched off" />}
                      </div>
                    </TableCell>
                    <TableCell>
                      {stream.specializationCount ? (
                        <Link href={`/admin/streams/${stream.id}`} className="ledger hover:underline" onClick={(event) => event.stopPropagation()}>{formatNumber(stream.specializationCount)}</Link>
                      ) : (
                        <Link href={`/admin/streams/${stream.id}`} className="text-primary hover:underline" onClick={(event) => event.stopPropagation()}>Add some</Link>
                      )}
                    </TableCell>
                    <TableCell>
                      {stream.questionCount === 0 ? (
                        <span className="text-muted-foreground">None yet, so no test</span>
                      ) : (
                        <>
                          <div className="ledger">{formatNumber(stream.activeQuestionCount)} in use{stream.questionCount > stream.activeQuestionCount ? <span className="text-muted-foreground">, {formatNumber(stream.questionCount - stream.activeQuestionCount)} switched off</span> : null}</div>
                          {short ? <div className="text-xs text-warning">Fewer than the {stream.questionsPerTest} a test asks</div> : null}
                          {stream.activeQuestionCount === 0 ? <div className="text-xs text-muted-foreground">Doctors skip the test</div> : null}
                        </>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{stream.questionsPerTest} questions, {stream.passPercent}% to pass</TableCell>
                    <TableCell className="text-right ledger">
                      {formatNumber(stream.doctorCount)}
                      {stream.doctorCount > 0 && stream.activeQuestionCount > 0 ? <div className="text-xs text-muted-foreground">{formatNumber(stream.passedCount)} passed the test</div> : null}
                    </TableCell>
                    <TableCell className="pr-4 text-right" onClick={(event) => event.stopPropagation()}>
                      <Button variant="ghost" size="icon-sm" aria-label={`Edit ${stream.name}`} onClick={() => edit(stream)}><Pencil /></Button>
                      <Button variant="ghost" size="icon-sm" aria-label={`Delete ${stream.name}`} onClick={() => setDeleting(stream)}><Trash2 /></Button>
                      <Button asChild variant="ghost" size="icon-sm" aria-label={`Open the specializations and test questions of ${stream.name}`}><Link href={`/admin/streams/${stream.id}`}><ChevronRight /></Link></Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </SectionCard>
      <p className="mt-3 text-xs text-muted-foreground">Click a stream to manage its specializations (the kinds of doctor inside it) and its test questions. A stream with no questions in use has no test: its doctors start consulting as soon as their documents are verified.</p>

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit stream" : "Add stream"}</DialogTitle>
            <DialogDescription>Doctors pick one stream when they register, and answer its test questions after their documents are verified.</DialogDescription>
          </DialogHeader>
          {draft ? (
            <form id="stream-form" className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(draft); }}>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="stream-name">Name</Label>
                <Input id="stream-name" required autoFocus minLength={2} maxLength={60} placeholder="Homeopathy" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                {draft.id && draft.doctorCount > 0 && draft.name.trim() !== draft.savedName ? (
                  <p className="text-xs text-muted-foreground">The new name will also show for the {doctorWord(draft.doctorCount)} registered in this stream.</p>
                ) : null}
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="stream-description">Description <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Textarea id="stream-description" rows={2} maxLength={300} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label>Status</Label>
                <Select value={draft.status} onValueChange={(v) => setDraft({ ...draft, status: v as StreamStatus })}>
                  <SelectTrigger className="h-9 w-full" aria-label="Status"><SelectValue /></SelectTrigger>
                  <SelectContent>{STREAM_STATUSES.map((status) => <SelectItem key={status} value={status}>{STREAM_STATUS[status].label}</SelectItem>)}</SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{STREAM_STATUS[draft.status].hint}.</p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="stream-questions">Questions in each test</Label>
                <Input id="stream-questions" required type="number" inputMode="numeric" min={1} max={100} step={1} className="h-9" value={draft.questionsPerTest} onChange={(e) => setDraft({ ...draft, questionsPerTest: e.target.value })} />
                <p className="text-xs text-muted-foreground">Picked at random from the stream&apos;s questions.</p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="stream-pass">Pass mark (%)</Label>
                <Input id="stream-pass" required type="number" inputMode="numeric" min={1} max={100} step={1} className="h-9" value={draft.passPercent} onChange={(e) => setDraft({ ...draft, passPercent: e.target.value })} />
                <p className="text-xs text-muted-foreground">Share of answers a doctor must get right.</p>
              </div>
              <label className="flex items-start gap-2 text-sm sm:col-span-2">
                <Checkbox className="mt-0.5" checked={draft.isActive} onCheckedChange={(checked) => setDraft({ ...draft, isActive: checked === true })} />
                <span>Stream is switched on<span className="block text-xs text-muted-foreground">Switched off, doctors cannot choose it when they register and no new consultations start in it.</span></span>
              </label>
            </form>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
            <Button type="submit" form="stream-form" loading={save.isPending}>{draft?.id ? "Save changes" : "Add stream"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleting?.name}?</DialogTitle>
            <DialogDescription>
              {deleting?.doctorCount
                ? `${doctorWord(deleting.doctorCount)} ${deleting.doctorCount === 1 ? "is" : "are"} registered in this stream, so it cannot be deleted. Close it or switch it off instead.`
                : deleting?.questionCount
                  ? `Its ${formatNumber(deleting.questionCount)} test ${deleting.questionCount === 1 ? "question is" : "questions are"} deleted with it. This cannot be undone.`
                  : "This cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="destructive" disabled={!deleting || deleting.doctorCount > 0 || remove.isPending} onClick={() => deleting && remove.mutate(deleting)}>
              {remove.isPending ? <ButtonSpinner /> : null}Delete stream
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
