import { autoInvoice } from "./invoice";
import type { OrderStatus, ShipmentStatus } from "../generated/prisma/client";
import * as events from "./events";
import { HttpError, num } from "./http";
import { notifyStaff, siteLink } from "./notifications";
import { prisma } from "./prisma";
import { env } from "../config/env";
import { type Tracking, bookCourier, cancelParcel, createParcel, pickupPlaces, schedulePickup, shiprocketReady, track, trackingLink } from "./shiprocket";

// Getting orders to customers through Shiprocket, with nobody having to do anything on a screen:
//   1. the order is sent to Shiprocket the moment it is confirmed (staff can switch this to "by hand")
//   2. a courier is booked and the pickup scheduled; a person packs the parcel and marks the order "packed"
//   3. tracking is checked every half hour (and whenever Shiprocket sends an update), and the
//      order moves on by itself: shipped → out for delivery → delivered, with a message each time
// Staff keep a button for every step in case they want to do one by hand.

export type ShippingSettings = {
  mode: "off" | "manual" | "auto"; // auto: every order goes to Shiprocket as soon as it is ready to send
  bookCourier: boolean; // also book the courier and the pickup straight away
  pickupPlace: string; // the pickup address name, exactly as in Shiprocket
  pickupPincode: string;
  weightKg: number; lengthCm: number; breadthCm: number; heightCm: number; // the usual parcel, used when packs have no weight
};

const KEY = "shipping.shiprocket";
// automatic unless staff choose otherwise; the pickup address is found by itself (see withPickupPlace)
const DEFAULTS: ShippingSettings = { mode: "auto", bookCourier: true, pickupPlace: "", pickupPincode: "", weightKg: 0.5, lengthCm: 15, breadthCm: 10, heightCm: 10 };

export const shippingSettings = async (): Promise<ShippingSettings> => {
  const saved = await prisma.setting.findUnique({ where: { key: KEY } });
  return { ...DEFAULTS, ...((saved?.value ?? {}) as Partial<ShippingSettings>) };
};
export const saveShippingSettings = async (value: ShippingSettings) => {
  await prisma.setting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } });
  return value;
};

/** On a development computer the courier is pretend: nothing is booked and nothing costs money. */
export const shippingTestMode = env.SHIPPING_TEST_MODE;
/** Parcels can be sent: Shiprocket is connected, or the pretend courier is on. */
export const courierReady = shiprocketReady || shippingTestMode;
const isPretend = (ref: string | null | undefined) => Boolean(ref?.startsWith("TEST-"));

/** With no pickup address chosen, the verified one in Shiprocket is used, so there is nothing for anyone to set up. */
export const withPickupPlace = async (settings: ShippingSettings): Promise<ShippingSettings> => {
  if (settings.pickupPlace || shippingTestMode || !shiprocketReady) return settings;
  const places = await pickupPlaces().catch(() => []);
  const place = places.find((p) => p.verified) ?? places[0];
  if (!place) return settings;
  return saveShippingSettings({ ...settings, pickupPlace: place.name, pickupPincode: place.pincode });
};

/** Why a parcel cannot be handed to a courier right now, in plain words; null when it can. */
export const courierProblem = async () => {
  if (!courierReady) return "Shiprocket is not connected.";
  const settings = await shippingSettings();
  if (settings.mode === "off") return "Sending parcels through Shiprocket is switched off in Shipping settings.";
  if (!shippingTestMode && !(await withPickupPlace(settings)).pickupPlace) return "Shiprocket has no pickup address yet. Add one in the Shiprocket panel.";
  return null;
};

/** The pretend courier's story: it waits for the parcel to be packed, collects two minutes later and delivers after seven. */
const pretendTracking = (packedAt: Date | null): Tracking => {
  const minutes = packedAt ? (Date.now() - packedAt.getTime()) / 60_000 : 0;
  const status = minutes >= 7 ? "Delivered" : minutes >= 2 ? "In Transit" : "Pickup Scheduled";
  return { status, delivered: minutes >= 7, expected: null, events: [{ at: new Date().toISOString(), status, place: "Test courier" }] };
};

const ACTIVE: ShipmentStatus[] = ["PENDING", "PICKUP_SCHEDULED", "IN_TRANSIT", "OUT_FOR_DELIVERY"];
// an order only ever moves forward on its own
const RANK: Partial<Record<OrderStatus, number>> = { PENDING: 0, CONFIRMED: 1, PROCESSING: 2, PACKED: 3, SHIPPED: 4, OUT_FOR_DELIVERY: 5, DELIVERED: 6 };

/** Writes a line in the order's history without changing where the order stands. */
const noteOnOrder = async (orderId: number, text: string) => {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true } });
  if (order) await prisma.orderStatusHistory.create({ data: { orderId, status: order.status, note: text } });
};

const moveOrder = async (orderId: number, to: OrderStatus, note: string, stamp?: "confirmedAt" | "shippedAt" | "deliveredAt") => {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true, paymentMethod: true, paymentStatus: true } });
  if (!order) return false;
  const from = RANK[order.status];
  const target = RANK[to];
  if (from === undefined || target === undefined || target <= from) return false; // cancelled, returned, or already further along
  await prisma.$transaction([
    prisma.order.update({
      where: { id: orderId },
      data: {
        status: to, ...(stamp ? { [stamp]: new Date() } : {}),
        // money collected by the courier on delivery
        ...(to === "DELIVERED" && order.paymentMethod === "COD" && order.paymentStatus !== "PAID" ? { paymentStatus: "PAID" } : {}),
      },
    }),
    prisma.orderStatusHistory.create({ data: { orderId, status: to, note } }),
  ]);
  return true;
};

const problem = async (shipmentId: number, orderNumber: string, orderId: number, reason: string) => {
  await prisma.shipment.update({ where: { id: shipmentId }, data: { problem: reason.slice(0, 500) } });
  await notifyStaff("staff.shipping_problem", { orderNumber, reason, link: siteLink(`/admin/orders?q=${orderNumber}`) }, { type: "Order", id: orderId });
};

/** Sends an order to Shiprocket and, if set to, books the courier and pickup. Returns the shipment. */
export const shipOrder = async (orderId: number, { byStaff = false } = {}) => {
  if (!courierReady) throw new HttpError(400, "Shiprocket is not connected yet");
  const settings = await withPickupPlace(await shippingSettings());
  if (settings.mode === "off") throw new HttpError(400, "Sending orders to Shiprocket is switched off in Shipping settings");
  if (!shippingTestMode && !settings.pickupPlace) throw new HttpError(400, "Shiprocket has no pickup address yet. Add one in the Shiprocket panel.");
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: { include: { variant: { select: { weightGrams: true, sku: true } }, product: { select: { hsnCode: true } } } },
      shipments: { where: { carrier: { not: null } } },
    },
  });
  if (!order) throw new HttpError(404, "Order not found");
  if (["CANCELLED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED", "RETURNED", "REFUNDED"].includes(order.status)) throw new HttpError(400, "This order cannot be sent to the courier now");
  if (order.paymentMethod === "ONLINE" && order.paymentStatus !== "PAID") throw new HttpError(400, "This order is waiting for its online payment");
  const open = order.shipments.find((s) => s.providerOrderId && s.status !== "CANCELLED");
  if (open) throw new HttpError(400, "This order is already with Shiprocket");
  if (!order.customerPhone || !order.shippingPincode || !order.shippingAddress) throw new HttpError(400, "The order has no full delivery address or phone number");

  // the parcel's weight from the packs, when every pack has one; otherwise the usual parcel
  const grams = order.items.every((i) => i.variant?.weightGrams) ? order.items.reduce((sum, i) => sum + (i.variant!.weightGrams ?? 0) * i.quantity, 0) : null;
  const weightKg = grams ? Math.max(0.1, Math.round((grams / 1000 + 0.05) * 100) / 100) : settings.weightKg; // plus a little for the box

  if (shippingTestMode) {
    // the pretend courier: the order moves along exactly as it would, but nothing is booked and nothing costs money
    const pretend = await prisma.shipment.create({
      data: { orderId, carrier: "Test courier", providerOrderId: `TEST-O${orderId}`, providerRef: `TEST-S${orderId}`, trackingNumber: `TEST${String(orderId).padStart(8, "0")}`, status: "PICKUP_SCHEDULED", weightGrams: Math.round(weightKg * 1000) },
    });
    await moveOrder(orderId, "PROCESSING", byStaff ? "Sent to the test courier by staff" : "Sent to the test courier automatically", "confirmedAt");
    await noteOnOrder(orderId, `Test courier booked, tracking number ${pretend.trackingNumber}. Waiting to be packed.`);
    await autoInvoice(orderId, "dispatch");
    return pretend;
  }

  const parcel = await createParcel({
    orderNumber: order.orderNumber, orderDate: order.placedAt, pickupPlace: settings.pickupPlace,
    name: order.customerName ?? "Customer", phone: order.customerPhone.replace(/\D/g, "").slice(-10), email: order.customerEmail,
    address: order.shippingAddress, city: order.shippingCity ?? "", state: order.shippingState ?? "", pincode: order.shippingPincode,
    items: order.items.map((i) => ({ name: i.productName + (i.variantTitle ? ` ${i.variantTitle}` : ""), sku: i.sku ?? i.variant?.sku ?? `ITEM${i.id}`, units: i.quantity, price: num(i.unitPrice), hsn: i.product?.hsnCode ?? null, gstPercent: num(i.gstPercent) })),
    cod: order.paymentMethod === "COD", subTotal: num(order.grandTotal) - num(order.shippingCharge) - num(order.codCharge),
    shippingCharge: num(order.shippingCharge) + num(order.codCharge), discount: num(order.couponDiscount),
    weightKg, lengthCm: settings.lengthCm, breadthCm: settings.breadthCm, heightCm: settings.heightCm,
  });
  const shipment = await prisma.shipment.create({
    data: { orderId, carrier: "Shiprocket", providerOrderId: parcel.orderId, providerRef: parcel.shipmentId, status: "PENDING", weightGrams: Math.round(weightKg * 1000) },
  });
  await moveOrder(orderId, "PROCESSING", byStaff ? "Sent to Shiprocket by staff" : "Sent to Shiprocket automatically", "confirmedAt");
  if (settings.bookCourier) await bookShipment(shipment.id).catch(() => null); // a booking problem is recorded on the shipment
  return prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
};

/** Books the courier and the pickup for a shipment already at Shiprocket. */
export const bookShipment = async (shipmentId: number) => {
  const shipment = await prisma.shipment.findUnique({ where: { id: shipmentId }, include: { order: { select: { id: true, orderNumber: true } } } });
  if (!shipment?.providerRef) throw new HttpError(404, "Shipment not found");
  if (isPretend(shipment.providerRef)) return prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } }); // booked when it was made
  try {
    let awb = shipment.trackingNumber;
    if (!awb) {
      const booked = await bookCourier(shipment.providerRef);
      awb = booked.awb;
      await prisma.shipment.update({
        where: { id: shipmentId },
        data: { trackingNumber: booked.awb, carrier: booked.courier ?? "Shiprocket", trackingUrl: trackingLink(booked.awb), shippingCost: booked.charge, problem: null },
      });
    }
    const pickup = await schedulePickup(shipment.providerRef);
    await prisma.shipment.update({
      where: { id: shipmentId },
      data: pickup.scheduled ? { status: "PICKUP_SCHEDULED", problem: null } : { problem: "The courier is booked, but the pickup could not be scheduled. Press Book courier again, or schedule it in Shiprocket." },
    });
    // the courier is booked, but the parcel is only "packed" when a person has packed it and says so
    await noteOnOrder(shipment.order.id, `Courier booked, tracking number ${awb}${pickup.date ? `, pickup on ${pickup.date}` : ""}. Waiting to be packed.`);
    await autoInvoice(shipment.order.id, "dispatch"); // printed and put in the box with the label
    return prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "The courier could not be booked";
    await problem(shipmentId, shipment.order.orderNumber, shipment.order.id, reason);
    throw new HttpError(502, reason);
  }
};

/** What the courier's own words mean for us. */
const meaning = (text: string): ShipmentStatus | null => {
  const s = text.toLowerCase();
  if (/rto|return/.test(s)) return "RTO";
  if (/undelivered|delivery failed|failed delivery/.test(s)) return null; // a failed attempt; the courier usually tries again
  if (/out for delivery/.test(s)) return "OUT_FOR_DELIVERY";
  if (/delivered/.test(s)) return "DELIVERED";
  if (/cancel/.test(s)) return "CANCELLED";
  if (/lost|damaged|destroyed/.test(s)) return "LOST";
  if (/picked up|in transit|shipped|reached|dispatched|in-transit|connected/.test(s)) return "IN_TRANSIT";
  if (/pickup|manifest|awb assigned|label generated/.test(s)) return "PICKUP_SCHEDULED";
  return null;
};

/** Asks the courier where the parcel is and moves the order on to match. */
export const refreshShipment = async (shipmentId: number) => {
  const shipment = await prisma.shipment.findUnique({ where: { id: shipmentId }, include: { order: { select: { id: true, orderNumber: true, status: true } } } });
  if (!shipment?.trackingNumber) return null;
  const packed = isPretend(shipment.providerRef)
    ? await prisma.orderStatusHistory.findFirst({ where: { orderId: shipment.order.id, status: "PACKED" }, orderBy: { id: "desc" }, select: { createdAt: true } })
    : null;
  const tracking = isPretend(shipment.providerRef) ? pretendTracking(packed?.createdAt ?? null) : await track(shipment.trackingNumber);
  const next = meaning(tracking.status) ?? shipment.status;
  const expected = tracking.expected ? new Date(tracking.expected) : null;
  await prisma.shipment.update({
    where: { id: shipmentId },
    data: {
      status: next, lastCheckedAt: new Date(), trackingEvents: tracking.events,
      ...(expected && !Number.isNaN(expected.getTime()) ? { estimatedDelivery: expected } : {}),
      ...(next === "IN_TRANSIT" && !shipment.shippedAt ? { shippedAt: new Date() } : {}),
      ...(next === "DELIVERED" && !shipment.deliveredAt ? { deliveredAt: new Date() } : {}),
    },
  });
  if (next === shipment.status) return next;

  const orderId = shipment.order.id;
  if (next === "IN_TRANSIT" && (await moveOrder(orderId, "SHIPPED", `Picked up by ${shipment.carrier ?? "the courier"}`, "shippedAt"))) events.orderShipped(orderId);
  if (next === "OUT_FOR_DELIVERY") await moveOrder(orderId, "OUT_FOR_DELIVERY", "Out for delivery");
  if (next === "DELIVERED" && (await moveOrder(orderId, "DELIVERED", "Delivered by the courier", "deliveredAt"))) events.orderDelivered(orderId);
  if (next === "RTO" || next === "LOST") {
    await prisma.$transaction([
      prisma.order.update({ where: { id: orderId }, data: { status: "UNDELIVERED" } }),
      prisma.orderStatusHistory.create({ data: { orderId, status: "UNDELIVERED", note: next === "RTO" ? "The courier is sending the parcel back" : "The courier reports the parcel as lost" } }),
    ]);
    await notifyStaff("staff.shipping_problem", { orderNumber: shipment.order.orderNumber, reason: next === "RTO" ? "The parcel could not be delivered and is coming back." : "The courier reports the parcel as lost.", link: siteLink(`/admin/orders?q=${shipment.order.orderNumber}`) }, { type: "Order", id: orderId });
  }
  return next;
};

/** Called every few minutes: parcels not checked for half an hour get checked. */
export const refreshActiveShipments = async () => {
  if (!courierReady) return 0;
  const due = await prisma.shipment.findMany({
    // real parcels every half hour; the pretend courier's on every round, since its whole journey takes minutes
    where: { trackingNumber: { not: null }, status: { in: ACTIVE }, OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: new Date(Date.now() - 30 * 60_000) } }, { providerRef: { startsWith: "TEST-" } }] },
    select: { id: true }, take: 40,
  });
  for (const s of due) await refreshShipment(s.id).catch((error) => console.error("[shipping] tracking", s.id, error instanceof Error ? error.message : error));
  return due.length;
};

/** When an order is ready to go: sends it to Shiprocket if shipping is set to automatic. Never throws. */
export const autoShip = async (orderId: number) => {
  try {
    if (!courierReady) return;
    const settings = await shippingSettings();
    if (settings.mode !== "auto") return;
    await shipOrder(orderId);
  } catch (error) {
    const order = await prisma.order.findUnique({ where: { id: orderId }, select: { orderNumber: true } });
    const reason = error instanceof Error ? error.message : "Could not send the order to Shiprocket";
    await notifyStaff("staff.shipping_problem", { orderNumber: order?.orderNumber ?? String(orderId), reason, link: siteLink(`/admin/orders?q=${order?.orderNumber ?? ""}`) }, { type: "Order", id: orderId });
  }
};

/** Takes back a parcel that has not been picked up yet (the order was cancelled). */
export const cancelShipments = async (orderId: number) => {
  const result = { cancelled: 0, failed: 0, reason: null as string | null };
  if (!courierReady) return result;
  const open = await prisma.shipment.findMany({ where: { orderId, providerOrderId: { not: null }, status: { in: ["PENDING", "PICKUP_SCHEDULED"] } } });
  for (const shipment of open) {
    try {
      if (!isPretend(shipment.providerRef)) await cancelParcel(shipment.providerOrderId!);
      await prisma.shipment.update({ where: { id: shipment.id }, data: { status: "CANCELLED", problem: null } });
      result.cancelled++;
    } catch (error) {
      result.failed++;
      result.reason = `Could not cancel at Shiprocket: ${error instanceof Error ? error.message : "unknown"}. Cancel it in the Shiprocket panel.`;
      await prisma.shipment.update({ where: { id: shipment.id }, data: { problem: result.reason } });
    }
  }
  return result;
};
