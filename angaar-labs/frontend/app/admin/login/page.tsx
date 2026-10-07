"use client";

import { BarChart3, Boxes, ShoppingCart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthFrame } from "@/components/custom/auth-frame";
import { Callout } from "@/components/custom/callout";
import { FormField, PasswordField } from "@/components/custom/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

// On a developer's machine the form starts filled in from .env.local, so there is nothing to type.
// Also in the fast (built) version on a developer's own computer, when .env.local says so; never on the live server.
const isDev = process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_DEMO_LOGINS === "true";
const DEV_EMAIL = (isDev && process.env.NEXT_PUBLIC_DEV_LOGIN_EMAIL) || "";
const DEV_PASSWORD = (isDev && process.env.NEXT_PUBLIC_DEV_LOGIN_PASSWORD) || "";

const ASIDE = {
  headline: "The shop, the clinic and the books, in one ledger.",
  illustration: "inventory" as const,
  points: [
    { icon: ShoppingCart, text: "Orders confirm, invoice and ship themselves; you pack and press one button." },
    { icon: Boxes, text: "Stock moves with every sale and return; the low-stock list arrives each morning." },
    { icon: BarChart3, text: "Daily, weekly and monthly reports land in your inbox." },
  ],
  note: "Staff accounts are given by the owner under Staff and roles.",
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState(DEV_EMAIL);
  const [password, setPassword] = useState(DEV_PASSWORD);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/auth/login", { method: "POST", body: { email, password } });
      router.replace("/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
      setBusy(false);
    }
  };

  return (
    <AuthFrame panel="admin" title="Welcome back" description="Sign in with your staff email and password." aside={ASIDE}>
      <form onSubmit={signIn} className="grid gap-5">
        <FormField label="Email">
          {(id) => <Input id={id} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-10" placeholder="you@dochomoeo.com" />}
        </FormField>
        <FormField label="Password">
          {(id) => <PasswordField id={id} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" />}
        </FormField>
        {error ? <Callout tone="danger" compact>{error}</Callout> : null}
        <Button type="submit" size="lg" loading={busy}>Sign in</Button>
      </form>
    </AuthFrame>
  );
}
