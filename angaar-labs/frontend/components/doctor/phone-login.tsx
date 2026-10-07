"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useState } from "react";
import { Callout } from "@/components/custom/callout";
import { FormField, OtpField, PhoneField } from "@/components/custom/form-field";
import { Button } from "@/components/ui/button";
import type { SiteUser } from "@/hooks/use-session";
import { api } from "@/lib/api";

// while developing, the test code from .env.local is filled in for you
const DEV_CODE = (process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_DEV_OTP) || "";

/** Mobile number, then the code sent to it. There are no passwords to remember. */
export function PhoneLogin({ onSignedIn, mustExist = false }: { onSignedIn: (user: SiteUser) => void; mustExist?: boolean }) {
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [testMode, setTestMode] = useState(false);

  const request = useMutation({
    mutationFn: () => api<{ testMode: boolean }>("/auth/otp/request", { method: "POST", body: { phone, mustExist } }),
    onSuccess: (result) => {
      setSent(true);
      setTestMode(result.testMode);
      if (result.testMode) setCode(DEV_CODE);
    },
  });
  const verify = useMutation({
    mutationFn: () => api<{ user: SiteUser }>("/auth/otp/verify", { method: "POST", body: { phone, code } }),
    onSuccess: ({ user }) => {
      queryClient.clear(); // nothing from an earlier sign-in may be shown to this person
      queryClient.setQueryData(["session"], user);
      onSignedIn(user);
    },
  });
  const error = (sent ? verify.error : request.error)?.message;

  if (sent) {
    return (
      <form className="grid gap-5" onSubmit={(e) => { e.preventDefault(); if (!verify.isPending && !verify.isSuccess) verify.mutate(); }}>
        <FormField label={`Enter the code sent to +91 ${phone}`} hint={testMode ? "Test mode: no text message is sent yet. The test code is filled in for you." : undefined}>
          <OtpField value={code} onChange={setCode} autoFocus />
        </FormField>
        {error ? <Callout tone="danger" compact>{error}</Callout> : null}
        <Button type="submit" size="lg" loading={verify.isPending} disabled={verify.isSuccess || code.length < 4}>Sign in</Button>
        <Button type="button" variant="ghost" className="text-muted-foreground" onClick={() => { setSent(false); setCode(""); verify.reset(); }}>
          <ArrowLeft data-icon="inline-start" /> Use a different number
        </Button>
      </form>
    );
  }

  return (
    <form className="grid gap-5" onSubmit={(e) => { e.preventDefault(); if (!request.isPending) request.mutate(); }}>
      <FormField label="Mobile number">{(id) => <PhoneField id={id} value={phone} onChange={setPhone} autoFocus required pattern="[6-9][0-9]{9}" title="A 10-digit mobile number" />}</FormField>
      {error ? <Callout tone="danger" compact>{error}</Callout> : null}
      <Button type="submit" size="lg" loading={request.isPending} disabled={phone.length !== 10}>Send me a code <ArrowRight data-icon="inline-end" /></Button>
    </form>
  );
}
