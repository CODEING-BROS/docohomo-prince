"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Callout } from "@/components/custom/callout";
import { FormField, OtpField, PhoneField } from "@/components/custom/form-field";
import { AuthFrame } from "@/components/doctor/auth-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type SiteUser, useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";
import { goFresh } from "@/lib/navigate";

// while developing, the test code from .env.local is filled in for you
const DEV_CODE = (process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_DEV_OTP) || "";

/** Step one for a new doctor: email and mobile number, confirmed with a code. The registration form follows. */
export default function DoctorSignupPage() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [testMode, setTestMode] = useState(false);

  useEffect(() => {
    if (user) goFresh(user.doctor ? "/doctor" : "/doctor/register"); // already signed in
  }, [user]);

  const sendCode = useMutation({
    mutationFn: () => api<{ testMode: boolean }>("/auth/otp/request", { method: "POST", body: { phone, email } }),
    onSuccess: (result) => {
      setSent(true);
      setTestMode(result.testMode);
      if (result.testMode) setCode(DEV_CODE);
    },
  });
  const create = useMutation({
    mutationFn: () => api<{ user: SiteUser }>("/auth/signup", { method: "POST", body: { phone, email, code } }),
    onSuccess: ({ user: created }) => {
      queryClient.clear();
      goFresh(created.doctor ? "/doctor" : "/doctor/register");
    },
  });
  const error = (sent ? create.error : sendCode.error)?.message;

  return (
    <AuthFrame
      eyebrow="Step 1 of 2"
      title="Join as a doctor"
      description={sent ? <>We sent a code to <span className="font-medium text-foreground">+91 {phone}</span> and <span className="font-medium text-foreground">{email}</span>. Enter it to continue.</>
        : "Joining is free. Start with your email and mobile number; we will send a code to confirm them."}
      footer={<>Already registered? <Link href="/doctor/login" className="font-medium text-primary underline-offset-4 hover:underline">Sign in</Link></>}
    >

      {sent ? (
        <form className="grid gap-5" onSubmit={(e) => { e.preventDefault(); if (!create.isPending && !create.isSuccess) create.mutate(); }}>
          <FormField label="Verification code" hint={testMode ? "Test mode: no message is sent yet. The test code is filled in for you." : undefined}>
            <OtpField value={code} onChange={setCode} autoFocus />
          </FormField>
          {error ? <Callout tone="danger" compact>{error}</Callout> : null}
          <Button type="submit" size="lg" loading={create.isPending} disabled={create.isSuccess || code.length < 4}>Verify and continue <ArrowRight data-icon="inline-end" /></Button>
          <div className="flex items-center justify-between text-sm">
            <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => { setSent(false); setCode(""); create.reset(); }}>
              <ArrowLeft data-icon="inline-start" /> Change email or number
            </Button>
            <Button type="button" variant="link" size="sm" disabled={sendCode.isPending} onClick={() => sendCode.mutate()}>Send the code again</Button>
          </div>
        </form>
      ) : (
        <form className="grid gap-5" onSubmit={(e) => { e.preventDefault(); if (!sendCode.isPending) sendCode.mutate(); }}>
          <FormField label="Email address">{(id) => <Input id={id} required autoFocus type="email" autoComplete="email" className="h-10" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />}</FormField>
          <FormField label="Mobile number">{(id) => <PhoneField id={id} value={phone} onChange={setPhone} required pattern="[6-9][0-9]{9}" title="A 10-digit mobile number" />}</FormField>
          {error ? <Callout tone="danger" compact>{error}</Callout> : null}
          <Button type="submit" size="lg" loading={sendCode.isPending} disabled={phone.length !== 10}>Send verification code <ArrowRight data-icon="inline-end" /></Button>
        </form>
      )}

    </AuthFrame>
  );
}
