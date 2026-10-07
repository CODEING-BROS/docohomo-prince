"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Crown, Eye, EyeOff, KeyRound, Pencil, Plus, ShieldCheck, Trash2, TriangleAlert, UserCog } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BulkActions, SelectPage, SelectRow, useSelection } from "@/components/admin/bulk";
import { PageHeader, StatusBadge } from "@/components/admin/parts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SectionCard } from "@/components/custom/section-card";
import { ButtonSpinner, Spinner } from "@/components/custom/loaders";

type Area = { key: string; label: string; detail: string };
type Role = { id: number; name: string; description: string | null; permissions: string[]; people: number };
type Staff = {
  id: number; name: string | null; firstName: string | null; lastName: string | null; email: string | null; isOwner: boolean; isActive: boolean;
  lastLoginAt: string | null; role: { id: number; name: string } | null; roleName: string; fullAccess: boolean; fromOldSystem: boolean;
};
type Page = { me: number; staff: Staff[]; roles: Role[]; areas: Area[] };
type Level = "none" | "view" | "manage";

const LEVELS: { value: Level; label: string }[] = [{ value: "none", label: "Cannot see" }, { value: "view", label: "Can see" }, { value: "manage", label: "Can see and change" }];
const levelOf = (permissions: string[], area: string): Level => (permissions.includes(`${area}.manage`) ? "manage" : permissions.includes(`${area}.view`) ? "view" : "none");
const toPermissions = (levels: Record<string, Level>) => Object.entries(levels).flatMap(([area, level]) => (level === "manage" ? [`${area}.view`, `${area}.manage`] : level === "view" ? [`${area}.view`] : []));
/** "Orders, Returns and 3 more" */
const summary = (role: Role, areas: Area[], level: Level) => {
  const names = areas.filter((a) => levelOf(role.permissions, a.key) === level).map((a) => a.label);
  return names.length === 0 ? "Nothing" : names.length <= 4 ? names.join(", ") : `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
};

type PersonDraft = { id: number | null; firstName: string; lastName: string; email: string; password: string; staffRoleId: string; isActive: boolean; isOwner: boolean; isMe: boolean };
type RoleDraft = { id: number | null; name: string; description: string; levels: Record<string, Level>; people: number };

export default function StaffPage() {
  const queryClient = useQueryClient();
  const [person, setPerson] = useState<PersonDraft | null>(null);
  const [role, setRole] = useState<RoleDraft | null>(null);
  const [deleting, setDeleting] = useState<Role | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const { data, isPending, isError, error } = useQuery({ queryKey: ["staff"], queryFn: () => api<Page>("/admin/staff"), retry: false });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["staff"] });
  // the owner and your own account can never be removed, so they cannot be ticked
  const removable = useMemo(() => (data?.staff ?? []).filter((s) => !s.isOwner && s.id !== data?.me).map((s) => s.id), [data]);
  const selection = useSelection(removable);

  const savePerson = useMutation({
    mutationFn: (d: PersonDraft) =>
      api(d.id ? `/admin/staff/${d.id}` : "/admin/staff", {
        method: d.id ? "PATCH" : "POST",
        body: d.id
          ? { firstName: d.firstName, lastName: d.lastName, email: d.email, password: d.password, ...(d.isOwner || d.isMe ? {} : { staffRoleId: d.staffRoleId, isActive: d.isActive }) }
          : { firstName: d.firstName, lastName: d.lastName, email: d.email, password: d.password, staffRoleId: d.staffRoleId },
      }),
    onSuccess: (_r, d) => { toast.success(d.id ? "Saved" : `${d.firstName} can now sign in with this email and password`); setPerson(null); refresh(); },
    onError: (err) => toast.error(err.message),
  });
  const saveRole = useMutation({
    mutationFn: (d: RoleDraft) => api(d.id ? `/admin/staff/roles/${d.id}` : "/admin/staff/roles", { method: d.id ? "PATCH" : "POST", body: { name: d.name, description: d.description, permissions: toPermissions(d.levels) } }),
    onSuccess: (_r, d) => { toast.success(d.id ? `${d.name} role saved. It applies to its ${d.people} staff straight away.` : `${d.name} role added`); setRole(null); refresh(); },
    onError: (err) => toast.error(err.message),
  });
  const removeRole = useMutation({
    mutationFn: (r: Role) => api(`/admin/staff/roles/${r.id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Role deleted"); setDeleting(null); refresh(); },
    onError: (err) => toast.error(err.message),
  });

  if (isError) return <><PageHeader title="Staff and roles" /><p className="py-16 text-center text-sm text-muted-foreground">{error.message}</p></>;
  const areas = data?.areas ?? [];
  const roles = data?.roles ?? [];
  const unassigned = (data?.staff ?? []).filter((s) => !s.isOwner && !s.role && s.isActive);

  const addPerson = () => { setShowPassword(false); setPerson({ id: null, firstName: "", lastName: "", email: "", password: "", staffRoleId: "", isActive: true, isOwner: false, isMe: false }); };
  const editPerson = (s: Staff) => { setShowPassword(false); setPerson({ id: s.id, firstName: s.firstName ?? "", lastName: s.lastName ?? "", email: s.email ?? "", password: "", staffRoleId: s.role ? String(s.role.id) : "", isActive: s.isActive, isOwner: s.isOwner, isMe: s.id === data?.me }); };
  const addRole = () => setRole({ id: null, name: "", description: "", levels: Object.fromEntries(areas.map((a) => [a.key, "none" as Level])), people: 0 });
  const editRole = (r: Role) => setRole({ id: r.id, name: r.name, description: r.description ?? "", levels: Object.fromEntries(areas.map((a) => [a.key, levelOf(r.permissions, a.key)])), people: r.people });

  return (
    <>
      <PageHeader title="Staff and roles" description="Who can sign in to this panel, and what each of them can see and change" />

      {unassigned.length ? (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          <p>
            <span className="font-medium">{unassigned.length} {unassigned.length === 1 ? "account has" : "accounts have"} no role chosen:</span> {unassigned.map((s) => s.name ?? s.email).join(", ")}.{" "}
            {unassigned.some((s) => s.fullAccess) ? "Accounts carried over from the old site keep full access until you give them a role or switch them off." : "Until a role is chosen they can sign in but see nothing."}
          </p>
        </div>
      ) : null}

      <Tabs defaultValue="people" className="gap-4">
        <TabsList>
          <TabsTrigger value="people" className="px-3">People</TabsTrigger>
          <TabsTrigger value="roles" className="px-3">Roles</TabsTrigger>
        </TabsList>

        <TabsContent value="people">
          <SectionCard flush>
            <div className="flex items-center justify-between gap-2 border-b p-3">
              <p className="text-sm text-muted-foreground">Each person signs in with their own email and password.</p>
              <BulkActions table="staff" noun="staff members" selection={selection} exportable={false} refresh={["staff"]} deleteNote="Only accounts that never changed anything are removed. Anyone who has worked in the panel is kept, so the history still shows who did what: switch those off instead." />
              <Button className="h-9" onClick={addPerson} disabled={!data}><Plus /> Add staff member</Button>
            </div>
            {isPending || !data ? (
              <div className="grid gap-2 p-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-10" />)}</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow><TableHead className="w-10 pl-4"><SelectPage selection={selection} noun="staff members" /></TableHead><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Last signed in</TableHead><TableHead>Status</TableHead><TableHead className="w-10 pr-4"><span className="sr-only">Actions</span></TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {data.staff.map((s) => (
                    <TableRow key={s.id} className={cn(!s.isActive && "opacity-60")} data-state={selection.has(s.id) ? "selected" : undefined}>
                      <TableCell className="pl-4">{removable.includes(s.id) ? <SelectRow selection={selection} id={s.id} label={s.name ?? s.email ?? "staff member"} /> : null}</TableCell>
                      <TableCell className="font-medium">
                        {s.name ?? "No name"} {s.id === data.me ? <span className="ml-1 text-xs font-normal text-muted-foreground">(you)</span> : null}
                        {s.fromOldSystem ? <div className="text-xs font-normal text-muted-foreground">Carried over from the old site</div> : null}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{s.email}</TableCell>
                      <TableCell>
                        {s.isOwner ? <span className="inline-flex items-center gap-1.5 font-medium"><Crown className="size-4 text-warning" /> Owner</span>
                          : s.role ? s.role.name
                          : <span className="text-warning">{s.fullAccess ? "No role yet (full access)" : "No role yet (no access)"}</span>}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{s.lastLoginAt ? formatDateTime(s.lastLoginAt) : "Never"}</TableCell>
                      <TableCell><StatusBadge status={s.isActive ? "ACTIVE" : "ARCHIVED"} label={s.isActive ? "Can sign in" : "Switched off"} /></TableCell>
                      <TableCell className="pr-4 text-right"><Button variant="ghost" size="icon-sm" aria-label={`Edit ${s.name ?? s.email}`} onClick={() => editPerson(s)}><Pencil /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="roles">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">A role says, for each part of the panel, whether its holders can see it and change it. The owner always has everything.</p>
            <Button className="h-9 shrink-0" onClick={addRole} disabled={!data}><Plus /> Add role</Button>
          </div>
          {isPending || !data ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-44" />)}</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {roles.map((r) => (
                <Card key={r.id}>
                  <CardContent className="flex h-full flex-col gap-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-base font-medium"><ShieldCheck className="size-4 shrink-0 text-primary" /> {r.name}</p>
                        {r.description ? <p className="mt-0.5 text-xs text-muted-foreground">{r.description}</p> : null}
                      </div>
                      <div className="flex shrink-0">
                        <Button variant="ghost" size="icon-sm" aria-label={`Edit the ${r.name} role`} onClick={() => editRole(r)}><Pencil /></Button>
                        <Button variant="ghost" size="icon-sm" aria-label={`Delete the ${r.name} role`} onClick={() => setDeleting(r)}><Trash2 /></Button>
                      </div>
                    </div>
                    <dl className="grid gap-2">
                      <div><dt className="text-xs text-muted-foreground">Can see and change</dt><dd>{summary(r, areas, "manage")}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">Can only see</dt><dd>{summary(r, areas, "view")}</dd></div>
                    </dl>
                    <p className="mt-auto border-t pt-3 text-xs text-muted-foreground">{r.people === 0 ? "Nobody has this role yet" : `${r.people} staff ${r.people === 1 ? "member" : "members"}`}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* add or edit one person */}
      <Dialog open={person !== null} onOpenChange={(open) => !open && setPerson(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{person?.id ? "Edit staff member" : "Add a staff member"}</DialogTitle>
            <DialogDescription>{person?.id ? "Changes to the role apply the next time they open a page." : "They sign in at the admin page with this email and password."}</DialogDescription>
          </DialogHeader>
          {person ? (
            <form id="person-form" className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); if (!savePerson.isPending) { if (!person.isOwner && !person.isMe && !person.staffRoleId) return toast.error("Choose a role"); savePerson.mutate(person); } }}>
              <div className="grid gap-1.5"><Label htmlFor="staff-first">First name</Label><Input id="staff-first" required maxLength={80} className="h-9" value={person.firstName} onChange={(e) => setPerson({ ...person, firstName: e.target.value })} /></div>
              <div className="grid gap-1.5"><Label htmlFor="staff-last">Last name <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="staff-last" maxLength={80} className="h-9" value={person.lastName} onChange={(e) => setPerson({ ...person, lastName: e.target.value })} /></div>
              <div className="grid gap-1.5 sm:col-span-2"><Label htmlFor="staff-email">Email</Label><Input id="staff-email" required type="email" maxLength={160} autoComplete="off" className="h-9" value={person.email} onChange={(e) => setPerson({ ...person, email: e.target.value })} /></div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="staff-password" className="flex items-center gap-1.5"><KeyRound className="size-3.5" /> {person.id ? "New password" : "Password"} {person.id ? <span className="font-normal text-muted-foreground">(leave empty to keep the current one)</span> : null}</Label>
                <div className="relative">
                  <Input id="staff-password" required={!person.id} minLength={8} maxLength={100} type={showPassword ? "text" : "password"} autoComplete="new-password" className="h-9 pr-10" value={person.password} onChange={(e) => setPerson({ ...person, password: e.target.value })} />
                  <button type="button" aria-label={showPassword ? "Hide the password" : "Show the password"} className="absolute top-1/2 right-1.5 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">At least 8 characters. Tell it to them yourself; it is not emailed.</p>
              </div>
              {person.isOwner ? (
                <p className="flex items-start gap-2 rounded-lg bg-surface-2 p-3 text-sm sm:col-span-2"><Crown className="mt-0.5 size-4 shrink-0 text-warning" /> The owner always has full access and cannot be switched off.</p>
              ) : person.isMe ? (
                <p className="rounded-lg bg-surface-2 p-3 text-sm sm:col-span-2">You cannot change your own role or switch yourself off. Ask the owner or another staff manager.</p>
              ) : (
                <>
                  <div className="grid gap-1.5 sm:col-span-2">
                    <Label>Role</Label>
                    <Select value={person.staffRoleId} onValueChange={(staffRoleId) => setPerson({ ...person, staffRoleId })}>
                      <SelectTrigger className="h-9 w-full"><SelectValue placeholder="Choose a role" /></SelectTrigger>
                      <SelectContent>{roles.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>)}</SelectContent>
                    </Select>
                    {person.staffRoleId ? <p className="text-xs text-muted-foreground">{roles.find((r) => String(r.id) === person.staffRoleId)?.description}</p> : null}
                  </div>
                  {person.id ? (
                    <label className="flex items-start justify-between gap-3 rounded-lg border p-3 text-sm sm:col-span-2">
                      <span>Can sign in<span className="block text-xs text-muted-foreground">Switch off when someone leaves. They are shut out at once, and what they did stays on record.</span></span>
                      <Switch checked={person.isActive} onCheckedChange={(isActive) => setPerson({ ...person, isActive })} />
                    </label>
                  ) : null}
                </>
              )}
            </form>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPerson(null)}>Cancel</Button>
            <Button type="submit" form="person-form" disabled={savePerson.isPending}>{savePerson.isPending ? <Spinner size="sm" /> : <UserCog />} {person?.id ? "Save changes" : "Add staff member"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* add or edit a role: one line per part of the panel */}
      <Dialog open={role !== null} onOpenChange={(open) => !open && setRole(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{role?.id ? `Edit the ${role.name} role` : "Add a role"}</DialogTitle>
            <DialogDescription>{role?.people ? `${role.people} staff ${role.people === 1 ? "member has" : "members have"} this role. Changes apply to them straight away.` : "Choose what people with this role can see and change."}</DialogDescription>
          </DialogHeader>
          {role ? (
            <form id="role-form" className="grid gap-4" onSubmit={(e) => { e.preventDefault(); if (!saveRole.isPending) saveRole.mutate(role); }}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5"><Label htmlFor="role-name">Name</Label><Input id="role-name" required minLength={2} maxLength={40} className="h-9" placeholder="Packing team" value={role.name} onChange={(e) => setRole({ ...role, name: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label htmlFor="role-description">What it is for <span className="font-normal text-muted-foreground">(optional)</span></Label><Textarea id="role-description" rows={1} maxLength={200} className="min-h-9" value={role.description} onChange={(e) => setRole({ ...role, description: e.target.value })} /></div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">Set every line to</span>
                {LEVELS.map((l) => <Button key={l.value} type="button" size="sm" variant="outline" onClick={() => setRole({ ...role, levels: Object.fromEntries(areas.map((a) => [a.key, l.value])) })}>{l.label}</Button>)}
              </div>
              <ul className="divide-y rounded-lg border">
                {areas.map((a) => (
                  <li key={a.key} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
                    <span className="min-w-0 flex-1 basis-56">
                      <span className="block text-sm font-medium">{a.label}</span>
                      <span className="block text-xs text-muted-foreground">{a.detail}</span>
                    </span>
                    <span className="grid shrink-0 grid-cols-3 gap-0.5 rounded-lg bg-muted p-0.5" role="radiogroup" aria-label={a.label}>
                      {LEVELS.map((l) => (
                        <button
                          key={l.value} type="button" role="radio" aria-checked={role.levels[a.key] === l.value} onClick={() => setRole({ ...role, levels: { ...role.levels, [a.key]: l.value } })}
                          className={cn("rounded-md px-2.5 py-1 text-xs font-medium transition-colors", role.levels[a.key] === l.value ? (l.value === "none" ? "bg-background text-foreground shadow-sm" : "bg-primary text-primary-foreground shadow-sm") : "text-muted-foreground hover:text-foreground")}
                        >
                          {l.label}
                        </button>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
              {role.levels.staff === "manage" ? (
                <p className="flex items-start gap-2 rounded-lg bg-warning/15 p-3 text-sm"><TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" /> People who can change Staff and roles can give anyone any access, including themselves through a new account. Give this only to people you trust fully.</p>
              ) : null}
            </form>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRole(null)}>Cancel</Button>
            <Button type="submit" form="role-form" loading={saveRole.isPending}>{role?.id ? "Save role" : "Add role"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete the {deleting?.name} role?</DialogTitle>
            <DialogDescription>
              {deleting?.people ? `${deleting.people} staff ${deleting.people === 1 ? "member has" : "members have"} this role, so it cannot be deleted. Give them another role first.` : "Nobody has this role. This cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="destructive" disabled={!deleting || deleting.people > 0 || removeRole.isPending} onClick={() => deleting && removeRole.mutate(deleting)}>{removeRole.isPending ? <ButtonSpinner /> : null}Delete role</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
