import bcrypt from "bcryptjs";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { HttpError } from "../lib/http";
import { accessOf, forgetAccess, permissionList } from "../lib/permissions";
import { prisma } from "../lib/prisma";
import { STAFF_ROLES, endSession, requireStaff, startSession } from "../middleware/auth";

export const authRoutes = Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1),
});

type UserRow = { id: number; role: string; firstName: string | null; lastName: string | null; email: string | null };

/** Who is signed in, with what their role lets them see and change (the panel hides the rest). */
const publicUser = async (u: UserRow) => {
  const access = await accessOf(u.id);
  return {
    id: u.id,
    role: u.role,
    name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email,
    email: u.email,
    roleName: access.roleName,
    permissions: permissionList(access.permissions),
  };
};

// Staff sign-in for the admin panel.
authRoutes.post("/login", loginLimiter, async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const user = await prisma.user.findFirst({ where: { email, role: { in: STAFF_ROLES } } });
  const ok = user?.passwordHash ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !ok) throw new HttpError(401, "Wrong email or password");
  if (!user.isActive) throw new HttpError(403, "This account is disabled");

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  forgetAccess(user.id);
  startSession(res, { id: user.id, role: user.role });
  res.json({ user: await publicUser(user) });
});

authRoutes.post("/logout", (_req, res) => {
  endSession(res);
  res.json({ ok: true });
});

authRoutes.get("/me", requireStaff, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user || !user.isActive) throw new HttpError(401, "Please sign in");
  res.json({ user: await publicUser(user) });
});
