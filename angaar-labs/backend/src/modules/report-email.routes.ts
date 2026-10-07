import { Router } from "express";
import { z } from "zod";
import { channelProblems, emailReady } from "../lib/notify";
import { prisma } from "../lib/prisma";
import { buildReport, lastSent, reportRecipients, reportSettings, saveReportSettings, sendReport } from "../lib/report-email";

// Admin → Report emails. Mounted at /api/admin/reports/email, before the reports themselves.
//   GET  /          the settings, who gets the reports, and when each last went out
//   PUT  /          save the settings
//   GET  /preview   what a report would say if it were sent now
//   POST /send      send one now
export const reportEmailRoutes = Router();

/** Why a report could not be delivered right now, in plain words; nothing when email is working. */
const emailProblem = async () => (emailReady ? (await channelProblems()).email ?? null : "Email is not connected yet.");

const kindInput = z.enum(["daily", "weekly", "monthly"]);

reportEmailRoutes.get("/", async (_req, res) => {
  const settings = await reportSettings();
  res.json({ settings, goingTo: await reportRecipients(settings), lastSent: await lastSent(), emailProblem: await emailProblem() });
});

const settingsInput = z.object({
  daily: z.boolean(), weekly: z.boolean(), monthly: z.boolean(),
  weekday: z.coerce.number().int().min(0).max(6),
  hour: z.coerce.number().int().min(0, "Choose an hour from 0 to 23").max(23, "Choose an hour from 0 to 23"),
  recipients: z.array(z.string().trim().toLowerCase().email("One of the email addresses does not look right").max(160)).max(10, "At most 10 people"),
  attachOrders: z.boolean(),
});

reportEmailRoutes.put("/", async (req, res) => {
  const input = settingsInput.parse(req.body);
  const saved = await saveReportSettings({ ...input, recipients: [...new Set(input.recipients)] });
  await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "report-email.settings", entity: "Setting", entityId: "reports.email", changes: saved } });
  res.json({ settings: saved, goingTo: await reportRecipients(saved) });
});

reportEmailRoutes.get("/preview", async (req, res) => {
  const { kind } = z.object({ kind: kindInput.default("weekly") }).parse(req.query);
  const { range: _range, ...report } = await buildReport(kind);
  res.json(report);
});

reportEmailRoutes.post("/send", async (req, res) => {
  const { kind, to } = z.object({ kind: kindInput, to: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.string().trim().toLowerCase().email("That email address does not look right").optional()) }).parse(req.body);
  const result = await sendReport(kind, to ? { to: [to] } : {});
  await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "report-email.send", entity: "Setting", entityId: "reports.email", changes: { kind, recipients: result.recipients } } });
  res.json({ ...result, emailProblem: await emailProblem() });
});
