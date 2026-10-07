import type { Response } from "express";
import { z } from "zod";
import { prisma } from "./prisma";

// Shared by every admin table: export rows as a spreadsheet file, and delete several rows at once.

export const EXPORT_LIMIT = 20_000;

/** "?ids=4,9,12" on an export link: only these rows. Absent means "everything the filters match". */
export const idsQuery = z.preprocess(
  (v) => (typeof v === "string" && v.trim() !== "" ? v.split(",").map(Number) : undefined),
  z.array(z.number().int().positive()).max(5000).optional(),
);

/** Body of a bulk delete. */
export const idsBody = z.object({ ids: z.array(z.number().int().positive()).min(1).max(500) });

export type Column<T> = { header: string; value: (row: T) => unknown };

const cell = (value: unknown) => {
  if (value === null || value === undefined) return "";
  let text = String(value);
  // text that starts like a formula would be run by Excel; a leading apostrophe keeps it as text
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** Sends rows as a CSV download that opens cleanly in Excel and Google Sheets. */
export const sendCsv = <T>(res: Response, name: string, columns: Column<T>[], rows: T[]) => {
  const lines = [columns.map((c) => cell(c.header)).join(","), ...rows.map((row) => columns.map((c) => cell(c.value(row))).join(","))];
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send("﻿" + lines.join("\r\n"));
};

/** A date as "2026-10-05 05:28" in the given timezone, for export files. */
export const stamp = (at: Date | null | undefined, zone: string) => {
  if (!at) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(at);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;
};

/** What a bulk delete answers: how many went, how many were kept, and why. */
export const bulkResult = (deleted: number, skipped: number, reason?: string) => ({ deleted, skipped, reason: skipped ? reason : undefined });

/** Records who deleted what. */
export const logBulkDelete = async (actorId: number, entity: string, ids: number[], extra?: Record<string, unknown>) => {
  if (ids.length === 0) return;
  await prisma.auditLog.create({ data: { actorId, action: `${entity.toLowerCase()}.bulk-delete`, entity, changes: { ids, ...extra } } });
};
