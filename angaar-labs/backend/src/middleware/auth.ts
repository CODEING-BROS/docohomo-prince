import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env, isProduction } from "../config/env";
import type { UserRole } from "../generated/prisma/client";
import { HttpError } from "../lib/http";

// Three separate sign-ins, each with its own cookie, so being signed in to one area never signs
// you in to another: a staff member is not mistaken for a patient, and a doctor signed in to the
// doctor dashboard is not the person shown in the patient's account (and the other way round).
export const SESSION_COOKIE = "dh_session"; // admin panel
export const USER_COOKIE = "dh_user"; // the patient's account area
export const DOCTOR_COOKIE = "dh_doctor"; // the doctor dashboard (also while a new doctor is still registering)
const SESSION_DAYS = 7;

export type SessionUser = { id: number; role: UserRole };
export type Panel = "patient" | "doctor";

declare module "express-serve-static-core" {
  interface Request {
    user?: SessionUser;
  }
}

export const STAFF_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "STAFF"];

/**
 * Which of the two customer-side areas a request comes from. The doctor dashboard's pages say so
 * with an "x-panel: doctor" header; a plain link (a PDF opened in a new tab) adds "?panel=doctor".
 * Everything else is the patient's area.
 */
export const panelOf = (req: Request): Panel => (req.header("x-panel") === "doctor" || req.query.panel === "doctor" ? "doctor" : "patient");
export const cookieOfPanel = (panel: Panel) => (panel === "doctor" ? DOCTOR_COOKIE : USER_COOKIE);

/** Signs someone in. Staff always get the admin cookie; everyone else gets the cookie of the area they signed in from. */
export const startSession = (res: Response, user: SessionUser, panel: Panel = "patient") => {
  const token = jwt.sign({ sub: String(user.id), role: user.role }, env.JWT_SECRET, { expiresIn: `${SESSION_DAYS}d` });
  res.cookie(STAFF_ROLES.includes(user.role) ? SESSION_COOKIE : cookieOfPanel(panel), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: "/",
  });
};

export const endSession = (res: Response, cookie: string = SESSION_COOKIE) => res.clearCookie(cookie, { path: "/" });

// Customer and doctor sign-ins made at or before this moment (seconds) no longer count. Set when the
// old site's data is brought in: account numbers change then, and an old sign-in would open someone
// else's account. Staff sign-ins are not affected, because staff accounts keep their numbers.
let customerSessionsValidAfter = 0;
export const endCustomerSessions = (atSeconds: number) => { customerSessionsValidAfter = Math.max(customerSessionsValidAfter, atSeconds); };

const readSession = (req: Request, cookie: string): SessionUser | null => {
  const token = req.cookies?.[cookie];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string; role: UserRole; iat?: number };
    // a staff token only counts in the admin cookie, and nobody else's counts there
    if (STAFF_ROLES.includes(payload.role) !== (cookie === SESSION_COOKIE)) return null;
    if (cookie !== SESSION_COOKIE && (payload.iat ?? 0) <= customerSessionsValidAfter) return null;
    return { id: Number(payload.sub), role: payload.role };
  } catch {
    return null;
  }
};

/** Requires a signed-in user with one of the given roles, signed in to the area the request comes from. */
export const requireRole =
  (...roles: UserRole[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    const user = readSession(req, STAFF_ROLES.includes(roles[0]) ? SESSION_COOKIE : cookieOfPanel(panelOf(req)));
    if (!user) throw new HttpError(401, "Please sign in");
    if (!roles.includes(user.role)) throw new HttpError(403, "You do not have access to this");
    req.user = user;
    next();
  };

/** For public pages that show more to signed-in people: sets req.user when there is a session, never refuses. */
export const optionalSession = (req: Request, _res: Response, next: NextFunction) => {
  req.user = readSession(req, cookieOfPanel(panelOf(req))) ?? undefined;
  next();
};

export const requireStaff = requireRole(...STAFF_ROLES);
/** A customer in their own account area, or (from the doctor dashboard) a doctor or someone still registering as one. */
export const requireSignedIn = requireRole("CUSTOMER", "DOCTOR");

/** The doctor dashboard's own routes: always the doctor sign-in, whatever the request says about itself. */
export const requireDoctor = (req: Request, _res: Response, next: NextFunction) => {
  const user = readSession(req, DOCTOR_COOKIE);
  if (!user) throw new HttpError(401, "Please sign in");
  if (user.role !== "DOCTOR") throw new HttpError(403, "You do not have access to this");
  req.user = user;
  next();
};
