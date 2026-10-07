import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "../generated/prisma/client";
import { bulkResult, idsBody, logBulkDelete } from "../lib/bulk";
import { HttpError, getPage, idParam, notFound, num, optionalString, paged } from "../lib/http";
import { paymentsMode } from "../lib/payments";
import { prisma } from "../lib/prisma";
import { refundSettings, refundsDue, saveRefundSettings, startRefund } from "../lib/refunds";

// Admin → Refunds. Mounted at /api/admin/refunds.
//   GET  /            what is waiting to be refunded, every refund made, and the automatic switch
//   POST /            send money back for an order or a consultation
//   POST /:id/retry   try a failed refund again
//   PUT  /settings    automatic refunds on or off
export const refundRoutes = Router();

const filters = z.object({
  q: optionalString,
  status: z.enum(["PENDING", "SUCCESS", "FAILED"]).optional().or(z.literal("").transform(() => undefined)),
});

refundRoutes.get("/", async (req, res) => {
  const { q, status } = filters.parse(req.query);
  const { page, pageSize, skip, take } = getPage(req);
  const where: Prisma.RefundWhereInput = {
    ...(status ? { status } : {}),
    ...(q ? { OR: [{ providerRef: { contains: q, mode: "insensitive" } }, { payment: { order: { orderNumber: { contains: q, mode: "insensitive" } } } }, { payment: { appointment: { appointmentNumber: { contains: q, mode: "insensitive" } } } }, { payment: { order: { customerName: { contains: q, mode: "insensitive" } } } }] } : {}),
  };
  const [rows, total, due, settings, totals] = await Promise.all([
    prisma.refund.findMany({
      where, orderBy: { id: "desc" }, skip, take,
      include: { payment: { select: { amount: true, provider: true, order: { select: { id: true, orderNumber: true, customerName: true } }, appointment: { select: { id: true, appointmentNumber: true, patientName: true } } } } },
    }),
    prisma.refund.count({ where }),
    refundsDue(),
    refundSettings(),
    prisma.refund.groupBy({ by: ["status"], _sum: { amount: true }, _count: true }),
  ]);
  res.json({
    ...paged(rows.map(({ payment, rawResponse: _raw, ...r }) => ({
      ...r, amount: num(r.amount), paid: num(payment.amount), testPayment: payment.provider === "TEST",
      kind: payment.order ? "order" : "consultation", number: payment.order?.orderNumber ?? payment.appointment?.appointmentNumber ?? "",
      customer: payment.order?.customerName ?? payment.appointment?.patientName ?? "",
    })), total, page, pageSize),
    due,
    settings,
    gateway: paymentsMode(),
    totals: Object.fromEntries(totals.map((t) => [t.status, { count: t._count, amount: num(t._sum.amount) }])),
  });
});

const refundInput = z
  .object({
    orderId: z.coerce.number().int().positive().optional(),
    appointmentId: z.coerce.number().int().positive().optional(),
    amount: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.number().positive("Enter an amount above zero").optional()),
    reason: z.string().trim().min(3, "Say why the money is being returned").max(300),
  })
  .refine((v) => Boolean(v.orderId) !== Boolean(v.appointmentId), "Choose an order or a consultation");

refundRoutes.post("/", async (req, res) => {
  const input = refundInput.parse(req.body);
  const target = input.orderId ? { orderId: input.orderId } : { appointmentId: input.appointmentId! };
  const refund = await startRefund({ ...target, amount: input.amount, reason: input.reason, byUserId: req.user!.id });
  await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "refund.create", entity: "Refund", entityId: String(refund.id), changes: { ...target, amount: num(refund.amount), reason: input.reason, status: refund.status } } });
  if (refund.status === "FAILED") throw new HttpError(502, refund.error ?? "The refund did not go through");
  res.status(201).json({ id: refund.id, status: refund.status, amount: num(refund.amount) });
});

refundRoutes.post("/:id/retry", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const failed = await prisma.refund.findUnique({ where: { id } });
  if (!failed) throw notFound("Refund");
  if (failed.status !== "FAILED") throw new HttpError(400, "Only a refund that failed can be tried again");
  const target = failed.orderId ? { orderId: failed.orderId } : { appointmentId: failed.appointmentId! };
  const refund = await startRefund({ ...target, amount: num(failed.amount), reason: failed.reason ?? "Refund", byUserId: req.user!.id });
  if (refund.status === "FAILED") throw new HttpError(502, refund.error ?? "The refund did not go through");
  res.status(201).json({ id: refund.id, status: refund.status, amount: num(refund.amount) });
});

refundRoutes.put("/settings", async (req, res) => {
  const input = z.object({ automatic: z.boolean() }).parse(req.body);
  const saved = await saveRefundSettings(input);
  await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "refund.settings", entity: "Setting", entityId: "refunds", changes: saved } });
  res.json(saved);
});

// Only a refund that failed can be removed: no money moved. One that was sent, or is on its way, stays.
refundRoutes.post("/bulk-delete", async (req, res) => {
  const { ids } = idsBody.parse(req.body);
  const onReturns = await prisma.returnRequest.findMany({ where: { refundId: { in: ids } }, select: { refundId: true } });
  const linked = new Set(onReturns.map((r) => r.refundId));
  const deletable = await prisma.refund.findMany({ where: { id: { in: ids.filter((id) => !linked.has(id)) }, status: "FAILED" }, select: { id: true } });
  const gone = deletable.map((r) => r.id);
  const deleted = await prisma.refund.deleteMany({ where: { id: { in: gone }, status: "FAILED" } });
  await logBulkDelete(req.user!.id, "Refund", gone);
  res.json(bulkResult(deleted.count, ids.length - deleted.count, "Only refunds that failed can be deleted. Refunds that were sent, are on their way, or belong to a return were kept."));
});
