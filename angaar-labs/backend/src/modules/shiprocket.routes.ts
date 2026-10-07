import { refreshReturnByTracking } from "../lib/return-pickup";
import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { HttpError, idParam, notFound } from "../lib/http";
import { prisma } from "../lib/prisma";
import { bookShipment, cancelShipments, courierReady, refreshShipment, saveShippingSettings, shipOrder, shippingSettings, shippingTestMode, withPickupPlace } from "../lib/shipping";
import { labelFor, pickupPlaces, shiprocketReady } from "../lib/shiprocket";

// Staff controls for Shiprocket. Mounted at /api/admin/shiprocket.
//   /status, /settings          connected or not, pickup addresses, automatic or by hand
//   /orders/:id/ship            send one order to Shiprocket
//   /shipments/:id/…            book the courier, print the label, check tracking now, cancel
export const shiprocketRoutes = Router();
// Shiprocket's own tracking updates. Mounted at /api/ship, open, checked by the secret word.
export const shipWebhookRoutes = Router();

shiprocketRoutes.get("/status", async (_req, res) => {
  const settings = await shippingSettings();
  // testMode: this computer uses a pretend courier, so nothing below books anything real
  if (!shiprocketReady) return res.json({ connected: shippingTestMode, testMode: shippingTestMode, settings, pickupPlaces: [], error: null });
  try {
    // with no pickup address chosen yet, the verified one is taken by itself
    res.json({ connected: true, testMode: shippingTestMode, settings: await withPickupPlace(settings), pickupPlaces: await pickupPlaces(), error: null });
  } catch (error) {
    res.json({ connected: shippingTestMode, testMode: shippingTestMode, settings, pickupPlaces: [], error: error instanceof Error ? error.message : "Shiprocket could not be reached" });
  }
});

const settingsInput = z.object({
  mode: z.enum(["off", "manual", "auto"]),
  bookCourier: z.boolean(),
  pickupPlace: z.string().max(120), // not trimmed: it must match Shiprocket's name exactly
  pickupPincode: z.string().trim().regex(/^(\d{6})?$/, "A pincode has 6 digits"),
  weightKg: z.coerce.number().min(0.05, "The parcel weight must be at least 0.05 kg").max(50),
  lengthCm: z.coerce.number().min(1).max(200),
  breadthCm: z.coerce.number().min(1).max(200),
  heightCm: z.coerce.number().min(1).max(200),
});

shiprocketRoutes.put("/settings", async (req, res) => {
  const input = settingsInput.parse(req.body);
  // the pickup pincode is taken from the chosen address, so the two never disagree
  if (shiprocketReady && input.pickupPlace) {
    const place = (await pickupPlaces().catch(() => [])).find((p) => p.name.trim() === input.pickupPlace.trim());
    if (place) {
      input.pickupPlace = place.name;
      input.pickupPincode = place.pincode;
    }
  }
  const saved = await saveShippingSettings(input);
  await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "shipping.settings", entity: "Setting", entityId: "shipping.shiprocket", changes: saved } });
  res.json(saved);
});

shiprocketRoutes.post("/orders/:id/ship", async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.status(201).json(await shipOrder(id, { byStaff: true }));
});

shiprocketRoutes.post("/shipments/:id/book", async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json(await bookShipment(id));
});

shiprocketRoutes.post("/shipments/:id/label", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const shipment = await prisma.shipment.findUnique({ where: { id }, select: { providerRef: true, labelUrl: true } });
  if (!shipment?.providerRef) throw notFound("Shipment");
  if (shipment.providerRef.startsWith("TEST-")) throw new HttpError(400, "This parcel is with the pretend courier used for testing, so there is no label to print");
  const labelUrl = shipment.labelUrl ?? (await labelFor(shipment.providerRef));
  await prisma.shipment.update({ where: { id }, data: { labelUrl } });
  res.json({ labelUrl });
});

shiprocketRoutes.post("/shipments/:id/refresh", async (req, res) => {
  const { id } = idParam.parse(req.params);
  await refreshShipment(id);
  res.json(await prisma.shipment.findUnique({ where: { id } }));
});

shiprocketRoutes.post("/orders/:id/cancel-shipment", async (req, res) => {
  const { id } = idParam.parse(req.params);
  if (!courierReady) throw new HttpError(400, "Shiprocket is not connected");
  const result = await cancelShipments(id);
  if (result.failed) throw new HttpError(502, result.reason ?? "Shiprocket did not cancel the parcel. Cancel it in the Shiprocket panel.");
  if (result.cancelled === 0) throw new HttpError(400, "There is no parcel waiting for pickup on this order");
  res.json({ ok: true, cancelled: result.cancelled });
});

// Shiprocket → Settings → Webhooks: URL <public address>/api/ship/webhook, token = SHIPROCKET_WEBHOOK_TOKEN.
shipWebhookRoutes.post("/webhook", async (req, res) => {
  if (!env.SHIPROCKET_WEBHOOK_TOKEN || req.header("x-api-key") !== env.SHIPROCKET_WEBHOOK_TOKEN) return res.status(401).json({ ok: false });
  const awb = z.object({ awb: z.coerce.string().min(3).max(60) }).safeParse(req.body);
  if (awb.success) {
    const shipment = await prisma.shipment.findFirst({ where: { trackingNumber: awb.data.awb }, select: { id: true } });
    if (shipment) await refreshShipment(shipment.id).catch((error) => console.error("[shipping] webhook", error));
    else await refreshReturnByTracking(awb.data.awb).catch((error) => console.error("[returns] webhook", error)); // a returned parcel coming back
  }
  res.json({ ok: true }); // Shiprocket only needs to hear that the update arrived
});
