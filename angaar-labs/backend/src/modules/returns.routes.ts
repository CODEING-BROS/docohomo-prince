import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import type { Prisma } from "../generated/prisma/client";
import { ReturnStatus } from "../generated/prisma/client";
import { bulkResult, idsBody, logBulkDelete } from "../lib/bulk";
import { HttpError, getPage, idParam, notFound, num, numOrNull, optionalString, paged } from "../lib/http";
import { prisma } from "../lib/prisma";
import { refundSettings } from "../lib/refunds";
import { bookReturnPickup, refreshReturnPickup } from "../lib/return-pickup";
import { courierProblem, shippingSettings } from "../lib/shipping";
import { trackingLink } from "../lib/shiprocket";
import {
  cancelReturn, closeReturn, decideReturn, gatewayRoom, markPickedUp, openReturn, receiveReturn, refundReturn, returnOptions, returnSettings, saveReturnSettings,
} from "../lib/returns";
import { imageType, store } from "./uploads.routes";

// Returns: a customer sending back all or part of a delivered order.
//   returnRoutes     /api/admin/returns   staff: the list, each step, the rules
//   returnMeRoutes   /api/me              a signed-in customer asking for a return on their own order
export const returnRoutes = Router();
export const returnMeRoutes = Router();

const blank = (v: unknown) => (v === "" || v === null ? undefined : v);
const itemsInput = z.array(z.object({ orderItemId: z.coerce.number().int().positive(), quantity: z.coerce.number().int().min(1).max(100_000) })).min(1, "Choose at least one item to return").max(200);
const reasonInput = z.string().trim().min(3, "Say why the items are coming back").max(200);
const descriptionInput = z.preprocess(blank, z.string().trim().max(1000).optional());

// ───────────────────────────────────────────── staff

const listInput = z.object({ q: optionalString, status: z.preprocess(blank, z.enum(ReturnStatus).optional()) });

const withDetail = {
  items: { include: { orderItem: { select: { productName: true, variantTitle: true, imageUrl: true, sku: true, quantity: true, lineTotal: true } } } },
  order: {
    select: {
      id: true, orderNumber: true, channel: true, status: true, paymentMethod: true, paymentStatus: true, grandTotal: true, deliveredAt: true,
      customerName: true, customerPhone: true, shippingAddress: true, shippingCity: true, shippingState: true, shippingPincode: true,
    },
  },
} satisfies Prisma.ReturnRequestInclude;
type Detailed = Prisma.ReturnRequestGetPayload<{ include: typeof withDetail }>;

const out = (request: Detailed, refund?: { status: string; error: string | null } | null) => ({
  ...request,
  refundAmount: numOrNull(request.refundAmount),
  order: { ...request.order, grandTotal: num(request.order.grandTotal) },
  items: request.items.map(({ orderItem, ...item }) => ({
    ...item, productName: orderItem.productName, variantTitle: orderItem.variantTitle, imageUrl: orderItem.imageUrl, sku: orderItem.sku,
    bought: orderItem.quantity, unitPrice: Math.round((num(orderItem.lineTotal) / orderItem.quantity) * 100) / 100,
  })),
  units: request.items.reduce((sum, item) => sum + item.quantity, 0),
  // a pickup booked through Shiprocket can be followed online; one typed in by staff cannot
  pickupBooked: Boolean(request.pickupShipmentRef && request.pickupTracking),
  pickupTrackingUrl: request.pickupShipmentRef && request.pickupTracking ? trackingLink(request.pickupTracking) : null,
  refund: refund ?? null, // the gateway refund, when one was started
});

returnRoutes.get("/", async (req, res) => {
  const { q, status } = listInput.parse(req.query);
  const { page, pageSize, skip, take } = getPage(req);
  const base: Prisma.ReturnRequestWhereInput = q
    ? { OR: [{ returnNumber: { contains: q, mode: "insensitive" } }, { order: { orderNumber: { contains: q, mode: "insensitive" } } }, { order: { customerName: { contains: q, mode: "insensitive" } } }, { order: { customerPhone: { contains: q } } }] }
    : {};
  const where = { ...base, ...(status ? { status } : {}) };
  const [rows, total, counts, settings, refunds] = await Promise.all([
    prisma.returnRequest.findMany({ where, orderBy: { id: "desc" }, skip, take, include: withDetail }),
    prisma.returnRequest.count({ where }),
    prisma.returnRequest.groupBy({ by: ["status"], where: base, _count: true }),
    returnSettings(),
    refundSettings(),
  ]);
  const linked = await prisma.refund.findMany({ where: { id: { in: rows.map((r) => r.refundId).filter((id): id is number => id !== null) } }, select: { id: true, status: true, error: true } });
  const refundById = new Map(linked.map((r) => [r.id, r]));
  res.json({
    ...paged(rows.map((row) => out(row, row.refundId ? refundById.get(row.refundId) : null)), total, page, pageSize),
    statusCounts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
    settings, automaticRefunds: refunds.automatic,
  });
});

/** What can still be sent back on an order, for the "new return" form. Found by id or by order number. */
returnRoutes.get("/order", async (req, res) => {
  const { id, number } = z.object({ id: z.preprocess(blank, z.coerce.number().int().positive().optional()), number: optionalString }).parse(req.query);
  const orderId = id ?? (number ? (await prisma.order.findFirst({ where: { orderNumber: { equals: number, mode: "insensitive" } }, select: { id: true } }))?.id : undefined);
  if (!orderId) throw new HttpError(404, "No order has that number");
  const options = await returnOptions(orderId);
  if (!options) throw notFound("Order");
  res.json({
    orderId, orderNumber: options.order.orderNumber, customerName: options.order.customerName, deliveredAt: options.order.deliveredAt,
    canReturn: options.canReturn, why: options.why, items: options.items, reasons: options.settings.reasons, refundRoom: options.refundRoom,
  });
});

returnRoutes.get("/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const request = await prisma.returnRequest.findUnique({ where: { id }, include: withDetail });
  if (!request) throw notFound("Return");
  const [refund, gateway, shipping, courier] = await Promise.all([
    request.refundId ? prisma.refund.findUnique({ where: { id: request.refundId }, select: { status: true, error: true } }) : null,
    gatewayRoom(request.orderId),
    shippingSettings(),
    courierProblem(), // why the "Book courier pickup" button cannot be used, when it cannot
  ]);
  res.json({ ...out(request, refund), gateway, courier: { ready: courier === null, why: courier, automatic: courier === null && shipping.mode === "auto" } });
});

returnRoutes.post("/", async (req, res) => {
  const input = z.object({ orderId: z.coerce.number().int().positive(), items: itemsInput, reason: reasonInput, description: descriptionInput }).parse(req.body);
  const created = await openReturn({ ...input, staffId: req.user!.id });
  await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "return.create", entity: "ReturnRequest", entityId: String(created.id) } });
  res.status(201).json({ id: created.id, returnNumber: created.returnNumber });
});

const noteInput = z.preprocess(blank, z.string().trim().max(500).optional());
const amountInput = z.coerce.number("Enter the refund amount").min(0, "The refund cannot be negative").max(10_000_000);

returnRoutes.post("/:id/approve", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const input = z.object({ note: noteInput, refundAmount: z.preprocess(blank, amountInput.optional()) }).parse(req.body);
  await decideReturn(id, { approve: true, ...input, staffId: req.user!.id });
  res.json({ ok: true });
});

returnRoutes.post("/:id/reject", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { note } = z.object({ note: z.string().trim().min(3, "Tell the customer why the return is not accepted").max(500) }).parse(req.body);
  await decideReturn(id, { approve: false, note, staffId: req.user!.id });
  res.json({ ok: true });
});

returnRoutes.post("/:id/pickup", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const input = z.object({ courier: z.preprocess(blank, z.string().trim().max(80).optional()), tracking: z.preprocess(blank, z.string().trim().max(80).optional()) }).parse(req.body);
  await markPickedUp(id, { ...input, staffId: req.user!.id });
  res.json({ ok: true });
});

/** Books a courier through Shiprocket to collect the parcel from the customer. */
returnRoutes.post("/:id/book-pickup", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const booked = await bookReturnPickup(id);
  await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "return.book-pickup", entity: "ReturnRequest", entityId: String(id), changes: { courier: booked.pickupCourier, tracking: booked.pickupTracking } } });
  res.json({ courier: booked.pickupCourier, tracking: booked.pickupTracking });
});

/** Asks the courier right now where the parcel is. */
returnRoutes.post("/:id/check-pickup", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const status = await refreshReturnPickup(id).catch((error) => { throw new HttpError(502, error instanceof Error ? error.message : "The courier could not be asked"); });
  if (status === null) throw new HttpError(400, "No courier was booked through Shiprocket for this return");
  res.json({ status });
});

returnRoutes.post("/:id/cancel", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { note } = z.object({ note: z.string().trim().min(3, "Say why the return is cancelled").max(500) }).parse(req.body);
  res.json(await cancelReturn(id, { note, staffId: req.user!.id }));
});

returnRoutes.post("/:id/receive", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const input = z.object({
    restock: z.array(z.object({ returnItemId: z.coerce.number().int().positive(), quantity: z.coerce.number().int().min(0) })).max(200),
    refundAmount: amountInput,
    note: noteInput,
  }).parse(req.body);
  res.json(await receiveReturn(id, { ...input, staffId: req.user!.id }));
});

returnRoutes.post("/:id/refund", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const input = z.object({ method: z.enum(["GATEWAY", "BANK", "CREDIT"]), reference: z.preprocess(blank, z.string().trim().max(120).optional()) }).parse(req.body);
  res.json(await refundReturn(id, { ...input, staffId: req.user!.id }));
});

returnRoutes.post("/:id/close", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { note } = z.object({ note: z.string().trim().min(3, "Say why no refund is being made").max(500) }).parse(req.body);
  await closeReturn(id, { note, staffId: req.user!.id });
  res.json({ ok: true });
});

// A return that was turned down or called off moved no goods and no money, so it can be removed.
// Any other return is in progress or is the record of stock and a refund.
returnRoutes.post("/bulk-delete", async (req, res) => {
  const { ids } = idsBody.parse(req.body);
  const where = { id: { in: ids }, status: { in: ["REJECTED", "CANCELLED"] as ReturnStatus[] }, refundId: null, receivedAt: null, refundedAt: null };
  const gone = (await prisma.returnRequest.findMany({ where, select: { id: true } })).map((r) => r.id);
  const deleted = await prisma.returnRequest.deleteMany({ where: { ...where, id: { in: gone } } });
  await logBulkDelete(req.user!.id, "ReturnRequest", gone);
  res.json(bulkResult(deleted.count, ids.length - deleted.count, "Only rejected and cancelled returns can be deleted. Returns that are open, received or refunded were kept."));
});

returnRoutes.put("/settings", async (req, res) => {
  const input = z.object({
    windowDays: z.coerce.number().int().min(0, "Days cannot be negative").max(90, "At most 90 days"),
    autoApprove: z.boolean(),
    reasons: z.array(z.string().trim().min(3).max(80)).min(1, "Keep at least one reason").max(15),
    instructions: z.string().trim().max(600),
  }).parse(req.body);
  const saved = await saveReturnSettings({ ...input, reasons: [...new Set(input.reasons)] });
  await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "return.settings", entity: "Setting", entityId: "returns", changes: saved } });
  res.json(saved);
});

// ───────────────────────────────────────────── the customer

const STEP_TEXT: Record<string, string> = {
  REQUESTED: "We are looking at your request", APPROVED: "Approved. Keep the parcel ready for pickup", REJECTED: "Not accepted",
  PICKED_UP: "On its way back to us", RECEIVED: "Received. Your refund is being made", REFUNDED: "Refunded", CLOSED: "Closed", CANCELLED: "Cancelled",
};

returnMeRoutes.get("/orders/:id/returns", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const mine = await prisma.order.findFirst({ where: { id, userId: req.user!.id }, select: { id: true } });
  if (!mine) throw notFound("Order");
  const options = (await returnOptions(id, { forCustomer: true }))!;
  const requests = await prisma.returnRequest.findMany({
    where: { orderId: id }, orderBy: { id: "desc" },
    include: { items: { include: { orderItem: { select: { productName: true, variantTitle: true } } } } },
  });
  res.json({
    canReturn: options.canReturn, why: options.why, windowEnds: options.windowEnds, windowDays: options.settings.windowDays,
    reasons: options.settings.reasons, items: options.items.filter((item) => item.returnable > 0),
    returns: requests.map((r) => ({
      id: r.id, returnNumber: r.returnNumber, status: r.status, statusText: STEP_TEXT[r.status] ?? r.status, reason: r.reason, createdAt: r.createdAt,
      refundAmount: numOrNull(r.refundAmount), note: r.adminNote,
      pickup: r.pickupTracking ? { courier: r.pickupCourier, tracking: r.pickupTracking, url: r.pickupShipmentRef ? trackingLink(r.pickupTracking) : null, status: r.pickupStatus } : null,
      items: r.items.map((item) => ({ productName: item.orderItem.productName, variantTitle: item.orderItem.variantTitle, quantity: item.quantity })),
    })),
  });
});

returnMeRoutes.post("/orders/:id/returns", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const mine = await prisma.order.findFirst({ where: { id, userId: req.user!.id }, select: { id: true } });
  if (!mine) throw notFound("Order");
  const input = z.object({
    items: itemsInput, reason: reasonInput, description: descriptionInput,
    photoUrls: z.array(z.string().regex(/^\/uploads\/returns\/[a-f0-9-]+\.(jpg|png|webp)$/)).max(4).default([]),
  }).parse(req.body);
  const created = await openReturn({ orderId: id, ...input, customerId: req.user!.id });
  res.status(201).json({ id: created.id, returnNumber: created.returnNumber, status: created.status });
});

const receive = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } }).single("file");

/** A photo of what arrived (damaged, wrong item…), attached to a return request. */
returnMeRoutes.post("/return-photo", (req, res, next) => {
  receive(req, res, async (err) => {
    try {
      if (err instanceof multer.MulterError) throw new HttpError(400, err.code === "LIMIT_FILE_SIZE" ? "The photo is larger than 5 MB" : "Could not read the upload");
      if (err) throw err;
      if (!req.file) throw new HttpError(400, "Choose a photo to upload");
      const type = imageType(req.file.buffer);
      if (!type || type === "gif") throw new HttpError(400, "Upload a JPG, PNG or WebP photo");
      res.status(201).json({ url: await store("returns", type, req.file.buffer) });
    } catch (error) {
      next(error);
    }
  });
});
