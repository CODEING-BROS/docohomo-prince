import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../lib/http";
import { CONFIRM_WORD, importConfigured, importLock, importStatus, restoreSessionCutoff, startImport } from "../lib/legacy-import";
import { prisma } from "../lib/prisma";

// Admin → Import from old site. Mounted at /api/admin/data-import. Owner only.
//   GET  /        where things stand: connected or not, open or closed for good, the running import, the last one
//   POST /start   { confirm: "IMPORT" } starts it in the background
// What it does and what it keeps is explained at the top of lib/legacy-import.ts.
export const dataImportRoutes = Router();

void restoreSessionCutoff();

const owner = async (userId: number) => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, firstName: true, lastName: true, email: true } });
  if (!user || user.role !== "SUPER_ADMIN") throw new HttpError(403, "Only the owner can bring the old site's data in");
  return { id: user.id, name: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "The owner" };
};

dataImportRoutes.get("/", async (req, res) => {
  await owner(req.user!.id);
  res.json(await importStatus());
});

dataImportRoutes.post("/start", async (req, res) => {
  const actor = await owner(req.user!.id);
  const { confirm } = z.object({ confirm: z.string().trim() }).parse(req.body ?? {});
  if (confirm !== CONFIRM_WORD) throw new HttpError(400, `Type ${CONFIRM_WORD} in capital letters to confirm`);
  if (!importConfigured()) throw new HttpError(400, "The old site is not connected yet. Add LEGACY_MONGODB_URI to the server's .env file and restart the server.");
  const locked = await importLock();
  if (locked) throw new HttpError(409, locked);
  if (!startImport(actor)) throw new HttpError(409, "An import is already running");
  res.status(202).json({ started: true });
});
