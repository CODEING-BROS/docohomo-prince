import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "../generated/prisma/client";
import { bulkResult, idsBody, logBulkDelete } from "../lib/bulk";
import { HttpError, getPage, idParam, notFound, optionalString, paged } from "../lib/http";
import { EVENTS, defaultFor, notify, placeholdersFor, resend } from "../lib/notifications";
import { channelProblems, emailReady, lastSmsSentAt, smsReady, whatsappReady } from "../lib/notify";
import { prisma } from "../lib/prisma";

// Admin → Automatic messages. Mounted at /api/admin/messages.
//   /templates   what is sent for each event, and on which channels
//   /log         every message sent, failed or skipped
//   /settings    who receives the staff alerts
export const messageRoutes = Router();

const channels = () => ({ email: emailReady, sms: smsReady, whatsapp: whatsappReady });
const ORDER = new Map(EVENTS.map((e, index) => [e.event, index]));

messageRoutes.get("/templates", async (_req, res) => {
  const [templates, counts] = await Promise.all([
    prisma.notificationTemplate.findMany(),
    prisma.notification.groupBy({ by: ["event", "status"], where: { createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } }, _count: true }),
  ]);
  const last30 = (event: string) => Object.fromEntries(["SENT", "FAILED", "SKIPPED"].map((status) => [status.toLowerCase(), counts.find((c) => c.event === event && c.status === status)?._count ?? 0]));
  res.json({
    channels: channels(),
    problems: await channelProblems(), // connected, but not working: why
    lastSmsSentAt: lastSmsSentAt(),
    items: templates
      .sort((a, b) => (ORDER.get(a.event) ?? 99) - (ORDER.get(b.event) ?? 99))
      .map((t) => ({ ...t, placeholders: placeholdersFor(t.event), last30Days: last30(t.event) })),
  });
});

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const templateInput = z.object({
  isActive: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  emailSubject: z.preprocess(blankToNull, z.string().trim().max(200).nullable().optional()),
  emailBody: z.preprocess(blankToNull, z.string().trim().max(5000).nullable().optional()),
  smsEnabled: z.boolean().optional(),
  smsTemplateId: z.preprocess(blankToNull, z.string().trim().max(80).nullable().optional()),
  smsText: z.preprocess(blankToNull, z.string().trim().max(500).nullable().optional()),
  whatsappEnabled: z.boolean().optional(),
  whatsappTemplate: z.preprocess(blankToNull, z.string().trim().regex(/^[a-z0-9_]+$/, "A WhatsApp template name has only small letters, numbers and _").max(120).nullable().optional()),
  whatsappLanguage: z.string().trim().min(2).max(10).optional(),
  whatsappParams: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
});

messageRoutes.patch("/templates/:event", async (req, res) => {
  const event = z.string().max(60).parse(req.params.event);
  const input = templateInput.parse(req.body);
  const current = await prisma.notificationTemplate.findUnique({ where: { event } });
  if (!current) throw notFound("Message");

  // a placeholder that this message does not have would come out empty: say so before saving
  const known = new Set(placeholdersFor(event));
  const used = [input.emailSubject, input.emailBody, input.smsText].filter(Boolean).flatMap((text) => [...text!.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]));
  const unknown = [...new Set([...used, ...(input.whatsappParams ?? [])])].filter((name) => !known.has(name));
  if (unknown.length) throw new HttpError(400, `This message has no {{${unknown[0]}}}. You can use: ${[...known].map((k) => `{{${k}}}`).join(", ")}`);

  const next = { ...current, ...input };
  if (next.emailEnabled && next.isActive && (!next.emailSubject || !next.emailBody)) throw new HttpError(400, "An email needs a subject and a message");
  if (next.smsEnabled && !next.smsTemplateId) throw new HttpError(400, "Enter the MSG91 template id of the approved SMS text before switching SMS on");
  if (next.whatsappEnabled && !next.whatsappTemplate) throw new HttpError(400, "Enter the name of the approved WhatsApp template before switching WhatsApp on");

  const saved = await prisma.notificationTemplate.update({ where: { event }, data: input });
  await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "message.template", entity: "NotificationTemplate", entityId: event, changes: input } });
  res.json({ ...saved, placeholders: placeholdersFor(event) });
});

/** Puts a message's wording back to how it started. */
messageRoutes.post("/templates/:event/reset", async (req, res) => {
  const event = z.string().max(60).parse(req.params.event);
  const original = defaultFor(event);
  if (!original) throw notFound("Message");
  const saved = await prisma.notificationTemplate.update({ where: { event }, data: { emailSubject: original.emailSubject, emailBody: original.emailBody, smsText: original.smsText } });
  res.json({ ...saved, placeholders: placeholdersFor(event) });
});

/** Sends the message to an address of staff's choosing, filled with made-up example values, to see how it looks. */
messageRoutes.post("/templates/:event/test", async (req, res) => {
  const event = z.string().max(60).parse(req.params.event);
  const { email, phone } = z.object({
    email: z.preprocess(blankToNull, z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")).nullable().optional()),
    phone: z.preprocess(blankToNull, z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number").nullable().optional()),
  }).parse(req.body);
  if (!email && !phone) throw new HttpError(400, "Enter an email address or a mobile number to send the test to");
  if (!defaultFor(event)) throw notFound("Message");
  const sample = Object.fromEntries(placeholdersFor(event).map((key) => [key, `[${key}]`]));
  const before = new Date();
  await notify(event, { name: "Test", email: email ?? null, phone: phone ?? null }, sample, { type: "Test", id: 0 });
  const results = await prisma.notification.findMany({ where: { event, relatedType: "Test", createdAt: { gte: before } }, select: { channel: true, status: true, error: true } });
  res.json({ results });
});

const logFilters = z.object({
  q: optionalString,
  status: z.enum(["QUEUED", "SENT", "FAILED", "SKIPPED"]).optional().or(z.literal("").transform(() => undefined)),
  channel: z.enum(["EMAIL", "SMS", "WHATSAPP"]).optional().or(z.literal("").transform(() => undefined)),
  event: optionalString,
});

messageRoutes.get("/log", async (req, res) => {
  const filters = logFilters.parse(req.query);
  const { page, pageSize, skip, take } = getPage(req);
  const where: Prisma.NotificationWhereInput = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.channel ? { channel: filters.channel } : {}),
    ...(filters.event ? { event: filters.event } : {}),
    ...(filters.q ? { OR: [{ recipient: { contains: filters.q, mode: "insensitive" } }, { subject: { contains: filters.q, mode: "insensitive" } }, { body: { contains: filters.q, mode: "insensitive" } }] } : {}),
  };
  const [items, total, byStatus] = await Promise.all([
    prisma.notification.findMany({
      where, orderBy: { id: "desc" }, skip, take,
      select: { id: true, event: true, channel: true, recipient: true, subject: true, body: true, status: true, error: true, attempts: true, relatedType: true, relatedId: true, createdAt: true, sentAt: true },
    }),
    prisma.notification.count({ where }),
    prisma.notification.groupBy({ by: ["status"], where: { createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } }, _count: true }),
  ]);
  res.json({ ...paged(items, total, page, pageSize), last7Days: Object.fromEntries(byStatus.map((s) => [s.status, s._count])) });
});

// Clears entries from the log. A message still waiting to be sent is kept, or it would never go out.
messageRoutes.post("/log/bulk-delete", async (req, res) => {
  const { ids } = idsBody.parse(req.body);
  const deleted = await prisma.notification.deleteMany({ where: { id: { in: ids }, status: { not: "QUEUED" } } });
  if (deleted.count) await logBulkDelete(req.user!.id, "Notification", ids, { deleted: deleted.count });
  res.json(bulkResult(deleted.count, ids.length - deleted.count, "Messages still waiting to be sent were kept."));
});

messageRoutes.post("/log/:id/resend", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const message = await resend(id);
  if (!message) throw notFound("Message");
  res.json(message);
});

const STAFF_KEY = "notifications.staff";
const staffInput = z.object({
  emails: z.array(z.string().trim().toLowerCase().pipe(z.email("One of the email addresses is not valid"))).max(10),
  phones: z.array(z.string().trim().regex(/^[6-9]\d{9}$/, "One of the mobile numbers is not valid")).max(10),
});

messageRoutes.get("/settings", async (_req, res) => {
  const [setting, admins] = await Promise.all([
    prisma.setting.findUnique({ where: { key: STAFF_KEY } }),
    prisma.user.findMany({ where: { role: { in: ["SUPER_ADMIN", "ADMIN"] }, isActive: true, email: { not: null }, lastLoginAt: { not: null } }, select: { email: true } }),
  ]);
  const value = (setting?.value ?? {}) as { emails?: string[]; phones?: string[] };
  res.json({ channels: channels(), emails: value.emails ?? [], phones: value.phones ?? [], fallbackEmails: admins.map((a) => a.email) });
});

messageRoutes.put("/settings", async (req, res) => {
  const input = staffInput.parse(req.body);
  const value = { emails: [...new Set(input.emails)], phones: [...new Set(input.phones)] };
  await prisma.setting.upsert({ where: { key: STAFF_KEY }, update: { value }, create: { key: STAFF_KEY, value } });
  res.json(value);
});
