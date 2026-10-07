"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CircleCheckBig, CircleX, ClipboardCheck } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/parts";
import { useOnboarding } from "@/components/doctor/onboarding-steps";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ButtonSpinner } from "@/components/custom/loaders";

type Sitting = { attemptId: number; stream: string; passPercent: number; questions: { id: number; question: string; options: string[] }[] };
type Result = { score: number; total: number; passed: boolean; passPercent: number; consultingOn: boolean };

function DoctorTestPage() {
  const queryClient = useQueryClient();
  const justRegistered = useSearchParams().get("welcome") === "1";
  const { data, isPending } = useOnboarding();
  const [sitting, setSitting] = useState<Sitting | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [at, setAt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);

  const refresh = () => ["doctor-onboarding", "doctor-overview", "session"].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
  const start = useMutation({
    mutationFn: () => api<Sitting>("/doctor/test/start", { method: "POST" }),
    onSuccess: (started) => { setSitting(started); setAnswers({}); setAt(0); setResult(null); },
    onError: (err) => toast.error(err.message),
  });
  const submit = useMutation({
    mutationFn: () => api<Result>(`/doctor/test/${sitting!.attemptId}/submit`, { method: "POST", body: { answers } }),
    onSuccess: (marked) => { setResult(marked); setSitting(null); refresh(); },
    onError: (err) => toast.error(err.message),
  });

  if (isPending || !data) return <><PageHeader title="Test questions" /><Skeleton className="h-72 rounded-xl" /></>;

  // ── the result of the sitting just handed in
  if (result) {
    return (
      <>
        <PageHeader title="Test questions" />
        <Card className="mx-auto max-w-xl">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            {result.passed ? <CircleCheckBig className="size-14 text-success" /> : <CircleX className="size-14 text-destructive" />}
            <h2 className="text-xl font-semibold">{result.passed ? "You passed" : "Not passed this time"}</h2>
            <p className="text-3xl font-semibold ledger">{result.score} <span className="text-lg font-normal text-muted-foreground">out of {result.total}</span></p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {result.passed
                ? result.consultingOn ? "Your consultation panel is open. Set your working hours so patients can book you." : "This step is done. Your consultation panel opens as soon as our team has verified your documents."
                : `You need ${result.passPercent}% to pass. You can try again with a fresh set of questions.`}
            </p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              {result.passed
                ? result.consultingOn
                  ? <><Button asChild><Link href="/doctor/schedule">Set working hours <ArrowRight /></Link></Button><Button asChild variant="outline"><Link href="/doctor">Back to overview</Link></Button></>
                  : <Button asChild><Link href="/doctor">Go to my dashboard <ArrowRight /></Link></Button>
                : <><Button disabled={start.isPending} onClick={() => start.mutate()}>{start.isPending ? <ButtonSpinner /> : null}Try again</Button><Button asChild variant="outline"><Link href="/doctor">Later</Link></Button></>}
            </div>
          </CardContent>
        </Card>
      </>
    );
  }

  // ── answering, one question at a time
  if (sitting) {
    const question = sitting.questions[at];
    const answered = Object.keys(answers).length;
    const last = at === sitting.questions.length - 1;
    return (
      <>
        <PageHeader title={`${sitting.stream} test`} description={`Question ${at + 1} of ${sitting.questions.length} · ${sitting.passPercent}% needed to pass`} />
        <div className="mx-auto max-w-2xl">
          <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(answered / sitting.questions.length) * 100}%` }} /></div>
          <Card>
            <CardHeader><CardTitle className="text-lg leading-snug">{question.question}</CardTitle></CardHeader>
            <CardContent className="grid gap-2.5">
              <div role="radiogroup" aria-label="Answers" className="grid gap-2.5">
                {question.options.map((option, index) => {
                  const chosen = answers[String(question.id)] === index;
                  return (
                    <button key={index} type="button" role="radio" aria-checked={chosen} onClick={() => setAnswers({ ...answers, [String(question.id)]: index })}
                      className={cn("flex items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm", chosen ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-surface-2")}>
                      <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold", chosen ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground")}>{String.fromCharCode(65 + index)}</span>
                      {option}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 border-t pt-4">
                <Button variant="ghost" disabled={at === 0} onClick={() => setAt(at - 1)}><ArrowLeft /> Previous</Button>
                {last ? (
                  <Button disabled={submit.isPending || answered < sitting.questions.length} onClick={() => submit.mutate()}>{submit.isPending ? <ButtonSpinner /> : null}Hand in the test</Button>
                ) : (
                  <Button disabled={answers[String(question.id)] === undefined} onClick={() => setAt(at + 1)}>Next <ArrowRight /></Button>
                )}
              </div>
              {last && answered < sitting.questions.length ? <p className="text-center text-xs text-muted-foreground">Answer every question before handing in. {sitting.questions.length - answered} left.</p> : null}
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  // ── before starting
  const canStart = data.testRequired && !data.testPassed && data.triesLeftToday > 0;
  return (
    <>
      <PageHeader title="Test questions" description="A short test on your consulting stream. It is one of the steps before your consultation panel opens." />
      <div className="mx-auto grid max-w-2xl gap-4">
        {justRegistered && data.testRequired && !data.testPassed ? (
          <p className="rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm">
            <span className="font-medium">Your registration is sent.</span> One more thing while our team checks your documents: answer a few questions on {data.stream?.name}.
          </p>
        ) : null}
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary"><ClipboardCheck className="size-7" /></span>
            {data.testPassed ? (
              <><h2 className="text-xl font-semibold">You have passed the test</h2><p className="text-sm text-muted-foreground">Nothing more to do here.</p><Button asChild variant="outline"><Link href="/doctor">Back to overview</Link></Button></>
            ) : !data.testRequired ? (
              <><h2 className="text-xl font-semibold">No test for your stream right now</h2><p className="max-w-sm text-sm text-muted-foreground">You can skip this step.</p><Button asChild variant="outline"><Link href="/doctor">Back to overview</Link></Button></>
            ) : (
              <>
                <h2 className="text-xl font-semibold">{data.stream?.name} test</h2>
                <ul className="grid gap-1 text-sm text-muted-foreground">
                  <li>{data.stream?.questionsPerTest} multiple-choice questions</li>
                  <li>{data.stream?.passPercent}% correct answers needed to pass</li>
                  <li>No time limit. You can try up to 3 times a day.</li>
                </ul>
                <Button className="mt-2 h-10 px-6" disabled={!canStart || start.isPending} onClick={() => start.mutate()}>{start.isPending ? <ButtonSpinner /> : null}Start the test <ArrowRight /></Button>
                {data.triesLeftToday === 0 ? <p className="text-sm text-warning">You have used today&apos;s tries. Please come back tomorrow.</p> : null}
              </>
            )}
          </CardContent>
        </Card>

        {data.attempts.length ? (
          <Card>
            <CardHeader><CardTitle>Earlier tries</CardTitle><CardDescription>Your results so far</CardDescription></CardHeader>
            <CardContent>
              <ul className="divide-y text-sm">
                {data.attempts.map((attempt) => (
                  <li key={attempt.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                    <span className="text-muted-foreground">{formatDateTime(attempt.submittedAt)}</span>
                    <span className="ledger">{attempt.score} out of {attempt.total}</span>
                    <span className={cn("font-medium", attempt.passed ? "text-success" : "text-destructive")}>{attempt.passed ? "Passed" : "Not passed"}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}

export default function Page() {
  return (
    <Suspense>
      <DoctorTestPage />
    </Suspense>
  );
}
