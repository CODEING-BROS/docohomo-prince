import { HttpError, num } from "./http";
import { notify, notifyStaff, siteLink } from "./notifications";
import { prisma } from "./prisma";
import { courierReady, shippingSettings, shippingTestMode, withPickupPlace } from "./shipping";
import { bookCourier, cancelParcel, createReturnParcel, pickupPlaceDetails, track, trackingLink } from "./shiprocket";

// Getting a returned parcel back from the customer through Shiprocket.
//
//   1. the return is approved: a return order is made at Shiprocket and a courier booked to collect
//      the parcel from the customer's address (by itself when Shipping, Courier is "Automatic",
//      otherwise with the "Book courier pickup" button)
//   2. tracking is checked every half hour: once the courier has the parcel the return shows as
//      picked up, and when it is back at the warehouse staff are told to open it
//   3. opening the parcel, counting what is fit to sell and refunding stay with staff
//
// Staff can still type a courier and tracking number by hand instead.

const withOrder = {
  items: { include: { orderItem: { include: { variant: { select: { weightGrams: true, sku: true } }, product: { select: { hsnCode: true } } } } } },
  order: true,
} as const;

const staffProblem = async (returnId: number, returnNumber: string, reason: string) => {
  await prisma.returnRequest.update({ where: { id: returnId }, data: { pickupProblem: reason.slice(0, 500) } });
  await notifyStaff("staff.return_pickup_problem", { returnNumber, reason, link: siteLink(`/admin/returns?q=${returnNumber}`) }, { type: "ReturnRequest", id: returnId });
};

/** Makes the return order at Shiprocket (once) and books the courier for it. */
export const bookReturnPickup = async (returnId: number) => {
  if (!courierReady) throw new HttpError(400, "Shiprocket is not connected yet");
  const settings = await withPickupPlace(await shippingSettings());
  if (settings.mode === "off") throw new HttpError(400, "Sending parcels through Shiprocket is switched off in Shipping settings");
  if (!shippingTestMode && !settings.pickupPlace) throw new HttpError(400, "Shiprocket has no pickup address yet. Add one in the Shiprocket panel: returned parcels are sent back to it.");

  const request = await prisma.returnRequest.findUnique({ where: { id: returnId }, include: withOrder });
  if (!request) throw new HttpError(404, "Return not found");
  if (request.status !== "APPROVED") throw new HttpError(400, "A pickup is booked for a return that is approved and not collected yet");
  if (request.pickupShipmentRef && request.pickupTracking) throw new HttpError(400, "A courier is already booked for this return");
  const { order } = request;
  if (!order.customerPhone || !order.shippingPincode || !order.shippingAddress) throw new HttpError(400, "The order has no full address or phone number to collect the parcel from");

  try {
    // on a development computer the courier is pretend: nothing is booked
    let shipmentRef = shippingTestMode ? `TEST-RS${returnId}` : request.pickupShipmentRef;
    if (shippingTestMode) await prisma.returnRequest.update({ where: { id: returnId }, data: { pickupOrderRef: `TEST-RO${returnId}`, pickupShipmentRef: shipmentRef } });
    if (!shipmentRef) {
      const warehouse = await pickupPlaceDetails(settings.pickupPlace);
      if (!warehouse) throw new Error(`Shiprocket has no pickup address called "${settings.pickupPlace}". Choose it again in Shipping settings.`);
      const grams = request.items.every((i) => i.orderItem.variant?.weightGrams) ? request.items.reduce((sum, i) => sum + (i.orderItem.variant!.weightGrams ?? 0) * i.quantity, 0) : null;
      const weightKg = grams ? Math.max(0.1, Math.round((grams / 1000 + 0.05) * 100) / 100) : settings.weightKg;
      const lines = request.items.map((i) => ({
        name: i.orderItem.productName + (i.orderItem.variantTitle ? ` ${i.orderItem.variantTitle}` : ""), sku: i.orderItem.sku ?? i.orderItem.variant?.sku ?? `ITEM${i.orderItemId}`,
        units: i.quantity, price: Math.round((num(i.orderItem.lineTotal) / i.orderItem.quantity) * 100) / 100, hsn: i.orderItem.product?.hsnCode ?? null,
      }));
      const parcel = await createReturnParcel({
        returnNumber: request.returnNumber, date: request.createdAt,
        from: { name: order.customerName ?? "Customer", phone: order.customerPhone.replace(/[^0-9]/g, "").slice(-10), email: order.customerEmail, address: order.shippingAddress, city: order.shippingCity ?? "", state: order.shippingState ?? "", pincode: order.shippingPincode },
        to: warehouse, items: lines, subTotal: Math.round(lines.reduce((sum, l) => sum + l.price * l.units, 0) * 100) / 100,
        weightKg, lengthCm: settings.lengthCm, breadthCm: settings.breadthCm, heightCm: settings.heightCm,
      });
      shipmentRef = parcel.shipmentId;
      await prisma.returnRequest.update({ where: { id: returnId }, data: { pickupOrderRef: parcel.orderId, pickupShipmentRef: parcel.shipmentId } });
    }
    const booked = shippingTestMode ? { awb: `TESTR${String(returnId).padStart(7, "0")}`, courier: "Test courier" as string | null } : await bookCourier(shipmentRef, { isReturn: true });
    await prisma.returnRequest.update({
      where: { id: returnId },
      data: { pickupCourier: booked.courier ?? "Shiprocket", pickupTracking: booked.awb, pickupStatus: "Pickup booked", pickupProblem: null, pickupCheckedAt: null },
    });
    await prisma.orderStatusHistory.create({ data: { orderId: order.id, status: order.status, note: `Courier booked to collect return ${request.returnNumber}: ${booked.courier ?? "Shiprocket"}, tracking number ${booked.awb}` } });
    await notify("return.pickup_booked", { userId: order.userId, name: order.customerName, email: order.customerEmail, phone: order.customerPhone }, {
      returnNumber: request.returnNumber, orderNumber: order.orderNumber, courier: booked.courier ?? "our courier", trackingNumber: booked.awb, trackingLink: trackingLink(booked.awb),
      link: siteLink(`${order.channel === "B2B" ? "/doctor" : "/patient"}/orders/${order.id}`),
    }, { type: "ReturnRequest", id: returnId });
    return prisma.returnRequest.findUniqueOrThrow({ where: { id: returnId } });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    const reason = error instanceof Error ? error.message : "The courier could not be booked";
    await staffProblem(returnId, request.returnNumber, reason);
    throw new HttpError(502, reason);
  }
};

/** A return has just been approved: books its pickup when shipping is set to automatic. Never throws. */
export const autoBookReturnPickup = async (returnId: number) => {
  try {
    if (!courierReady) return;
    const settings = await shippingSettings();
    if (settings.mode !== "auto") return;
    await bookReturnPickup(returnId);
  } catch (error) {
    // when Shiprocket said no, it is already written on the return and sent to staff
    if (!(error instanceof HttpError && error.status === 502)) console.error("[returns] pickup", returnId, error instanceof Error ? error.message : error);
  }
};

/** The return is called off before the courier came: the booking is taken back. Returns a problem to show, if any. */
export const cancelReturnPickup = async (returnId: number) => {
  const request = await prisma.returnRequest.findUnique({ where: { id: returnId }, select: { pickupOrderRef: true } });
  if (!request?.pickupOrderRef || !courierReady) return null;
  try {
    if (!request.pickupOrderRef.startsWith("TEST-")) await cancelParcel(request.pickupOrderRef);
    await prisma.returnRequest.update({ where: { id: returnId }, data: { pickupStatus: "Pickup cancelled", pickupProblem: null } });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Shiprocket could not cancel the pickup";
  }
};

/** Asks the courier where a returned parcel is, and moves the return on to match. */
export const refreshReturnPickup = async (returnId: number) => {
  const request = await prisma.returnRequest.findUnique({ where: { id: returnId }, select: { id: true, returnNumber: true, status: true, pickupTracking: true, pickupShipmentRef: true, pickupStatus: true, pickupArrivedAt: true } });
  if (!request?.pickupTracking || !request.pickupShipmentRef) return null;
  // the pretend courier moves one step on every check: collected, then delivered back
  const words = request.pickupShipmentRef.startsWith("TEST-")
    ? (request.pickupStatus === "Pickup booked" ? "Return Picked Up" : "Return Delivered")
    : (await track(request.pickupTracking)).status.trim();
  const s = words.toLowerCase();
  await prisma.returnRequest.update({ where: { id: returnId }, data: { pickupCheckedAt: new Date(), ...(words ? { pickupStatus: words.slice(0, 120) } : {}) } });
  if (!words || words === request.pickupStatus) return words || request.pickupStatus;

  const failed = /cancel|pickup error|pickup exception|lost|damaged/.test(s);
  const arrived = !failed && /delivered/.test(s) && !/undelivered|out for delivery/.test(s);
  const collected = !failed && (arrived || /picked up|in transit|in-transit|out for delivery|shipped|reached/.test(s));

  if (collected) {
    // the parcel has left the customer; only staff opening it makes the return "received"
    await prisma.returnRequest.updateMany({ where: { id: returnId, status: "APPROVED" }, data: { status: "PICKED_UP", pickedUpAt: new Date(), pickupProblem: null } });
  }
  if (arrived && !request.pickupArrivedAt) {
    await prisma.returnRequest.update({ where: { id: returnId }, data: { pickupArrivedAt: new Date() } });
    await notifyStaff("staff.return_arrived", { returnNumber: request.returnNumber, link: siteLink(`/admin/returns?q=${request.returnNumber}`) }, { type: "ReturnRequest", id: returnId });
  }
  if (failed) await staffProblem(returnId, request.returnNumber, `The courier says: ${words}. Couriers usually try again by themselves. If this does not clear, reschedule the pickup in the Shiprocket panel.`);
  return words;
};

/** Called every few minutes: returns on their way back that were not checked for half an hour get checked. */
export const refreshReturnPickups = async () => {
  if (!courierReady) return 0;
  const due = await prisma.returnRequest.findMany({
    where: {
      status: { in: ["APPROVED", "PICKED_UP"] }, pickupTracking: { not: null }, pickupShipmentRef: { not: null }, pickupArrivedAt: null,
      OR: [{ pickupCheckedAt: null }, { pickupCheckedAt: { lt: new Date(Date.now() - 30 * 60_000) } }, { pickupShipmentRef: { startsWith: "TEST-" } }],
    },
    select: { id: true }, take: 40,
  });
  for (const r of due) await refreshReturnPickup(r.id).catch((error) => console.error("[returns] tracking", r.id, error instanceof Error ? error.message : error));
  return due.length;
};

/** Shiprocket wrote about a tracking number: if it belongs to a return, look it up straight away. */
export const refreshReturnByTracking = async (awb: string) => {
  const request = await prisma.returnRequest.findFirst({ where: { pickupTracking: awb, pickupShipmentRef: { not: null } }, select: { id: true } });
  if (!request) return false;
  await refreshReturnPickup(request.id);
  return true;
};
