import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { bulkResult, idsBody, logBulkDelete } from "../lib/bulk";
import { HttpError, idParam, notFound } from "../lib/http";
import { AREAS, EVERYTHING, accessOf, forgetAccess, permissionList, validPermission } from "../lib/permissions";
import { prisma } from "../lib/prisma";
import { STAFF_ROLES } from "../middleware/auth";

// Admin → Staff and roles. Mounted at /api/admin/staff; needs the "staff" area.
//   GET    /             everyone who can sign in to the panel, the roles, and the areas a role is made of
//   POST   /             add a staff member
//   PATCH  /:id          change their name, email, role, password, or switch them off
//   POST   /roles        add a role          PATCH /roles/:id   change it          DELETE /roles/:id   remove it
export const staffRoutes = Router();

const blank = (v: unknown) => (v === "" ? null : v);
const name = (max: number) => z.preprocess(blank, z.string().trim().max(max).nullable().optional());
const email = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")).pipe(z.string().max(160));
const password = z.string().min(8, "Use at least 8 characters for the password").max(100);

const staffOut = async (id: number) => {
  const u = await prisma.user.findUniqueOrThrow({ where: { id }, select: { id: true, role: true, firstName: true, lastName: true, email: true, isActive: true, lastLoginAt: true, createdAt: true, legacyId: true, staffRole: { select: { id: true, name: true } } } });
  const access = await accessOf(u.id);
  return {
    id: u.id, name: [u.firstName, u.lastName].filter(Boolean).join(" ") || null, firstName: u.firstName, lastName: u.lastName, email: u.email,
    isOwner: u.role === "SUPER_ADMIN", isActive: u.isActive, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt,
    role: u.staffRole, roleName: access.roleName, fullAccess: access.permissions.size === EVERYTHING.length,
    fromOldSystem: u.legacyId !== null, // carried over from the old site and may never have signed in here
  };
};

staffRoutes.get("/", async (req, res) => {
  const [people, roles] = await Promise.all([
    prisma.user.findMany({ where: { role: { in: STAFF_ROLES } }, orderBy: [{ isActive: "desc" }, { role: "asc" }, { firstName: "asc" }], select: { id: true } }),
    prisma.staffRole.findMany({ orderBy: { id: "asc" }, include: { _count: { select: { users: true } } } }),
  ]);
  res.json({
    me: req.user!.id,
    staff: await Promise.all(people.map((p) => staffOut(p.id))),
    roles: roles.map(({ _count, ...role }) => ({ ...role, permissions: permissionList(new Set(role.permissions.filter(validPermission))), people: _count.users })),
    areas: AREAS,
  });
});

/** Only the owner may touch the owner's account. */
const guardOwner = async (targetId: number, actorId: number) => {
  const [target, actor] = await Promise.all([
    prisma.user.findFirst({ where: { id: targetId, role: { in: STAFF_ROLES } }, select: { id: true, role: true, email: true } }),
    prisma.user.findUnique({ where: { id: actorId }, select: { role: true } }),
  ]);
  if (!target) throw notFound("Staff member");
  if (target.role === "SUPER_ADMIN" && actor?.role !== "SUPER_ADMIN") throw new HttpError(403, "Only the owner can change the owner's account");
  return target;
};

const emailFree = async (address: string, exceptId?: number) => {
  const taken = await prisma.user.findFirst({ where: { email: address, role: { in: STAFF_ROLES }, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
  if (taken) throw new HttpError(400, "Another staff member already signs in with this email");
};
const roleExists = async (id: number) => {
  if (!(await prisma.staffRole.findUnique({ where: { id }, select: { id: true } }))) throw new HttpError(400, "That role does not exist any more");
};

staffRoutes.post("/", async (req, res) => {
  const input = z.object({
    firstName: z.string().trim().min(1, "Enter the person's name").max(80), lastName: name(80), email, password,
    staffRoleId: z.coerce.number("Choose a role").int().positive(),
  }).parse(req.body);
  await emailFree(input.email);
  await roleExists(input.staffRoleId);
  const created = await prisma.user.create({
    data: { role: "STAFF", firstName: input.firstName, lastName: input.lastName ?? null, email: input.email, passwordHash: await bcrypt.hash(input.password, 12), staffRoleId: input.staffRoleId, emailVerifiedAt: new Date() },
  });
  await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "staff.create", entity: "User", entityId: String(created.id), changes: { email: input.email, staffRoleId: input.staffRoleId } } });
  res.status(201).json(await staffOut(created.id));
});

staffRoutes.patch("/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const input = z.object({
    firstName: z.string().trim().min(1, "Enter the person's name").max(80).optional(), lastName: name(80), email: email.optional(),
    password: z.preprocess((v) => (v === "" || v === null ? undefined : v), password.optional()),
    staffRoleId: z.preprocess((v) => (v === "" ? null : v), z.coerce.number().int().positive().nullable().optional()),
    isActive: z.boolean().optional(),
  }).parse(req.body);
  const target = await guardOwner(id, req.user!.id);
  const mine = id === req.user!.id;

  if (mine && input.isActive === false) throw new HttpError(400, "You cannot switch off your own account");
  if (mine && input.staffRoleId !== undefined) throw new HttpError(400, "You cannot change your own role. Ask the owner or another staff manager.");
  if (target.role === "SUPER_ADMIN" && (input.isActive === false || input.staffRoleId)) throw new HttpError(400, "The owner always has full access and cannot be switched off");
  if (input.email && input.email !== target.email) await emailFree(input.email, id);
  if (input.staffRoleId) await roleExists(input.staffRoleId);

  await prisma.user.update({
    where: { id },
    data: {
      ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
      ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
      ...(input.email ? { email: input.email } : {}),
      ...(input.password ? { passwordHash: await bcrypt.hash(input.password, 12) } : {}),
      ...(input.staffRoleId !== undefined ? { staffRoleId: input.staffRoleId } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
  forgetAccess(id);
  await prisma.auditLog.create({
    data: { actorId: req.user!.id, action: "staff.update", entity: "User", entityId: String(id), changes: { ...input, password: input.password ? "changed" : undefined } },
  });
  res.json(await staffOut(id));
});

// Removes staff accounts that were never used to change anything. Someone who has worked in the panel
// is kept, so the history still says who did what: switch them off instead. Never yourself, never the owner.
staffRoutes.post("/bulk-delete", async (req, res) => {
  const { ids } = idsBody.parse(req.body);
  const deletable = await prisma.user.findMany({
    where: { id: { in: ids.filter((id) => id !== req.user!.id) }, role: { in: STAFF_ROLES.filter((role) => role !== "SUPER_ADMIN") }, auditLogs: { none: {} } },
    select: { id: true, email: true },
  });
  const gone: number[] = [];
  for (const person of deletable) {
    // anything else still tied to the account (an import they ran, an order) keeps it
    const removed = await prisma.user.delete({ where: { id: person.id } }).then(() => true).catch(() => false);
    if (removed) { gone.push(person.id); forgetAccess(person.id); }
  }
  await logBulkDelete(req.user!.id, "User", gone, { staff: true, emails: deletable.filter((p) => gone.includes(p.id)).map((p) => p.email) });
  res.json(bulkResult(gone.length, ids.length - gone.length, "Your own account, the owner, and staff who have made changes in the panel were kept. Switch those off instead, so the history still shows who did what."));
});

// ───────────────────────────────────────────── roles

const roleInput = z.object({
  name: z.string().trim().min(2, "Give the role a name").max(40),
  description: z.preprocess(blank, z.string().trim().max(200).nullable().optional()),
  permissions: z.array(z.string().refine(validPermission, "Unknown permission")).max(EVERYTHING.length),
});
// "can change" always includes "can see", so the stored list never says one without the other
const tidy = (permissions: string[]) => [...new Set(permissions.flatMap((key) => (key.endsWith(".manage") ? [key.replace(".manage", ".view"), key] : [key])))];

staffRoutes.post("/roles", async (req, res) => {
  const input = roleInput.parse(req.body);
  if (await prisma.staffRole.findFirst({ where: { name: { equals: input.name, mode: "insensitive" } } })) throw new HttpError(400, "A role with this name already exists");
  const role = await prisma.staffRole.create({ data: { name: input.name, description: input.description ?? null, permissions: tidy(input.permissions) } });
  await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "staff-role.create", entity: "StaffRole", entityId: String(role.id), changes: input } });
  res.status(201).json(role);
});

staffRoutes.patch("/roles/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const input = roleInput.partial().parse(req.body);
  const role = await prisma.staffRole.findUnique({ where: { id }, include: { users: { select: { id: true } } } });
  if (!role) throw notFound("Role");
  if (input.name && (await prisma.staffRole.findFirst({ where: { id: { not: id }, name: { equals: input.name, mode: "insensitive" } } }))) throw new HttpError(400, "A role with this name already exists");
  const permissions = input.permissions ? tidy(input.permissions) : undefined;
  // nobody may saw off the branch they sit on: your own role keeps staff management
  if (permissions && role.users.some((u) => u.id === req.user!.id) && !permissions.includes("staff.manage")) {
    throw new HttpError(400, "This is your own role. Taking away \"Staff and roles\" would lock you out of this page.");
  }
  const saved = await prisma.staffRole.update({ where: { id }, data: { ...(input.name ? { name: input.name } : {}), ...(input.description !== undefined ? { description: input.description } : {}), ...(permissions ? { permissions } : {}) } });
  forgetAccess();
  await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "staff-role.update", entity: "StaffRole", entityId: String(id), changes: input } });
  res.json(saved);
});

staffRoutes.delete("/roles/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const role = await prisma.staffRole.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
  if (!role) throw notFound("Role");
  if (role._count.users > 0) throw new HttpError(400, `${role._count.users} staff ${role._count.users === 1 ? "member has" : "members have"} this role. Give them another role first.`);
  await prisma.staffRole.delete({ where: { id } });
  await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "staff-role.delete", entity: "StaffRole", entityId: String(id), changes: { name: role.name } } });
  res.json({ ok: true });
});
