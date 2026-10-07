"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ClipboardList, Lock, Package, Video } from "lucide-react";
import { useEffect, useState } from "react";
import { AuthFrame } from "@/components/custom/auth-frame";
import { Callout } from "@/components/custom/callout";
import { FilterChips } from "@/components/custom/filter-chips";
import { FormField, OtpField, PasswordField, PhoneField } from "@/components/custom/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type SiteUser, useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";
import { goFresh } from "@/lib/navigate";

// while developing, the demo patient and the test code from .env.local are filled in for you
// also in the fast (built) version on a developer's own computer, when .env.local says so; never on the live server
const DEV = process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_DEMO_LOGINS === "true";
const DEV_LOGIN = (DEV && process.env.NEXT_PUBLIC_DEV_PATIENT_LOGIN) || "";
const DEV_PASSWORD = (DEV && process.env.NEXT_PUBLIC_DEV_PATIENT_PASSWORD) || "";
const DEV_CODE = (DEV && process.env.NEXT_PUBLIC_DEV_OTP) || "";

const ASIDE = {
  headline: "Your doctor, your medicines, your records: one place.",
  illustration: "welcome" as const,
  points: [
    { icon: Video, text: "Consult a homeopath by video or phone, at a time that suits you." },
    { icon: ClipboardList, text: "Prescriptions are saved to your account, ready to reorder." },
    { icon: Package, text: "Follow every order with tracking, invoices and easy returns." },
  ],
  note: "Your health details are private and only shared with the doctor you consult.",
};

export default function PatientLoginPage() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const [way, setWay] = useState<"code" | "password">(DEV_PASSWORD ? "password" : "code");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [identifier, setIdentifier] = useState(DEV_LOGIN);
  const [password, setPassword] = useState(DEV_PASSWORD);

  useEffect(() => {
    if (user) goFresh("/patient"); // already signed in
  }, [user]);

  const enter = () => {
    queryClient.clear(); // nothing from an earlier sign-in may be shown to this person
    goFresh("/patient");
  };
  const request = useMutation({
    mutationFn: () => api<{ testMode: boolean }>("/auth/otp/request", { method: "POST", body: { phone } }),
    onSuccess: (result) => { setSent(true); setTestMode(result.testMode); setCode(result.testMode ? DEV_CODE : ""); },
  });
  const verify = useMutation({ mutationFn: () => api<{ user: SiteUser }>("/auth/otp/verify", { method: "POST", body: { phone, code } }), onSuccess: enter });
  const signIn = useMutation({ mutationFn: () => api<{ user: SiteUser }>("/auth/password-login", { method: "POST", body: { identifier, password } }), onSuccess: enter });
  const error = way === "password" ? signIn.error?.message : (sent ? verify.error : request.error)?.message;

  const startOver = () => { setSent(false); setCode(""); verify.reset(); request.reset(); };
  const choose = (next: string) => { setWay(next as "code" | "password"); startOver(); signIn.reset(); };

  return (
    <AuthFrame
      panel="patient"
      title={sent ? "Enter the code" : "Welcome"}
      description={sent ? <>We sent a 6-digit code to <span className="font-medium text-foreground">+91 {phone}</span>.</> : "Sign in to see your consultations, prescriptions and orders."}
      aside={ASIDE}
      footer={
        <div className="space-y-3">
          <p className="flex items-center gap-1.5 text-xs"><Lock className="size-3.5" /> Your health details are private and only shared with the doctor you consult.</p>
          <p>Are you a doctor? <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" onClick={() => goFresh("/doctor/login")}>Doctor sign-in</button></p>
        </div>
      }
    >
      {!sent ? (
        <FilterChips
          variant="segmented" scrollable={false} ariaLabel="How to sign in" value={way} onChange={choose} size="md" className="mb-6"
          options={[{ value: "code", label: "Mobile number" }, { value: "password", label: "Password" }]}
        />
      ) : null}

      {way === "code" && !sent ? (
        <form className="grid gap-5" onSubmit={(e) => { e.preventDefault(); if (!request.isPending && phone.length === 10) request.mutate(); }}>
          <FormField label="Your mobile number" hint="We send a code by SMS. New here? This also creates your account, there is no form to fill.">
            {(id) => <PhoneField id={id} value={phone} onChange={setPhone} autoFocus required pattern="[6-9][0-9]{9}" title="A 10-digit mobile number" />}
          </FormField>
          {error ? <Callout tone="danger" compact>{error}</Callout> : null}
          <Button type="submit" size="lg" loading={request.isPending} disabled={phone.length !== 10} className="bg-terracotta text-terracotta-foreground not-disabled:hover:bg-terracotta/90">
            Get the code <ArrowRight data-icon="inline-end" />
          </Button>
        </form>
      ) : null}

      {way === "code" && sent ? (
        <form className="grid gap-5" onSubmit={(e) => { e.preventDefault(); if (!verify.isPending && !verify.isSuccess && code.length >= 4) verify.mutate(); }}>
          <OtpField value={code} onChange={setCode} autoFocus disabled={verify.isPending || verify.isSuccess} />
          {testMode ? <p className="text-center text-xs text-muted-foreground">Test mode: no text message is sent. The test code is filled in for you.</p> : null}
          {error ? <Callout tone="danger" compact>{error}</Callout> : null}
          <Button type="submit" size="lg" loading={verify.isPending || verify.isSuccess} disabled={code.length < 4} className="bg-terracotta text-terracotta-foreground not-disabled:hover:bg-terracotta/90">Sign in</Button>
          <div className="flex items-center justify-between text-sm">
            <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={startOver}><ArrowLeft data-icon="inline-start" /> Change number</Button>
            <Button type="button" variant="link" size="sm" disabled={request.isPending} onClick={() => { setCode(""); verify.reset(); request.mutate(); }}>
              {request.isPending ? "Sending…" : "Send the code again"}
            </Button>
          </div>
        </form>
      ) : null}

      {way === "password" ? (
        <form className="grid gap-5" onSubmit={(e) => { e.preventDefault(); if (!signIn.isPending && !signIn.isSuccess) signIn.mutate(); }}>
          <FormField label="Mobile number or email">
            {(id) => <Input id={id} required autoFocus autoComplete="username" className="h-10" placeholder="98765 43210" value={identifier} onChange={(e) => setIdentifier(e.target.value)} />}
          </FormField>
          <FormField label={<span className="flex w-full items-center justify-between">Password <button type="button" className="text-xs font-medium text-primary underline-offset-4 hover:underline" onClick={() => choose("code")}>Forgot it? Use a code</button></span>}>
            {(id) => <PasswordField id={id} required value={password} onChange={(e) => setPassword(e.target.value)} />}
          </FormField>
          {error ? <Callout tone="danger" compact>{error}</Callout> : null}
          <Button type="submit" size="lg" loading={signIn.isPending || signIn.isSuccess} className="bg-terracotta text-terracotta-foreground not-disabled:hover:bg-terracotta/90">Sign in</Button>
          <p className="text-center text-xs text-muted-foreground">No password yet? Sign in with your mobile number, then set one under My details.</p>
        </form>
      ) : null}
    </AuthFrame>
  );
}
