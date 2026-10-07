import type { Request } from "express";
import { z } from "zod";

/** An error with an HTTP status; the error handler turns it into a JSON response. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new HttpError(404, `${what} not found`);

/** Prisma returns Decimal objects; the API sends plain numbers. */
export const num = (value: unknown): number => (value === null || value === undefined ? 0 : Number(value));
export const numOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(2000).default(20),
});

export const getPage = (req: Request) => {
  const { page, pageSize } = pageSchema.parse(req.query);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
};

export const paged = <T>(items: T[], total: number, page: number, pageSize: number) => ({
  items,
  total,
  page,
  pageSize,
  pageCount: Math.max(1, Math.ceil(total / pageSize)),
});

// Query-string helpers: an empty string counts as "not set".
const blankToUndefined = (v: unknown) => (v === "" ? undefined : v);
export const optionalString = z.preprocess(blankToUndefined, z.string().trim().optional());
export const optionalInt = z.preprocess(blankToUndefined, z.coerce.number().int().optional());
export const optionalDate = z.preprocess(blankToUndefined, z.coerce.date().optional());
export const idParam = z.object({ id: z.coerce.number().int().positive() });
