"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, KeyRound, LogOut } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/parts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { type SiteUser, useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";
import { goFresh } from "@/lib/navigate";

function Details({ user }: { user: SiteUser }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ firstName: user.firstName ?? "", lastName: user.lastName ?? "", email: user.email ?? "", gender: user.gender ?? "", dateOfBirth: user.dateOfBirth ?? "" });
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const save = useMutation({
    mutationFn: () => api("/me/profile", { method: "PATCH", body: form }),
    onSuccess: () => { toast.success("Your details are saved"); queryClient.invalidateQueries({ queryKey: ["session"] }); },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Card>
      <CardHeader><CardTitle>About you</CardTitle><CardDescription>Used on your bookings, prescriptions and parcels. Your date of birth and gender fill in the booking form for you.</CardDescription></CardHeader>
      <CardContent>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); if (!save.isPending) save.mutate(); }}>
          <div className="grid gap-1.5"><Label htmlFor="me-first">First name</Label><Input id="me-first" required maxLength={80} autoComplete="given-name" className="h-9" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></div>
          <div className="grid gap-1.5"><Label htmlFor="me-last">Last name</Label><Input id="me-last" maxLength={80} autoComplete="family-name" className="h-9" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></div>
          <div className="grid gap-1.5">
            <Label htmlFor="me-phone">Mobile number</Label>
            <Input id="me-phone" disabled className="h-9" value={`+91 ${user.phone ?? ""}`} />
            <p className="text-xs text-muted-foreground">You sign in with this number, so it cannot be changed here.</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="me-email">Email <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id="me-email" type="email" maxLength={160} autoComplete="email" className="h-9" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <p className="text-xs text-muted-foreground">For order updates, invoices and prescriptions.</p>
          </div>
          <div className="grid gap-1.5">
            <Label>Gender</Label>
            <Select value={form.gender} onValueChange={(gender) => setForm({ ...form, gender })}>
              <SelectTrigger className="h-9 w-full"><SelectValue placeholder="Choose" /></SelectTrigger>
              <SelectContent><SelectItem value="FEMALE">Female</SelectItem><SelectItem value="MALE">Male</SelectItem><SelectItem value="OTHER">Other</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5"><Label htmlFor="me-dob">Date of birth</Label><Input id="me-dob" type="date" max={today} className="h-9" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} /></div>
          <Button type="submit" className="h-9 justify-self-start" loading={save.isPending}>Save</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Password({ user }: { user: SiteUser }) {
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [show, setShow] = useState(false);
  const save = useMutation({
    mutationFn: () => api("/auth/password", { method: "POST", body: { password } }),
    onSuccess: () => { toast.success(user.hasPassword ? "Your password is changed" : "Your password is set"); setPassword(""); setAgain(""); queryClient.invalidateQueries({ queryKey: ["session"] }); },
    onError: (err) => toast.error(err.message),
  });
  const mismatch = again.length > 0 && password !== again;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><KeyRound className="size-4" /> Password</CardTitle>
        <CardDescription>
          {user.hasPassword ? "Change the password you sign in with." : "You sign in with a code sent to your mobile. Set a password if you would also like to sign in without waiting for a code."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); if (!mismatch && !save.isPending) save.mutate(); }}>
          <div className="grid gap-1.5">
            <Label htmlFor="pw-new">New password</Label>
            <div className="relative">
              <Input id="pw-new" required minLength={8} maxLength={100} type={show ? "text" : "password"} autoComplete="new-password" className="h-9 pr-10" value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" aria-label={show ? "Hide the password" : "Show the password"} className="absolute top-1/2 right-1.5 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground" onClick={() => setShow(!show)}>
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">At least 8 characters.</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pw-again">Type it again</Label>
            <Input id="pw-again" required type={show ? "text" : "password"} autoComplete="new-password" className="h-9" value={again} onChange={(e) => setAgain(e.target.value)} />
            {mismatch ? <p role="alert" className="text-xs text-destructive">The two passwords are not the same.</p> : null}
          </div>
          <Button type="submit" className="h-9 justify-self-start" loading={save.isPending} disabled={mismatch || password.length < 8}>{user.hasPassword ? "Change password" : "Set password"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function PatientProfilePage() {
  const { user, signOut } = useSession();
  const leave = async () => {
    await signOut();
    goFresh("/patient/login");
  };

  return (
    <>
      <PageHeader title="My details" description="Your name, contact details and how you sign in" />
      {!user ? <Skeleton className="h-72 rounded-xl" /> : (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Details key={user.id} user={user} />
          <div className="grid gap-4">
            <Password user={user} />
            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <div><p className="font-medium">Sign out</p><p className="text-sm text-muted-foreground">On a shared phone or computer, sign out when you are done.</p></div>
                <Button variant="outline" onClick={leave}><LogOut /> Sign out</Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
