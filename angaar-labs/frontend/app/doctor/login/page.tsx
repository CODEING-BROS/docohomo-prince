"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Callout } from "@/components/custom/callout";
import { FormField, PasswordField } from "@/components/custom/form-field";
import { AuthFrame } from "@/components/doctor/auth-frame";
import { PhoneLogin } from "@/components/doctor/phone-login";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type SiteUser, useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";
import { goFresh } from "@/lib/navigate";

// while developing, the demo doctor from .env.local is filled in for you
// also in the fast (built) version on a developer's own computer, when .env.local says so; never on the live server
const DEV = process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_DEMO_LOGINS === "true";
const DEV_LOGIN = (DEV && process.env.NEXT_PUBLIC_DEV_DOCTOR_LOGIN) || "";
const DEV_PASSWORD = (DEV && process.env.NEXT_PUBLIC_DEV_DOCTOR_PASSWORD) || "";

export default function DoctorLoginPage() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const [withCode, setWithCode] = useState(false);
  const [identifier, setIdentifier] = useState(DEV_LOGIN);
  const [password, setPassword] = useState(DEV_PASSWORD);

  // a registered doctor goes to the dashboard; anyone else finishes the registration first
  const enter = (signedIn: SiteUser) => goFresh(signedIn.doctor ? "/doctor" : "/doctor/register");
  useEffect(() => {
    if (user) goFresh(user.doctor ? "/doctor" : "/doctor/register"); // already signed in
  }, [user]);

  const signIn = useMutation({
    mutationFn: () => api<{ user: SiteUser }>("/auth/password-login", { method: "POST", body: { identifier, password } }),
    onSuccess: ({ user: signedIn }) => {
      queryClient.clear(); // nothing from an earlier sign-in may be shown to this person
      queryClient.setQueryData(["session"], signedIn);
      enter(signedIn);
    },
  });

  return (
    <AuthFrame
      title="Welcome back, doctor"
      description={withCode ? "Enter your registered mobile number. We will send you a code to sign in." : "Sign in to your dashboard."}
      footer={<>New to DocHomoeo? <Link href="/doctor/signup" className="font-medium text-primary underline-offset-4 hover:underline">Create your doctor account</Link></>}
    >
      {withCode ? (
        <>
          <PhoneLogin mustExist onSignedIn={enter} />
          <p className="mt-4 text-xs text-muted-foreground">Forgot your password? Sign in with a code, then set a new one under Profile.</p>
          <Button variant="link" className="mt-3 px-0" onClick={() => setWithCode(false)}>Sign in with your password instead</Button>
        </>
      ) : (
        <form className="grid gap-5" onSubmit={(e) => { e.preventDefault(); if (!signIn.isPending && !signIn.isSuccess) signIn.mutate(); }}>
          <FormField label="Mobile number or email">
            {(id) => <Input id={id} required autoFocus autoComplete="username" className="h-10" placeholder="98765 43210" value={identifier} onChange={(e) => setIdentifier(e.target.value)} />}
          </FormField>
          <FormField label={<span className="flex w-full items-center justify-between">Password <button type="button" className="text-xs font-medium text-primary underline-offset-4 hover:underline" onClick={() => setWithCode(true)}>Forgot password?</button></span>}>
            {(id) => <PasswordField id={id} required value={password} onChange={(e) => setPassword(e.target.value)} />}
          </FormField>
          {signIn.error ? <Callout tone="danger" compact>{signIn.error.message}</Callout> : null}
          <Button type="submit" size="lg" loading={signIn.isPending} disabled={signIn.isSuccess}>Sign in</Button>
          <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-foreground/18" />or<span className="h-px flex-1 bg-foreground/18" /></div>
          <Button type="button" variant="outline" size="lg" onClick={() => setWithCode(true)}>Sign in with a one-time code</Button>
        </form>
      )}
    </AuthFrame>
  );
}
