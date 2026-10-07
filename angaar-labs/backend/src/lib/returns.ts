import type { Prisma } from "../generated/prisma/client";
import { HttpError, num } from "./http";
import { money, notify, notifyStaff, siteLink } from "./notifications";
import { prisma } from "./prisma";
import { refundSettings, startRefund } from "./refunds";
import { autoBookReturnPickup, cancelReturnPickup } from "./return-pickup";

// A customer sending back all or part of a delivered order.
//
//   asked for      the customer (or staff, on their behalf) says what is coming back and why
//   approved       staff agree, or the system does when "approve automatically" is on
//   picked up      the courier has the parcel (optional step)
//   received       the parcel is opened: good units go back on the shelf, and the refund starts
//   refunded       the money is back with the customer; or "closed" when there was none to return
//
// Stock is only put back when the parcel has actually arrived, and only the units staff say are fit to sell.

const KEY = "returns";
export type ReturnSettings = { windowDays: number; autoApprove: boolean; reasons: string[]; instructions: string };
const DEFAULTS: ReturnSettings = {
  windowDays: 7,
  autoApprove: false,
  reasons: ["Wrong item received", "Damaged or leaking on arrival", "Near or past its expiry date", "Something was missing from the parcel", "Ordered by mistake"],
  instructions: "Please keep the items in their original packing with the invoice. Our courier will collect the parcel from your delivery address.",
};
export const returnSettings = async (): Promise<ReturnSettings> => {
  const saved = await prisma.setting.findUnique({ where: { key: KEY } });
  return { ...DEFAULTS, ...((saved?.value ?? {}) as Partial<ReturnSettings>) };
};
export const saveReturnSettings = async (value: ReturnSettings) => {
  await prisma.setting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } });
  return value;
};

const round = (value: number) => Math.round(value * 100) / 100;
const OPEN = ["REQUESTED", "APPROVED", "PICKED_UP"] as const; // not finished yet
const BACK = ["RECEIVED", "REFUNDED", "CLOSED"] as const; // the parcel has arrived
const titleCase = (value: string) => value.replace(/(^|\s)[a-z]/g, (letter) => letter.toUpperCase());

const loadOrder = (orderId: number, db: Prisma.TransactionClient | typeof prisma = prisma) =>
  db.order.findUnique({
    where: { id: orderId },
    include: {
      items: { orderBy: { id: "asc" } },
      returns: { where: { status: { notIn: ["REJECTED", "CANCELLED"] } }, include: { items: true } },
    },
  });
type LoadedOrder = NonNullable<Awaited<ReturnType<typeof loadOrder>>>;

/** How many of each line can still be sent back: what was bought, less what is already in a return. */
const returnableOf = (order: LoadedOrder) => {
  const taken = new Map<number, number>();
  for (const request of order.returns) for (const item of request.items) taken.set(item.orderItemId, (taken.get(item.orderItemId) ?? 0) + item.quantity);
  return new Map(order.items.map((item) => [item.id, Math.max(0, item.quantity - (taken.get(item.id) ?? 0))]));
};

/** What the chosen units cost the customer, after their share of any coupon. Delivery charges are not included. */
const valueOf = (order: LoadedOrder, lines: { orderItemId: number; quantity: number }[]) => {
  const itemById = new Map(order.items.map((item) => [item.id, item]));
  const goods = lines.reduce((sum, line) => {
    const item = itemById.get(line.orderItemId);
    return item ? sum + (num(item.lineTotal) / item.quantity) * line.quantity : sum;
  }, 0);
  const subtotal = num(order.subtotal);
  const couponShare = subtotal > 0 ? num(order.couponDiscount) * (goods / subtotal) : 0;
  return round(Math.max(0, goods - couponShare));
};

/** The most that can still be given back on this order: what was charged, less what other returns already take. */
const refundRoom = (order: LoadedOrder, exceptReturnId?: number) =>
  round(Math.max(0, num(order.grandTotal) - order.returns.filter((r) => r.id !== exceptReturnId).reduce((sum, r) => sum + num(r.refundAmount), 0)));

/** What the customer's page and the "new return" form need to know about an order. */
export const returnOptions = async (orderId: number, { forCustomer = false } = {}) => {
  const [order, settings] = await Promise.all([loadOrder(orderId), returnSettings()]);
  if (!order) return null;
  const left = returnableOf(order);
  const windowEnds = order.deliveredAt ? new Date(order.deliveredAt.getTime() + settings.windowDays * 86_400_000) : null;
  const open = order.returns.find((r) => (OPEN as readonly string[]).includes(r.status));
  const anyLeft = [...left.values()].some((quantity) => quantity > 0);
  const why =
    open ? `Return ${open.returnNumber} is already open for this order`
    : !anyLeft ? "Everything in this order has already been returned"
    : !["DELIVERED", "RETURN_REQUESTED"].includes(order.status) ? "Only a delivered order can be returned"
    : forCustomer && settings.windowDays === 0 ? "Returns are not accepted online. Please contact us."
    : forCustomer && (!windowEnds || windowEnds < new Date()) ? `Returns are accepted for ${settings.windowDays} ${settings.windowDays === 1 ? "day" : "days"} after delivery`
    : null;
  return {
    order, settings, windowEnds, canReturn: why === null, why,
    items: order.items.map((item) => ({
      orderItemId: item.id, productName: item.productName, variantTitle: item.variantTitle, imageUrl: item.imageUrl,
      quantity: item.quantity, returnable: left.get(item.id) ?? 0, unitPrice: round(num(item.lineTotal) / item.quantity),
    })),
    refundRoom: refundRoom(order),
  };
};

const newReturnNumber = async () => {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()).replace(/-/g, "").slice(2);
  for (;;) {
    const returnNumber = `RT${day}-${Math.floor(1000 + Math.random() * 9000)}`;
    if (!(await prisma.returnRequest.findUnique({ where: { returnNumber }, select: { id: true } }))) return returnNumber;
  }
};

// ───────────────────────────────────────────── telling people

const tell = async (returnId: number, event: string, extra: Record<string, unknown> = {}) => {
  try {
    const request = await prisma.returnRequest.findUnique({
      where: { id: returnId },
      include: { items: { include: { orderItem: { select: { productName: true, variantTitle: true } } } }, order: true },
    });
    if (!request) return;
    const { order } = request;
    const values = {
      returnNumber: request.returnNumber, orderNumber: order.orderNumber, reason: request.reason,
      items: request.items.map((item) => `• ${titleCase(item.orderItem.productName)}${item.orderItem.variantTitle ? ` (${item.orderItem.variantTitle})` : ""} × ${item.quantity}`).join("\n"),
      amount: money(request.refundAmount), note: request.adminNote ?? "", customer: order.customerName ?? "",
      link: siteLink(`${order.channel === "B2B" ? "/doctor" : "/patient"}/orders/${order.id}`), adminLink: siteLink(`/admin/returns?q=${request.returnNumber}`),
      ...extra,
    };
    if (event.startsWith("staff.")) await notifyStaff(event, values, { type: "ReturnRequest", id: request.id });
    else await notify(event, { userId: order.userId, name: order.customerName, email: order.customerEmail, phone: order.customerPhone }, values, { type: "ReturnRequest", id: request.id });
  } catch (error) {
    console.error("[returns]", event, error);
  }
};

// ───────────────────────────────────────────── the steps

type NewReturn = {
  orderId: number;
  items: { orderItemId: number; quantity: number }[];
  reason: string;
  description?: string | null;
  photoUrls?: string[];
  customerId?: number; // the customer asking for themselves
  staffId?: number; // staff opening it for them
};

export const openReturn = async (input: NewReturn) => {
  const options = await returnOptions(input.orderId, { forCustomer: !input.staffId });
  if (!options) throw new HttpError(404, "Order not found");
  if (!options.canReturn) throw new HttpError(400, options.why ?? "This order cannot be returned");
  const { order, settings } = options;

  // the same line chosen twice counts once
  const wanted = new Map<number, number>();
  for (const line of input.items) wanted.set(line.orderItemId, (wanted.get(line.orderItemId) ?? 0) + line.quantity);
  const lines = [...wanted].map(([orderItemId, quantity]) => ({ orderItemId, quantity })).filter((line) => line.quantity > 0);
  if (lines.length === 0) throw new HttpError(400, "Choose at least one item to return");
  for (const line of lines) {
    const item = options.items.find((i) => i.orderItemId === line.orderItemId);
    if (!item) throw new HttpError(400, "One of the items is not part of this order");
    if (line.quantity > item.returnable) throw new HttpError(400, `Only ${item.returnable} of ${titleCase(item.productName)} can be returned`);
  }

  const approved = Boolean(input.staffId) || settings.autoApprove;
  const returnNumber = await newReturnNumber();
  const refundAmount = Math.min(valueOf(order, lines), options.refundRoom);
  const now = new Date();

  const created = await prisma.$transaction(async (tx) => {
    // nobody else may have opened one in the meantime
    const racing = await tx.returnRequest.count({ where: { orderId: order.id, status: { in: [...OPEN] } } });
    if (racing > 0) throw new HttpError(409, "A return is already open for this order");
    const request = await tx.returnRequest.create({
      data: {
        returnNumber, orderId: order.id, reason: input.reason, description: input.description ?? null, photoUrls: input.photoUrls ?? [],
        status: approved ? "APPROVED" : "REQUESTED", refundAmount,
        requestedById: input.customerId ?? null, createdById: input.staffId ?? null,
        reviewedById: approved ? input.staffId ?? null : null, reviewedAt: approved ? now : null,
        adminNote: approved ? settings.instructions : null,
        items: { create: lines },
      },
    });
    await tx.order.update({ where: { id: order.id }, data: { status: "RETURN_REQUESTED" } });
    await tx.orderStatusHistory.create({
      data: { orderId: order.id, status: "RETURN_REQUESTED", note: `Return ${returnNumber} ${input.staffId ? "opened by staff" : "asked for by the customer"}: ${input.reason}`, changedById: input.staffId ?? input.customerId ?? null },
    });
    return request;
  });

  void (async () => {
    if (approved) {
      await tell(created.id, "return.approved");
      await autoBookReturnPickup(created.id);
    } else {
      await tell(created.id, "return.requested");
      await tell(created.id, "staff.return_requested");
    }
  })();
  return created;
};

/** Staff say yes or no to a return a customer asked for. */
export const decideReturn = async (returnId: number, input: { approve: boolean; note?: string | null; refundAmount?: number; staffId: number }) => {
  const request = await prisma.returnRequest.findUnique({ where: { id: returnId } });
  if (!request) throw new HttpError(404, "Return not found");
  if (request.status !== "REQUESTED") throw new HttpError(400, "This return has already been decided");
  const order = (await loadOrder(request.orderId))!;
  const settings = await returnSettings();
  if (input.approve && input.refundAmount !== undefined && input.refundAmount > refundRoom(order, request.id) + 0.005) {
    throw new HttpError(400, `At most ${money(refundRoom(order, request.id))} can be given back on this order`);
  }

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.returnRequest.updateMany({
      where: { id: returnId, status: "REQUESTED" },
      data: {
        status: input.approve ? "APPROVED" : "REJECTED", reviewedById: input.staffId, reviewedAt: new Date(),
        adminNote: input.note?.trim() || (input.approve ? settings.instructions : null),
        ...(input.approve && input.refundAmount !== undefined ? { refundAmount: round(input.refundAmount) } : {}),
      },
    });
    if (claimed.count === 0) throw new HttpError(409, "This return has already been decided");
    if (!input.approve) {
      // nothing is coming back: the order is simply a delivered order again
      await tx.order.updateMany({ where: { id: request.orderId, status: "RETURN_REQUESTED" }, data: { status: "DELIVERED" } });
      await tx.orderStatusHistory.create({ data: { orderId: request.orderId, status: "DELIVERED", note: `Return ${request.returnNumber} was not accepted${input.note ? `: ${input.note}` : ""}`, changedById: input.staffId } });
    } else {
      await tx.orderStatusHistory.create({ data: { orderId: request.orderId, status: "RETURN_REQUESTED", note: `Return ${request.returnNumber} approved`, changedById: input.staffId } });
    }
    await tx.auditLog.create({ data: { actorId: input.staffId, action: input.approve ? "return.approve" : "return.reject", entity: "ReturnRequest", entityId: String(returnId), changes: { note: input.note ?? null } } });
  });
  void (async () => {
    await tell(returnId, input.approve ? "return.approved" : "return.rejected");
    if (input.approve) await autoBookReturnPickup(returnId);
  })();
};

/** An approved return is called off before the parcel is collected (the customer changed their mind). */
export const cancelReturn = async (returnId: number, input: { note: string; staffId: number }) => {
  const request = await prisma.returnRequest.findUnique({ where: { id: returnId }, select: { status: true, orderId: true, returnNumber: true } });
  if (!request) throw new HttpError(404, "Return not found");
  if (request.status !== "APPROVED") throw new HttpError(400, "Only a return that is approved and not yet collected can be cancelled");
  // the courier booking goes first: if it cannot be taken back, staff should know before the return disappears from their list
  const pickupProblem = await cancelReturnPickup(returnId);
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.returnRequest.updateMany({ where: { id: returnId, status: "APPROVED" }, data: { status: "CANCELLED", adminNote: input.note, refundAmount: 0 } });
    if (claimed.count === 0) throw new HttpError(409, "This return has already moved on");
    await tx.order.updateMany({ where: { id: request.orderId, status: "RETURN_REQUESTED" }, data: { status: "DELIVERED" } });
    await tx.orderStatusHistory.create({ data: { orderId: request.orderId, status: "DELIVERED", note: `Return ${request.returnNumber} cancelled: ${input.note}`, changedById: input.staffId } });
    await tx.auditLog.create({ data: { actorId: input.staffId, action: "return.cancel", entity: "ReturnRequest", entityId: String(returnId), changes: { note: input.note } } });
  });
  void tell(returnId, "return.cancelled");
  return { pickupProblem };
};

/** The courier has collected the parcel from the customer. */
export const markPickedUp = async (returnId: number, input: { courier?: string | null; tracking?: string | null; staffId: number }) => {
  const changed = await prisma.returnRequest.updateMany({
    where: { id: returnId, status: "APPROVED" },
    data: { status: "PICKED_UP", pickedUpAt: new Date(), pickupCourier: input.courier?.trim() || null, pickupTracking: input.tracking?.trim() || null },
  });
  if (changed.count === 0) throw new HttpError(400, "Only an approved return can be marked as picked up");
  await prisma.auditLog.create({ data: { actorId: input.staffId, action: "return.picked-up", entity: "ReturnRequest", entityId: String(returnId) } });
};

/**
 * The parcel has arrived and been opened. Units fit to sell go back on the shelf. With nothing to
 * give back the return is closed; otherwise the refund is the next step (started here when the
 * customer paid online and automatic refunds are on).
 */
export const receiveReturn = async (returnId: number, input: { restock: { returnItemId: number; quantity: number }[]; refundAmount: number; note?: string | null; staffId: number }) => {
  const request = await prisma.returnRequest.findUnique({ where: { id: returnId }, include: { items: { include: { orderItem: true } } } });
  if (!request) throw new HttpError(404, "Return not found");
  if (!["APPROVED", "PICKED_UP"].includes(request.status)) throw new HttpError(400, "Only an approved return can be received");
  const order = (await loadOrder(request.orderId))!;
  const refundAmount = round(input.refundAmount);
  if (refundAmount < 0) throw new HttpError(400, "The refund cannot be negative");
  if (refundAmount > refundRoom(order, request.id) + 0.005) throw new HttpError(400, `At most ${money(refundRoom(order, request.id))} can be given back on this order`);

  const restockOf = new Map(input.restock.map((line) => [line.returnItemId, line.quantity]));
  for (const item of request.items) {
    const quantity = restockOf.get(item.id) ?? 0;
    if (quantity < 0 || quantity > item.quantity) throw new HttpError(400, `Between 0 and ${item.quantity} of ${titleCase(item.orderItem.productName)} can go back on the shelf`);
  }

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.returnRequest.updateMany({
      where: { id: returnId, status: { in: ["APPROVED", "PICKED_UP"] } },
      data: { status: refundAmount > 0 ? "RECEIVED" : "CLOSED", receivedAt: new Date(), refundAmount, ...(input.note?.trim() ? { adminNote: input.note.trim() } : {}) },
    });
    if (claimed.count === 0) throw new HttpError(409, "This return has already been received");

    for (const item of request.items) {
      const quantity = restockOf.get(item.id) ?? 0;
      await tx.returnItem.update({ where: { id: item.id }, data: { restocked: quantity } });
      if (quantity > 0 && item.orderItem.variantId) {
        const after = await tx.productVariant.update({ where: { id: item.orderItem.variantId }, data: { stockQuantity: { increment: quantity } }, select: { stockQuantity: true } });
        await tx.inventoryMovement.create({
          data: { variantId: item.orderItem.variantId, type: "RETURN", quantity, balanceAfter: after.stockQuantity, orderId: request.orderId, note: `Return ${request.returnNumber}`, createdById: input.staffId },
        });
      }
    }

    // is anything of the order still with the customer?
    const back = await tx.returnItem.groupBy({ by: ["orderItemId"], where: { returnRequest: { orderId: request.orderId, status: { in: [...BACK] } } }, _sum: { quantity: true } });
    const backOf = new Map(back.map((b) => [b.orderItemId, b._sum.quantity ?? 0]));
    const everything = order.items.every((item) => (backOf.get(item.id) ?? 0) >= item.quantity);
    const status = everything ? "RETURNED" : "DELIVERED";
    await tx.order.update({ where: { id: request.orderId }, data: { status } });
    const units = request.items.reduce((sum, item) => sum + item.quantity, 0);
    const shelved = request.items.reduce((sum, item) => sum + (restockOf.get(item.id) ?? 0), 0);
    await tx.orderStatusHistory.create({
      data: { orderId: request.orderId, status, note: `Return ${request.returnNumber} received: ${units} ${units === 1 ? "unit" : "units"} came back, ${shelved} put back in stock${everything ? "" : ". The rest of the order stays with the customer."}`, changedById: input.staffId },
    });
    await tx.auditLog.create({ data: { actorId: input.staffId, action: "return.receive", entity: "ReturnRequest", entityId: String(returnId), changes: { refundAmount, restocked: shelved, units } } });
  });

  let automatic = false;
  if (refundAmount > 0 && (await refundSettings()).automatic) {
    // the customer paid online and the owner has asked for refunds to go by themselves
    automatic = await refundReturn(returnId, { method: "GATEWAY", automatic: true }).then(() => true).catch(() => false);
  }
  if (!automatic) void tell(returnId, "return.received", { refundNote: refundAmount > 0 ? `Your refund of ${money(refundAmount)} will be sent shortly.` : "No refund is due for this return." });
  return { refundStarted: automatic };
};

/** The online payment an order's refund can go back to, and how much of it is left. */
export const gatewayRoom = async (orderId: number) => {
  const payment = await prisma.payment.findFirst({
    where: { orderId, status: { in: ["SUCCESS", "REFUNDED"] }, OR: [{ provider: "TEST" }, { provider: "PHONEPE", providerRef: { startsWith: "DH" } }] },
    orderBy: { id: "desc" }, include: { refunds: { where: { status: { in: ["PENDING", "SUCCESS"] } }, select: { amount: true } } },
  });
  if (!payment) return null;
  return { left: round(num(payment.amount) - payment.refunds.reduce((sum, r) => sum + num(r.amount), 0)), test: payment.provider === "TEST" };
};

/**
 * Gives the money back for a received return.
 *   GATEWAY  through PhonePe to where the customer paid from
 *   BANK     staff sent it themselves (bank transfer or UPI) and type the reference
 *   CREDIT   taken off what a wholesale customer owes
 */
export const refundReturn = async (returnId: number, input: { method: "GATEWAY" | "BANK" | "CREDIT"; reference?: string | null; staffId?: number; automatic?: boolean }) => {
  const request = await prisma.returnRequest.findUnique({ where: { id: returnId }, include: { order: { select: { id: true, grandTotal: true, orderNumber: true } } } });
  if (!request) throw new HttpError(404, "Return not found");
  if (request.status !== "RECEIVED") throw new HttpError(400, "A return is refunded after the parcel has been received");
  const amount = num(request.refundAmount);
  if (amount <= 0) throw new HttpError(400, "There is nothing to refund on this return");
  if (request.refundId) {
    const earlier = await prisma.refund.findUnique({ where: { id: request.refundId }, select: { status: true } });
    if (earlier && earlier.status !== "FAILED") throw new HttpError(400, earlier.status === "PENDING" ? "The refund is already on its way" : "This return has already been refunded");
  }

  if (input.method === "GATEWAY") {
    const refund = await startRefund({ orderId: request.orderId, amount, reason: `Return ${request.returnNumber}: ${request.reason}`, byUserId: input.staffId, automatic: input.automatic });
    await prisma.returnRequest.update({ where: { id: returnId }, data: { refundId: refund.id, refundMethod: "GATEWAY" } });
    if (refund.status === "FAILED") throw new HttpError(502, refund.error ?? "The refund did not go through");
    // a refund that finished straight away closed before it was linked to this return
    if (refund.status === "SUCCESS") await prisma.returnRequest.updateMany({ where: { id: returnId, status: "RECEIVED" }, data: { status: "REFUNDED", refundedAt: new Date() } });
    return { status: refund.status };
  }

  const reference = input.reference?.trim() || null;
  if (input.method === "BANK" && !reference) throw new HttpError(400, "Enter the bank or UPI reference for this refund");
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.returnRequest.updateMany({ where: { id: returnId, status: "RECEIVED" }, data: { status: "REFUNDED", refundedAt: new Date(), refundMethod: input.method, refundReference: reference } });
    if (claimed.count === 0) throw new HttpError(409, "This return has already been refunded");
    const order = await tx.order.findUniqueOrThrow({ where: { id: request.orderId }, select: { status: true } });
    if (input.method === "BANK" && amount >= num(request.order.grandTotal) - 0.005) await tx.order.update({ where: { id: request.orderId }, data: { paymentStatus: "REFUNDED" } });
    await tx.orderStatusHistory.create({
      data: {
        orderId: request.orderId, status: order.status, changedById: input.staffId ?? null,
        note: input.method === "BANK" ? `${money(amount)} refunded by bank transfer or UPI for return ${request.returnNumber} (reference ${reference})` : `${money(amount)} taken off the amount owed, for return ${request.returnNumber}${reference ? ` (${reference})` : ""}`,
      },
    });
    await tx.auditLog.create({ data: { actorId: input.staffId ?? null, action: "return.refund", entity: "ReturnRequest", entityId: String(returnId), changes: { method: input.method, amount, reference } } });
  });
  void tell(returnId, "return.refunded", { how: input.method === "BANK" ? `by bank transfer or UPI${reference ? ` (reference ${reference})` : ""}` : "by taking it off the amount you owe us" });
  return { status: "SUCCESS" as const };
};

/** Received, but staff decide no money goes back (for example the seal was broken). */
export const closeReturn = async (returnId: number, input: { note: string; staffId: number }) => {
  const request = await prisma.returnRequest.findUnique({ where: { id: returnId }, select: { refundId: true, orderId: true, returnNumber: true } });
  if (!request) throw new HttpError(404, "Return not found");
  if (request.refundId) {
    const refund = await prisma.refund.findUnique({ where: { id: request.refundId }, select: { status: true } });
    if (refund?.status === "PENDING") throw new HttpError(400, "A refund for this return is already on its way");
  }
  const changed = await prisma.returnRequest.updateMany({ where: { id: returnId, status: "RECEIVED" }, data: { status: "CLOSED", refundAmount: 0, adminNote: input.note } });
  if (changed.count === 0) throw new HttpError(400, "Only a received return can be closed without a refund");
  const order = await prisma.order.findUniqueOrThrow({ where: { id: request.orderId }, select: { status: true } });
  await prisma.orderStatusHistory.create({ data: { orderId: request.orderId, status: order.status, note: `Return ${request.returnNumber} closed without a refund: ${input.note}`, changedById: input.staffId } });
  await prisma.auditLog.create({ data: { actorId: input.staffId, action: "return.close", entity: "ReturnRequest", entityId: String(returnId), changes: { note: input.note } } });
  void tell(returnId, "return.received", { refundNote: `No refund is being made: ${input.note}` });
};
