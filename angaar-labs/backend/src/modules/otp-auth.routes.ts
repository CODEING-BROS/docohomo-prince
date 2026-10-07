import { createHash, randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { env } from "../config/env";
import { HttpError } from "../lib/http";
import { deliverCode, emailReady, otpSmsReady } from "../lib/notify";
import { prisma } from "../lib/prisma";
import { STAFF_ROLES, cookieOfPanel, endSession, panelOf, requireSignedIn, startSession } from "../middleware/auth";

// Sign-in for doctors and patients. Mounted at /api/auth next to the staff login.
// The doctor dashboard and the patient's account are separate sign-ins (see middleware/auth.ts):
// the same routes serve both, and each request says which area it comes from.
//   - sign up: mobile number, checked with a one-time code, plus a password
//   - sign in: mobile number or email with the password, or a one-time code (also the way back in after a forgotten password)
export const otpAuthRoutes = Router();

const OTP_MINUTES = 10;
const MAX_ATTEMPTS = 5;

const mobile = z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number");
const hash = (phone: string, code: string) => createHash("sha256").update(`${phone}:${code}:${env.JWT_SECRET}`).digest("hex");

const requestLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false, message: { message: "Too many codes requested. Try again in a few minutes." } });
const verifyLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

/**
 * Sends the code to the mobile number and, when there is one, the email address.
 * In test mode (OTP_DEV_CODE set) nothing is sent and the fixed code works.
 */
const sendCode = async (phone: string, code: string, email?: string | null) => {
  if (env.OTP_DEV_CODE) {
    console.log(`[otp] test mode: the code for ${phone}${email ? ` and ${email}` : ""} is ${env.OTP_DEV_CODE}`);
    return;
  }
  if (!otpSmsReady && !emailReady) throw new HttpError(503, "Text messages and email are not set up yet, so sign-in codes cannot be sent");
  const sent = await deliverCode(phone, code, email);
  if (!sent.sms && !sent.email) throw new HttpError(502, "We could not send the code just now. Please try again in a minute.");
};

otpAuthRoutes.post("/otp/request", requestLimiter, async (req, res) => {
  const { phone, email, mustExist } = z
    .object({
      phone: mobile,
      email: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")).optional()),
      mustExist: z.boolean().default(false), // the doctor sign-in page: a code is only for someone who already has an account
    })
    .parse(req.body);
  const user = await prisma.user.findUnique({ where: { phone }, select: { isActive: true, role: true, email: true } });
  if (user && !user.isActive) throw new HttpError(403, "This account is disabled");
  if (user && STAFF_ROLES.includes(user.role)) throw new HttpError(400, "This number belongs to a staff account. Use the admin sign-in instead.");
  if (mustExist && !user) throw new HttpError(404, "There is no account with this mobile number. Create your account first.");

  const code = env.OTP_DEV_CODE ?? String(randomInt(100000, 1000000));
  await sendCode(phone, code, email ?? user?.email);
  await prisma.otpCode.deleteMany({ where: { phone, purpose: "LOGIN" } });
  await prisma.otpCode.create({ data: { phone, codeHash: hash(phone, code), expiresAt: new Date(Date.now() + OTP_MINUTES * 60 * 1000) } });
  res.json({ ok: true, testMode: Boolean(env.OTP_DEV_CODE) });
});

const sessionUser = async (userId: number) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, role: true, firstName: true, lastName: true, phone: true, email: true, isActive: true, gender: true, dateOfBirth: true, passwordHash: true,
      doctorProfile: { select: { id: true, displayName: true, verificationStatus: true, acceptsConsultations: true } },
      b2bAccount: { select: { status: true } },
    },
  });
  if (!user || !user.isActive) return null;
  return {
    id: user.id, role: user.role, phone: user.phone, email: user.email,
    firstName: user.firstName, lastName: user.lastName, gender: user.gender, dateOfBirth: user.dateOfBirth ? user.dateOfBirth.toISOString().slice(0, 10) : null,
    name: user.doctorProfile?.displayName ?? ([user.firstName, user.lastName].filter(Boolean).join(" ") || null),
    hasPassword: user.passwordHash !== null,
    doctor: user.doctorProfile ? { id: user.doctorProfile.id, verificationStatus: user.doctorProfile.verificationStatus, consulting: user.doctorProfile.acceptsConsultations } : null,
    wholesale: user.b2bAccount?.status === "APPROVED",
  };
};

const oneTimeCode = z.string().trim().regex(/^\d{4,6}$/, "Enter the code from the message");
const newPassword = z.string().min(8, "Use at least 8 characters for the password").max(100);

/** Checks the code sent to a number and uses it up. Throws when it is wrong or too old. */
const useCode = async (phone: string, code: string) => {
  const otp = await prisma.otpCode.findFirst({ where: { phone, purpose: "LOGIN", consumedAt: null }, orderBy: { createdAt: "desc" } });
  if (!otp || otp.expiresAt < new Date()) throw new HttpError(400, "That code has expired. Ask for a new one.");
  if (otp.attempts >= MAX_ATTEMPTS) throw new HttpError(400, "Too many wrong tries. Ask for a new code.");
  if (otp.codeHash !== hash(phone, code)) {
    await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    throw new HttpError(400, "That code is not right");
  }
  await prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
};

// Create an account: mobile number and email, confirmed with the code. The registration form comes next.
otpAuthRoutes.post("/signup", verifyLimiter, async (req, res) => {
  const input = z
    .object({ phone: mobile, email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")), code: oneTimeCode })
    .parse(req.body);

  const existing = await prisma.user.findUnique({ where: { phone: input.phone }, select: { id: true, role: true, isActive: true, doctorProfile: { select: { id: true } } } });
  if (existing && STAFF_ROLES.includes(existing.role)) throw new HttpError(400, "This number belongs to a staff account. Use the admin sign-in instead.");
  if (existing && !existing.isActive) throw new HttpError(403, "This account is disabled");
  if (existing?.doctorProfile) throw new HttpError(409, "A doctor account already uses this mobile number. Sign in instead.");
  await useCode(input.phone, input.code);

  const now = new Date();
  // a number we already know (an old customer) keeps its record
  const user = existing
    ? await prisma.user.update({ where: { id: existing.id }, data: { email: input.email, phoneVerifiedAt: now, emailVerifiedAt: now, lastLoginAt: now } })
    : await prisma.user.create({ data: { phone: input.phone, role: "CUSTOMER", email: input.email, phoneVerifiedAt: now, emailVerifiedAt: now, lastLoginAt: now } });

  startSession(res, { id: user.id, role: user.role }, panelOf(req)); // signed in to the area they came from, and only that one
  res.status(201).json({ user: await sessionUser(user.id) });
});

const passwordLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { message: "Too many tries. Wait a few minutes, or sign in with a code." } });

otpAuthRoutes.post("/password-login", passwordLimiter, async (req, res) => {
  const { identifier, password } = z.object({ identifier: z.string().trim().min(3, "Enter your mobile number or email").max(160), password: z.string().min(1, "Enter your password") }).parse(req.body);
  const digits = identifier.replace(/[\s+-]/g, "").replace(/^91(?=\d{10}$)/, "");
  const user = /^[6-9]\d{9}$/.test(digits)
    ? await prisma.user.findUnique({ where: { phone: digits } })
    : await prisma.user.findFirst({ where: { email: identifier.toLowerCase(), role: { in: ["DOCTOR", "CUSTOMER"] }, passwordHash: { not: null } }, orderBy: { role: "desc" } });

  const ok = user?.passwordHash && !STAFF_ROLES.includes(user.role) ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !ok) throw new HttpError(401, "The mobile number, email or password is not right");
  if (!user.isActive) throw new HttpError(403, "This account is disabled");

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  startSession(res, { id: user.id, role: user.role }, panelOf(req)); // signed in to the area they came from, and only that one
  res.json({ user: await sessionUser(user.id) });
});

// Set or change the password while signed in (after signing in with a code, this is how a forgotten one is replaced).
otpAuthRoutes.post("/password", requireSignedIn, async (req, res) => {
  const { password } = z.object({ password: newPassword }).parse(req.body);
  await prisma.user.update({ where: { id: req.user!.id }, data: { passwordHash: await bcrypt.hash(password, 12) } });
  res.json({ ok: true });
});

otpAuthRoutes.post("/otp/verify", verifyLimiter, async (req, res) => {
  const { phone, code } = z.object({ phone: mobile, code: oneTimeCode }).parse(req.body);
  await useCode(phone, code);

  // a new number becomes a customer account; an existing one just signs in
  const user = await prisma.user.upsert({
    where: { phone },
    update: { lastLoginAt: new Date() },
    create: { phone, role: "CUSTOMER", phoneVerifiedAt: new Date(), lastLoginAt: new Date() },
  });
  if (!user.isActive) throw new HttpError(403, "This account is disabled");
  if (STAFF_ROLES.includes(user.role)) throw new HttpError(400, "This number belongs to a staff account. Use the admin sign-in instead.");
  if (!user.phoneVerifiedAt) await prisma.user.update({ where: { id: user.id }, data: { phoneVerifiedAt: new Date() } });

  startSession(res, { id: user.id, role: user.role }, panelOf(req)); // signed in to the area they came from, and only that one
  res.json({ user: await sessionUser(user.id) });
});

// Signs out of the area the request comes from; the other area stays signed in.
otpAuthRoutes.post("/user-logout", (req, res) => {
  endSession(res, cookieOfPanel(panelOf(req)));
  res.json({ ok: true });
});

// Who is signed in, for the patient and doctor areas.
otpAuthRoutes.get("/session", requireSignedIn, async (req, res) => {
  const user = await sessionUser(req.user!.id);
  if (!user) {
    endSession(res, cookieOfPanel(panelOf(req)));
    throw new HttpError(401, "Please sign in");
  }
  res.json({ user });
});
