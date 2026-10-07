"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, DatabaseBackup, Lock, Unplug } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Callout } from "@/components/custom/callout";
import { PageHero } from "@/components/custom/page-hero";
import { SectionCard } from "@/components/custom/section-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { formatDateTime, formatNumber } from "@/lib/format";

// Admin → Import from old site. One button, for the owner, for the time before launch: it brings the
// old site's current customers, products and orders into this database. The server does the work and
// refuses once the site has taken real money or booked a real courier (backend/src/lib/legacy-import.ts).

type Summary = { at: string; by: string; tookSeconds: number; counts: Record<string, number>; summary: string; notes: string[] };
type Status = {
  configured: boolean; confirmWord: string; locked: string | null;
  job: { running: boolean; stage: string; lines: string[]; startedAt: string | null; finishedAt: string | null; error: string | null };
  now: { customers: number; products: number; orders: number; doctors: number; appointments: number } | null;
  kept: { staff: number; streams: number; specializations: number; questions: number } | null;
  last: Summary | null;
};

const n = (value: number | undefined) => (value === undefined ? "" : formatNumber(value));
const label = (key: string) => key.charAt(0).toUpperCase() + key.slice(1);

export default function DataImportPage() {
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState(false);
  const [word, setWord] = useState("");
  const wasRunning = useRef(false);
  const logEnd = useRef<HTMLDivElement>(null);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["data-import"],
    queryFn: () => api<Status>("/admin/data-import"),
    retry: false,
    // while it runs the server is busy and an answer may be late: keep asking
    refetchInterval: (query) => (query.state.data?.job.running ? 1500 : false),
  });
  const running = data?.job.running ?? false;

  useEffect(() => {
    if (running) logEnd.current?.scrollIntoView({ block: "nearest" });
    if (wasRunning.current && !running && data) {
      if (data.job.error) toast.error("The import stopped. Nothing was changed.");
      else toast.success("The old site's data is in.");
      queryClient.invalidateQueries(); // every list in the panel now shows different rows
    }
    wasRunning.current = running;
  }, [running, data, queryClient]);

  const start = useMutation({
    mutationFn: () => api("/admin/data-import/start", { method: "POST", body: { confirm: word } }),
    onSuccess: () => { setAsking(false); setWord(""); queryClient.invalidateQueries({ queryKey: ["data-import"] }); },
    onError: (err) => toast.error(err.message),
  });

  const hero = (
    <PageHero
      eyebrow="Settings · Before launch"
      title="Import from old site"
      description="Brings the old site's current customers, products and orders into this panel in one go. Use it as often as you like while getting ready, and one last time on launch day."
    />
  );
  if (isError) return <>{hero}<Callout tone="warning" icon={Lock} title="Only the owner can use this">{error.message}</Callout></>;
  if (isPending || !data) return <>{hero}<Skeleton className="h-64 rounded-xl" /></>;

  const ready = data.configured && !data.locked;
  const last = data.last;

  return (
    <>
      {hero}
      <div className="grid gap-4">
        {running ? (
          <Callout tone="info" title={`Working: ${data.job.stage.toLowerCase()}`}>
            Keep this page open. The rest of the panel pauses for a minute or two while the data is replaced, and comes back by itself.
          </Callout>
        ) : data.locked ? (
          <Callout tone="danger" icon={Lock} title="Closed for good">{data.locked}</Callout>
        ) : !data.configured ? (
          <Callout tone="warning" icon={Unplug} title="The old site is not connected yet">
            Whoever looks after the server adds the old site&apos;s database address as <span className="font-mono text-xs">LEGACY_MONGODB_URI</span> in the server&apos;s <span className="font-mono text-xs">.env</span> file and restarts it. The old site is only read, never changed.
          </Callout>
        ) : data.job.error ? (
          <Callout tone="danger" title="The last try stopped, and nothing was changed">{data.job.error}</Callout>
        ) : (
          <Callout tone="success" icon={CircleCheck} title="Ready">The old site is connected. It is only read, never changed.</Callout>
        )}

        {running || data.job.lines.length ? (
          <SectionCard title={running ? "Progress" : "What the last run did"} description={data.job.startedAt ? `Started ${formatDateTime(data.job.startedAt)}` : undefined}>
            <div className="scroll-thin max-h-72 overflow-y-auto rounded-lg bg-surface-2 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap" aria-live="polite">
              {data.job.lines.map((line, index) => <div key={index}>{line}</div>)}
              {running ? <div className="text-muted-foreground">…</div> : null}
              <div ref={logEnd} />
            </div>
          </SectionCard>
        ) : null}

        {!running ? (
          <SectionCard
            title="What pressing the button does"
            description="If anything goes wrong on the way, the import stops and this panel is left exactly as it was."
            footer={
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">It closes by itself, for good, after the first real payment or real courier booking.</p>
                <Button variant="destructive" disabled={!ready} onClick={() => { setWord(""); setAsking(true); }}>
                  <DatabaseBackup data-icon="inline-start" /> Bring in the old site&apos;s data
                </Button>
              </div>
            }
          >
            <div className="grid gap-5 md:grid-cols-3">
              <div>
                <h3 className="font-medium">Replaced with the old site&apos;s</h3>
                <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
                  <li>Customers and their addresses <span className="ledger">({n(data.now?.customers)} here now)</span></li>
                  <li>Brands, categories, products and stock <span className="ledger">({n(data.now?.products)})</span></li>
                  <li>Orders and their payments <span className="ledger">({n(data.now?.orders)})</span></li>
                  <li>Doctors <span className="ledger">({n(data.now?.doctors)})</span></li>
                  <li>Coupons, delivery charges, banners, blog, enquiries</li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium">Kept as it is here</h3>
                <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
                  <li>Staff accounts and roles <span className="ledger">({n(data.kept?.staff)})</span>. You stay signed in.</li>
                  <li>Settings and the wording of automatic messages</li>
                  <li>Consulting streams <span className="ledger">({n(data.kept?.streams)})</span>, specializations <span className="ledger">({n(data.kept?.specializations)})</span> and test questions <span className="ledger">({n(data.kept?.questions)})</span></li>
                  <li>Doctor levels and B2B price tiers</li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium">Gone, because the old site has none</h3>
                <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
                  <li>Orders, returns and refunds made here while testing</li>
                  <li>Appointments and prescriptions <span className="ledger">({n(data.now?.appointments)})</span></li>
                  <li>B2B accounts, discount rules, doctor sign-ups and reviews</li>
                  <li>Customers and doctors are signed out and sign in again</li>
                </ul>
              </div>
            </div>
          </SectionCard>
        ) : null}

        {last && !running ? (
          <SectionCard title="Last import" description={`${formatDateTime(last.at)} by ${last.by}, in ${formatNumber(last.tookSeconds)} seconds`}>
            <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(last.counts).filter(([, count]) => count > 0).map(([key, count]) => (
                <div key={key} className="flex items-baseline justify-between gap-3 border-b border-dashed border-foreground/15 pb-1">
                  <dt className="text-muted-foreground">{label(key)}</dt>
                  <dd className="ledger font-medium">{formatNumber(count)}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-sm text-muted-foreground">{last.summary}</p>
            {last.notes.map((note) => <p key={note} className="mt-1 text-sm text-warning">{note}</p>)}
          </SectionCard>
        ) : null}
      </div>

      <Dialog open={asking} onOpenChange={(open) => { if (!start.isPending) setAsking(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Replace this panel&apos;s data with the old site&apos;s?</DialogTitle>
            <DialogDescription>
              Customers, products, orders and doctors here are replaced with the old site&apos;s as they are right now. Anything made here that the old site does not have, such as test orders and appointments, is removed. Staff, roles, settings and the consulting set-up stay.
            </DialogDescription>
          </DialogHeader>
          <form id="import-form" className="grid gap-2" onSubmit={(event) => { event.preventDefault(); if (word === data.confirmWord && !start.isPending) start.mutate(); }}>
            <Label htmlFor="import-word">Type {data.confirmWord} to confirm</Label>
            <Input id="import-word" value={word} onChange={(event) => setWord(event.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder={data.confirmWord} className="font-mono" />
          </form>
          <DialogFooter>
            <Button variant="outline" disabled={start.isPending} onClick={() => setAsking(false)}>Cancel</Button>
            <Button type="submit" form="import-form" variant="destructive" disabled={word !== data.confirmWord} loading={start.isPending}>Replace the data</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
