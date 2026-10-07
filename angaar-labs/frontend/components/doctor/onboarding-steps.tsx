"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, Clock, X } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import type { Onboarding } from "@/lib/care";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const useOnboarding = () => useQuery({ queryKey: ["doctor-onboarding"], queryFn: () => api<Onboarding>("/doctor/onboarding") });

type StepState = "done" | "current" | "waiting" | "failed";

/**
 * The four steps every doctor goes through before patients can book them:
 * registration, document verification, test questions, consultation panel.
 * The test can be taken straight after registering, while the documents are being checked.
 * Shown on the overview until the last step is done.
 */
export function OnboardingSteps({ data }: { data: Onboarding }) {
  const refused = data.verificationStatus === "REJECTED" || data.verificationStatus === "SUSPENDED";
  const testDone = !data.testRequired || data.testPassed;

  const steps: { title: string; state: StepState; text: string; action?: { href: string; label: string } }[] = [
    { title: "Registration", state: "done", text: data.submittedAt ? `Sent on ${formatDate(data.submittedAt)}` : "Your details are with us" },
    {
      title: "Document verification",
      state: data.verified ? "done" : refused ? "failed" : "current",
      text: data.verified ? (data.verifiedAt ? `Verified on ${formatDate(data.verifiedAt)}` : "Verified")
        : refused ? (data.rejectionReason ?? "Your documents were not accepted. Please contact us.")
        : "Our team is checking your proofs. This usually takes up to two working days.",
    },
    {
      title: "Test questions",
      state: testDone ? "done" : "current",
      text: !data.testRequired ? "No test is needed for your stream right now"
        : data.testPassed ? (data.testPassedAt ? `Passed on ${formatDate(data.testPassedAt)}` : "Passed")
        : `${data.stream?.questionsPerTest} quick questions on ${data.stream?.name}. You need ${data.stream?.passPercent}% to pass. You can take it now.`,
      action: data.testRequired && !data.testPassed ? { href: "/doctor/test", label: "Take the test" } : undefined,
    },
    {
      title: "Consultation panel",
      state: data.consulting ? "done" : data.verified && testDone ? "current" : "waiting",
      text: data.consulting ? "You are open for bookings"
        : data.verified && testDone && !data.streamOpen ? "Our team will switch on your consultation panel shortly."
        : data.verified && testDone ? (data.hasFee ? "Set your working hours so patients can book you." : "Add your consultation fee and working hours to start.")
        : "Opens when your documents are verified and the test is passed",
      action: data.consulting || !(data.verified && testDone) || !data.streamOpen ? undefined
        : data.hasFee ? { href: "/doctor/schedule", label: "Set working hours" } : { href: "/doctor/profile", label: "Add my fee" },
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Getting started</CardTitle>
        <CardDescription>Four steps to your first patient{data.stream ? ` · ${data.stream.name}` : ""}</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-4 lg:grid-cols-4 lg:gap-0">
          {steps.map((step, index) => (
            <li key={step.title} className="relative flex gap-3 lg:flex-col lg:gap-3 lg:pr-5">
              {/* the line joining one step to the next */}
              {index < steps.length - 1 ? <span aria-hidden className={cn("absolute top-4 right-0 left-9 hidden h-0.5 lg:block", step.state === "done" ? "bg-primary" : "bg-border")} /> : null}
              <span className={cn("relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2 bg-background text-sm font-semibold",
                step.state === "done" ? "border-primary bg-primary text-primary-foreground"
                : step.state === "current" ? "border-primary text-primary"
                : step.state === "failed" ? "border-destructive text-destructive" : "border-border text-muted-foreground")}>
                {step.state === "done" ? <Check className="size-4" /> : step.state === "failed" ? <X className="size-4" /> : step.state === "current" ? <Clock className="size-4" /> : index + 1}
              </span>
              <div className="min-w-0">
                <p className={cn("text-sm font-medium", step.state === "waiting" ? "text-muted-foreground" : "")}>{step.title}</p>
                <p className={cn("mt-0.5 text-sm", step.state === "failed" ? "text-destructive" : "text-muted-foreground")}>{step.text}</p>
                {step.action ? <Button asChild size="sm" className="mt-2"><Link href={step.action.href}>{step.action.label} <ArrowRight /></Link></Button> : null}
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
