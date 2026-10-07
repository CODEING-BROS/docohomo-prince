"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, ClipboardPaste, Info, ListChecks, Pencil, Plus, Trash2, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { toast } from "sonner";
import { BulkActions, SelectAll, SelectRow, useSelection } from "@/components/admin/bulk";
import { EmptyState, SearchInput, StatusBadge } from "@/components/admin/parts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useUrlState } from "@/hooks/use-url-state";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { MAX_OPTIONS, MIN_OPTIONS, STREAM_STATUS, type StreamQuestion, type StreamRow, type StreamSpecialization, optionLetter } from "@/lib/onboarding";
import { StreamSpecializations } from "@/components/admin/stream-specializations";
import { LabelTag } from "@/components/custom/label-tag";
import { cn } from "@/lib/utils";
import { SectionCard } from "@/components/custom/section-card";
import { ButtonSpinner, Spinner } from "@/components/custom/loaders";

type QuestionList = { stream: StreamRow; specializations: StreamSpecialization[]; items: StreamQuestion[] };

// specializationId "" = a general question, asked of every doctor in the stream
type Draft = { id: number | null; question: string; options: string[]; correctIndex: number; explanation: string; isActive: boolean; specializationId: string };
// nothing is marked right to begin with, so the right answer is always a deliberate choice
const emptyDraft: Draft = { id: null, question: "", options: ["", "", "", ""], correctIndex: -1, explanation: "", isActive: true, specializationId: "" };

type NewQuestion = { question: string; options: string[]; correctIndex: number };

/**
 * Reads questions pasted as plain text: a blank line between questions, the question on the first
 * line, one answer option on each line after it, and a * in front of the right answer.
 * Numbering such as "1." in front of a question, or "a)", "b)"… in front of its options, is dropped.
 */
const readPasted = (text: string): { questions: NewQuestion[]; problem: string | null } => {
  const blocks = text.replace(/\r/g, "").split(/\n\s*\n/).map((block) => block.split("\n").map((line) => line.trim()).filter(Boolean)).filter((lines) => lines.length > 0);
  const questions: NewQuestion[] = [];
  for (const [index, lines] of blocks.entries()) {
    const label = `Question ${index + 1}`;
    const question = lines[0].replace(/^(q(uestion)?\s*)?\d+[).:]\s+/i, "");
    // the * may sit before or after the option's letter: "*b) Plant" or "b) *Plant"
    const stars = lines.slice(1).map((line) => /^(\(?[a-f1-6][).:]\s*)?\*/i.test(line));
    let options = lines.slice(1).map((line) => line.replace(/^\*\s*/, ""));
    // letters are only numbering when every option has the next one in order; "C. Hering" on its own is a name
    const numbered = (first: string) => options.every((option, i) => new RegExp(`^\\(?${String.fromCharCode(first.charCodeAt(0) + i)}[).:]\\s`, "i").test(option));
    if (numbered("a") || numbered("1")) options = options.map((option) => option.replace(/^\(?[a-f1-6][).:]\s+/i, ""));
    options = options.map((option) => option.replace(/^\*\s*/, "").trim());
    if (options.length < MIN_OPTIONS) return { questions, problem: `${label} needs at least ${MIN_OPTIONS} answer options, one on each line under it.` };
    if (options.length > MAX_OPTIONS) return { questions, problem: `${label} has more than ${MAX_OPTIONS} answer options. Leave an empty line between questions.` };
    if (options.some((option) => option === "")) return { questions, problem: `${label} has an empty answer option.` };
    const right = stars.flatMap((star, i) => (star ? [i] : []));
    if (right.length === 0) return { questions, problem: `${label}: put a * in front of the right answer.` };
    if (right.length > 1) return { questions, problem: `${label} has more than one answer marked with *. Mark only the right one.` };
    questions.push({ question, options, correctIndex: right[0] });
  }
  return { questions, problem: null };
};

const PASTE_EXAMPLE = "Who founded homeopathy?\nConstantine Hering\n*Samuel Hahnemann\nJames Tyler Kent\nWilliam Boericke\n\nThe next question goes here?\n*Its right answer\nAnother option";

/** Questions per test and the pass mark, saved on their own. */
function TestSettings({ stream, onSaved }: { stream: StreamRow; onSaved: () => void }) {
  const [perTest, setPerTest] = useState(String(stream.questionsPerTest));
  const [pass, setPass] = useState(String(stream.passPercent));
  const changed = perTest !== "" && pass !== "" && (Number(perTest) !== stream.questionsPerTest || Number(pass) !== stream.passPercent);
  const asked = Math.min(Number(perTest) || 0, stream.activeQuestionCount);
  const needed = Math.ceil((asked * (Number(pass) || 0)) / 100);

  const save = useMutation({
    mutationFn: () => api(`/admin/streams/${stream.id}`, { method: "PATCH", body: { questionsPerTest: Number(perTest), passPercent: Number(pass) } }),
    onSuccess: () => { toast.success("Test settings saved"); onSaved(); },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>The test</CardTitle>
        <CardDescription>Each doctor gets a fresh set of questions, picked at random from the ones in use below.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <div className="grid gap-1.5">
            <Label htmlFor="per-test">Questions in each test</Label>
            <Input id="per-test" required type="number" inputMode="numeric" min={1} max={100} step={1} className="h-9 w-40" value={perTest} onChange={(e) => setPerTest(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pass-mark">Pass mark (%)</Label>
            <Input id="pass-mark" required type="number" inputMode="numeric" min={1} max={100} step={1} className="h-9 w-40" value={pass} onChange={(e) => setPass(e.target.value)} />
          </div>
          <Button type="submit" className="h-9" loading={save.isPending} disabled={!changed}>Save
          </Button>
          {asked > 0 ? <p className="basis-full text-xs text-muted-foreground">A doctor is asked {asked} {asked === 1 ? "question" : "questions"} and passes with {needed} or more right.</p> : null}
        </form>
        <dl className="grid grid-cols-2 gap-3 border-t pt-4 text-sm sm:grid-cols-4">
          <div><dt className="text-xs text-muted-foreground">Questions in use</dt><dd className="mt-0.5 font-medium ledger">{formatNumber(stream.activeQuestionCount)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Switched off</dt><dd className="mt-0.5 ledger">{formatNumber(stream.questionCount - stream.activeQuestionCount)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Doctors in this stream</dt><dd className="mt-0.5 ledger">{formatNumber(stream.doctorCount)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Passed the test</dt><dd className="mt-0.5 ledger">{formatNumber(stream.passedCount)}</dd></div>
        </dl>
      </CardContent>
    </Card>
  );
}

function QuestionsView() {
  const { id } = useParams<{ id: string }>();
  const url = useUrlState();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<StreamQuestion | null>(null);
  const [pasting, setPasting] = useState<string | null>(null);
  const [pasteFor, setPasteFor] = useState("");

  const filters = { q: url.get("q"), active: url.get("active"), specialization: url.get("specialization") };
  const { data, isPending, isError } = useQuery({
    queryKey: ["stream-questions", Number(id), filters],
    queryFn: () => api<QuestionList>(`/admin/streams/${id}/questions`, { query: filters }),
    placeholderData: (previous) => previous,
  });
  const questionIds = useMemo(() => (data?.items ?? []).map((question) => question.id), [data]);
  const selection = useSelection(questionIds);
  const refresh = () => ["stream-questions", "streams", "doctor", "doctor-onboarding"].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
  const failed = (err: Error) => toast.error(err.message);

  const save = useMutation({
    mutationFn: (d: Draft) =>
      api(d.id ? `/admin/streams/${id}/questions/${d.id}` : `/admin/streams/${id}/questions`, {
        method: d.id ? "PATCH" : "POST",
        body: { question: d.question, options: d.options.map((option) => option.trim()), correctIndex: d.correctIndex, explanation: d.explanation, isActive: d.isActive, specializationId: d.specializationId || null },
      }),
    onSuccess: (_r, d) => { toast.success(d.id ? "Question updated" : "Question added"); setDraft(null); refresh(); },
    onError: failed,
  });
  const flip = useMutation({
    mutationFn: (input: { question: StreamQuestion; isActive: boolean }) => api(`/admin/streams/${id}/questions/${input.question.id}`, { method: "PATCH", body: { isActive: input.isActive } }),
    onSuccess: (_r, input) => { toast.success(input.isActive ? "Question is in use again" : "Question switched off"); refresh(); },
    onError: failed,
  });
  const remove = useMutation({
    mutationFn: (question: StreamQuestion) => api(`/admin/streams/${id}/questions/${question.id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Question deleted"); setDeleting(null); refresh(); },
    onError: failed,
  });
  const pasted = useMemo(() => readPasted(pasting ?? ""), [pasting]);
  const addPasted = useMutation({
    mutationFn: () => api<{ created: number }>(`/admin/streams/${id}/questions/bulk`, { method: "POST", body: { questions: pasted.questions, specializationId: pasteFor || null } }),
    onSuccess: (result) => { toast.success(`${formatNumber(result.created)} ${result.created === 1 ? "question" : "questions"} added`); setPasting(null); refresh(); },
    onError: failed,
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    if (draft.options.some((option) => option.trim() === "")) return toast.error("Fill in every answer option, or remove the empty ones");
    if (draft.correctIndex < 0 || draft.correctIndex >= draft.options.length) return toast.error("Choose the right answer");
    save.mutate(draft);
  };
  const removeOption = (index: number) =>
    setDraft((current) => current && ({
      ...current,
      options: current.options.filter((_, i) => i !== index),
      // the right answer keeps pointing at the same option; removing it leaves none chosen
      correctIndex: current.correctIndex === index ? -1 : current.correctIndex > index ? current.correctIndex - 1 : current.correctIndex,
    }));

  if (isError) return <p className="py-16 text-center text-sm text-muted-foreground">This stream could not be found.</p>;
  if (isPending || !data) return <div className="grid gap-4"><Skeleton className="h-16" /><Skeleton className="h-40" /><Skeleton className="h-64" /></div>;

  const { stream, items, specializations } = data;
  const filtered = Boolean(filters.q || filters.active || filters.specialization);
  const nameOf = new Map(specializations.map((s) => [s.id, s.name]));
  // the select that says who a question is for, shared by the add, edit and paste dialogs
  const forWhom = (value: string, onChange: (value: string) => void, id?: string) => (
    <Select value={value || "general"} onValueChange={(v) => onChange(v === "general" ? "" : v)}>
      <SelectTrigger id={id} className="h-9 w-full"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="general">Every doctor in {stream.name}</SelectItem>
        {specializations.map((s) => <SelectItem key={s.id} value={String(s.id)}>Only {s.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
  const short = stream.activeQuestionCount > 0 && stream.activeQuestionCount < stream.questionsPerTest;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Back to consulting streams"><Link href="/admin/streams"><ArrowLeft /></Link></Button>
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight">
            {stream.name}
            <StatusBadge status={STREAM_STATUS[stream.status].tone} label={STREAM_STATUS[stream.status].label} />
            {stream.isActive ? null : <StatusBadge status="ARCHIVED" label="Switched off" />}
          </h1>
          <p className="truncate text-sm text-muted-foreground">Its specializations, and the test questions a doctor is asked after their documents are verified</p>
        </div>
        <Button variant="outline" className="h-9" onClick={() => setPasting("")}><ClipboardPaste /> Paste several</Button>
        <Button className="h-9" onClick={() => setDraft(emptyDraft)}><Plus /> Add question</Button>
      </div>

      <div className="grid gap-4">
        {stream.activeQuestionCount === 0 ? (
          <div className="flex items-start gap-2 rounded-lg bg-info/12 p-3 text-sm">
            <Info className="mt-0.5 size-4 shrink-0 text-info" />
            <p>
              <span className="font-medium">This stream has no questions in use, so there is no test.</span>{" "}
              Its doctors skip this step and can start consulting as soon as their documents are verified. Add questions below to bring the test in.
            </p>
          </div>
        ) : short ? (
          <div className="flex items-start gap-2 rounded-lg bg-warning/15 p-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
            <p>
              <span className="font-medium">Only {formatNumber(stream.activeQuestionCount)} {stream.activeQuestionCount === 1 ? "question is" : "questions are"} in use, but a test asks {stream.questionsPerTest}.</span>{" "}
              Until you add {formatNumber(stream.questionsPerTest - stream.activeQuestionCount)} more, every doctor gets the same {stream.activeQuestionCount === 1 ? "question" : `${stream.activeQuestionCount} questions`}. Add more, or lower &quot;Questions in each test&quot;.
            </p>
          </div>
        ) : null}

        <StreamSpecializations streamId={stream.id} items={specializations} onChanged={refresh} />

        <TestSettings key={`${stream.questionsPerTest}-${stream.passPercent}`} stream={stream} onSaved={refresh} />

        <SectionCard flush>
          <div className="flex flex-wrap items-center gap-2 border-b border-foreground/18 bg-surface-2 px-3 py-2">
            <SearchInput value={filters.q} onChange={(q) => url.set({ q })} placeholder="Search the questions" className="w-full sm:w-72" />
            <Select value={filters.active || "all"} onValueChange={(v) => url.set({ active: v === "all" ? "" : v })}>
              <SelectTrigger className="h-9 w-44" aria-label="Show"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All questions</SelectItem>
                <SelectItem value="yes">In use</SelectItem>
                <SelectItem value="no">Switched off</SelectItem>
              </SelectContent>
            </Select>
            {specializations.length ? (
              <Select value={filters.specialization || "all"} onValueChange={(v) => url.set({ specialization: v === "all" ? "" : v })}>
                <SelectTrigger className="h-9 w-56" aria-label="Asked of"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Asked of anyone</SelectItem>
                  <SelectItem value="general">General questions</SelectItem>
                  {specializations.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : null}
            {url.hasAny ? <Button variant="ghost" className="h-9" onClick={url.clear}>Clear filters</Button> : null}
            {items.length ? <SelectAll selection={selection} noun="questions" className="ml-auto" /> : null}
            <BulkActions table={`streams/${stream.id}/questions`} noun="questions" selection={selection} exportable={false} refresh={["stream-questions", "streams", "doctor", "doctor-onboarding"]} deleteNote="If no question is left in use, the stream has no test." className="ml-0" />
            <span className={cn("text-sm text-muted-foreground ledger", items.length ? "" : "ml-auto")}>{filtered ? `${formatNumber(items.length)} of ${formatNumber(stream.questionCount)}` : formatNumber(stream.questionCount)} {stream.questionCount === 1 ? "question" : "questions"}</span>
          </div>

          {items.length === 0 ? (
            <EmptyState
              icon={ListChecks}
              title={filtered ? "No questions match" : "No questions yet"}
              description={filtered ? "Try a different search, or clear the filters." : "Add the first question, or paste a set you have already prepared."}
            />
          ) : (
            <ol className="divide-y">
              {items.map((question, index) => {
                const busy = flip.isPending && flip.variables?.question.id === question.id;
                return (
                  <li key={question.id} className={cn("grid grid-cols-[auto_1fr] gap-3 p-4 sm:grid-cols-[auto_1fr_auto]", !question.isActive && "bg-muted/30", selection.has(question.id) && "bg-muted")}>
                    <span className="mt-0.5"><SelectRow selection={selection} id={question.id} label={`question ${index + 1}`} /></span>
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-start gap-2 font-medium">
                        <span className="text-muted-foreground ledger">{index + 1}.</span>
                        <span className={cn("min-w-0 flex-1 break-words whitespace-pre-line", !question.isActive && "text-muted-foreground")}>{question.question}</span>
                        {question.specializationId ? <LabelTag tone="terracotta">{nameOf.get(question.specializationId) ?? "Specialization"}</LabelTag> : specializations.length ? <LabelTag tone="neutral">General</LabelTag> : null}
                        {question.isActive ? null : <StatusBadge status="ARCHIVED" label="Switched off" />}
                      </p>
                      <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                        {question.options.map((option, i) => {
                          const right = i === question.correctIndex;
                          return (
                            <li key={i} className={cn("flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-sm", right ? "border-success/40 bg-success/12" : "text-muted-foreground")}>
                              <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-medium", right ? "bg-success text-white" : "bg-muted")}>
                                {right ? <Check className="size-3" /> : optionLetter(i)}
                              </span>
                              <span className={cn("min-w-0 flex-1 break-words", right && "font-medium text-foreground")}>{option}</span>
                              {right ? <span className="shrink-0 text-xs font-medium text-success">Right answer</span> : null}
                            </li>
                          );
                        })}
                      </ul>
                      {question.explanation ? <p className="mt-2 text-xs whitespace-pre-line text-muted-foreground"><span className="font-medium">Why:</span> {question.explanation}</p> : null}
                    </div>
                    <div className="col-start-2 flex items-start gap-1 sm:col-start-3 sm:justify-end">
                      <label className="mr-1 flex h-7 items-center gap-2 text-sm">
                        {busy ? <Spinner size="md" /> : (
                          <Checkbox checked={question.isActive} disabled={flip.isPending} onCheckedChange={(checked) => flip.mutate({ question, isActive: checked === true })} />
                        )}
                        In use
                      </label>
                      <Button variant="ghost" size="icon-sm" aria-label={`Edit question ${index + 1}`} onClick={() => setDraft({ id: question.id, question: question.question, options: question.options, correctIndex: question.correctIndex, explanation: question.explanation ?? "", isActive: question.isActive, specializationId: question.specializationId ? String(question.specializationId) : "" })}><Pencil /></Button>
                      <Button variant="ghost" size="icon-sm" aria-label={`Delete question ${index + 1}`} onClick={() => setDeleting(question)}><Trash2 /></Button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </SectionCard>
      </div>

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit question" : "Add question"}</DialogTitle>
            <DialogDescription>Type the question and its answer options, then choose the one that is right.</DialogDescription>
          </DialogHeader>
          {draft ? (
            <form id="question-form" className="grid gap-4" onSubmit={submit}>
              <div className="grid gap-1.5">
                <Label htmlFor="question-text">Question</Label>
                <Textarea id="question-text" required autoFocus rows={3} maxLength={1000} value={draft.question} onChange={(e) => setDraft({ ...draft, question: e.target.value })} />
              </div>

              <fieldset className="grid gap-2">
                <legend className="mb-1.5 text-sm font-medium">Answer options <span className="font-normal text-muted-foreground">({MIN_OPTIONS} to {MAX_OPTIONS}; choose the right one)</span></legend>
                {draft.options.map((option, index) => (
                  <div key={index} className={cn("flex items-center gap-2 rounded-lg border p-1.5 pl-2.5", draft.correctIndex === index && "border-success/40 bg-success/12")}>
                    <input
                      type="radio" name="right-answer" required className="size-4 shrink-0 accent-primary" aria-label={`Option ${optionLetter(index)} is the right answer`}
                      checked={draft.correctIndex === index} onChange={() => setDraft({ ...draft, correctIndex: index })}
                    />
                    <span className="w-4 shrink-0 text-center text-sm text-muted-foreground">{optionLetter(index)}</span>
                    <Input
                      required maxLength={300} aria-label={`Option ${optionLetter(index)}`} placeholder={`Option ${optionLetter(index)}`} className="h-8 flex-1 bg-background"
                      value={option} onChange={(e) => setDraft({ ...draft, options: draft.options.map((o, i) => (i === index ? e.target.value : o)) })}
                    />
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove option ${optionLetter(index)}`} disabled={draft.options.length <= MIN_OPTIONS} onClick={() => removeOption(index)}><X /></Button>
                  </div>
                ))}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={draft.options.length >= MAX_OPTIONS} onClick={() => setDraft({ ...draft, options: [...draft.options, ""] })}><Plus /> Add option</Button>
                  <p className="text-xs text-muted-foreground">{draft.correctIndex >= 0 ? `Right answer: option ${optionLetter(draft.correctIndex)}` : "Select the circle next to the right answer."}</p>
                </div>
              </fieldset>

              <div className="grid gap-1.5">
                <Label htmlFor="question-why">Why this is right <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Textarea id="question-why" rows={2} maxLength={1000} placeholder="A short note for your team. Doctors do not see it during the test." value={draft.explanation} onChange={(e) => setDraft({ ...draft, explanation: e.target.value })} />
              </div>
              {specializations.length ? (
                <div className="grid gap-1.5">
                  <Label htmlFor="question-for">Who is asked this?</Label>
                  {forWhom(draft.specializationId, (specializationId) => setDraft({ ...draft, specializationId }), "question-for")}
                  <p className="text-xs text-muted-foreground">A doctor&apos;s test mixes the general questions with those of their own specialization.</p>
                </div>
              ) : null}
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={draft.isActive} onCheckedChange={(checked) => setDraft({ ...draft, isActive: checked === true })} />
                Use this question in tests
              </label>
            </form>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
            <Button type="submit" form="question-form" loading={save.isPending}>{draft?.id ? "Save changes" : "Add question"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pasting !== null} onOpenChange={(open) => !open && setPasting(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Paste several questions</DialogTitle>
            <DialogDescription>
              Leave an empty line between questions. Put the question on the first line and one answer option on each line under it, with a * in front of the right answer.
            </DialogDescription>
          </DialogHeader>
          {specializations.length ? <div className="grid gap-1.5"><Label>Who are these questions for?</Label>{forWhom(pasteFor, setPasteFor)}</div> : null}
          <Textarea rows={12} autoFocus className="font-mono text-sm" placeholder={PASTE_EXAMPLE} value={pasting ?? ""} onChange={(e) => setPasting(e.target.value)} />
          {pasted.problem ? (
            <p className="flex items-start gap-2 text-sm text-destructive"><TriangleAlert className="mt-0.5 size-4 shrink-0" /> {pasted.problem}</p>
          ) : pasted.questions.length > 0 ? (
            <p className="flex items-start gap-2 text-sm text-success"><Check className="mt-0.5 size-4 shrink-0" /> {formatNumber(pasted.questions.length)} {pasted.questions.length === 1 ? "question is" : "questions are"} ready to add. You can edit each one afterwards.</p>
          ) : (
            <p className="text-sm text-muted-foreground">Numbering such as &quot;1.&quot; in front of a question, or &quot;a)&quot;, &quot;b)&quot; in front of its options, is removed for you.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasting(null)}>Cancel</Button>
            <Button disabled={pasted.problem !== null || pasted.questions.length === 0 || addPasted.isPending} onClick={() => addPasted.mutate()}>
              {addPasted.isPending ? <ButtonSpinner /> : null}{pasted.questions.length > 1 && !pasted.problem ? `Add ${formatNumber(pasted.questions.length)} questions` : "Add questions"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this question?</DialogTitle>
            <DialogDescription>
              &quot;{deleting && deleting.question.length > 140 ? `${deleting.question.slice(0, 140)}…` : deleting?.question}&quot; will no longer be asked. This cannot be undone. To keep it for later, switch it off instead.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="destructive" disabled={!deleting || remove.isPending} onClick={() => deleting && remove.mutate(deleting)}>
              {remove.isPending ? <ButtonSpinner /> : null}Delete question
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function StreamQuestionsPage() {
  return (
    <Suspense>
      <QuestionsView />
    </Suspense>
  );
}
