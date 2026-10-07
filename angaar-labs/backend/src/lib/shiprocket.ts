import { env } from "../config/env";

// Shiprocket: books couriers for our parcels (the same account the old site used).
// This file only talks to Shiprocket. What we do with the answers is in lib/shipping.ts.

export const shiprocketReady = Boolean(env.SHIPROCKET_EMAIL && env.SHIPROCKET_PASSWORD);
const BASE = env.SHIPROCKET_BASE_URL ?? "https://apiv2.shiprocket.in/v1/external";

// a sign-in lasts ten days; we keep it for nine and sign in again after that, or when it is refused
let session: { token: string; until: number } | null = null;
const signIn = async () => {
  const response = await fetch(`${BASE}/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: env.SHIPROCKET_EMAIL, password: env.SHIPROCKET_PASSWORD }), signal: AbortSignal.timeout(15_000),
  });
  const reply = (await response.json().catch(() => null)) as { token?: string; message?: string } | null;
  if (!response.ok || !reply?.token) throw new Error(`Shiprocket refused the sign-in: ${reply?.message ?? response.status}`);
  session = { token: reply.token, until: Date.now() + 9 * 86_400_000 };
  return session.token;
};

/** One call to Shiprocket, signed in. Throws with Shiprocket's own words when it says no. */
const call = async <T>(path: string, init: { method?: string; body?: unknown } = {}, retried = false): Promise<T> => {
  const token = session && session.until > Date.now() ? session.token : await signIn();
  const response = await fetch(`${BASE}${path}`, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 401 && !retried) {
    session = null;
    return call<T>(path, init, true);
  }
  const reply = (await response.json().catch(() => null)) as (T & { message?: string; errors?: Record<string, string[]> }) | null;
  if (!response.ok || !reply) {
    const detail = reply?.errors ? Object.values(reply.errors).flat().join(" ") : reply?.message;
    throw new Error(`Shiprocket: ${detail ?? `error ${response.status}`}`);
  }
  return reply;
};

export type PickupPlace = { name: string; city: string; pincode: string; verified: boolean };

export const pickupPlaces = async (): Promise<PickupPlace[]> => {
  const reply = await call<{ data?: { shipping_address?: { pickup_location: string; city: string; pin_code: string | number; status: number }[] } }>("/settings/company/pickup");
  return (reply.data?.shipping_address ?? []).map((p) => ({ name: p.pickup_location, city: p.city, pincode: String(p.pin_code), verified: p.status === 2 }));
};

export type PlaceDetails = { name: string; phone: string; email: string | null; address: string; city: string; state: string; pincode: string };

/** The full address behind a pickup place's name. A returned parcel is sent back to it. */
export const pickupPlaceDetails = async (place: string): Promise<PlaceDetails | null> => {
  const reply = await call<{ data?: { shipping_address?: { pickup_location: string; name?: string; phone?: string | number; email?: string; address?: string; address_2?: string; city?: string; state?: string; pin_code?: string | number }[] } }>("/settings/company/pickup");
  const found = (reply.data?.shipping_address ?? []).find((p) => p.pickup_location === place);
  if (!found) return null;
  return {
    name: found.name || found.pickup_location, phone: String(found.phone ?? ""), email: found.email || null,
    address: [found.address, found.address_2].filter(Boolean).join(", "), city: found.city ?? "", state: found.state ?? "", pincode: String(found.pin_code ?? ""),
  };
};

export type Serviceability = { deliverable: boolean; codAvailable: boolean; days: number | null; courier: string | null; charge: number | null };

/** Which couriers can reach a pincode, and how fast. Uses the courier Shiprocket recommends. */
export const serviceability = async (input: { from: string; to: string; weightKg: number; cod: boolean }): Promise<Serviceability> => {
  const query = new URLSearchParams({ pickup_postcode: input.from, delivery_postcode: input.to, weight: String(input.weightKg), cod: input.cod ? "1" : "0" });
  try {
    const reply = await call<{ data?: { available_courier_companies?: { courier_name: string; estimated_delivery_days: string | number; rate: number; cod: number; courier_company_id: number }[]; recommended_courier_company_id?: number } }>(`/courier/serviceability/?${query}`);
    const couriers = reply.data?.available_courier_companies ?? [];
    if (couriers.length === 0) return { deliverable: false, codAvailable: false, days: null, courier: null, charge: null };
    const best = couriers.find((c) => c.courier_company_id === reply.data?.recommended_courier_company_id) ?? couriers[0];
    const days = Number(best.estimated_delivery_days);
    return { deliverable: true, codAvailable: couriers.some((c) => c.cod === 1), days: Number.isFinite(days) ? days : null, courier: best.courier_name, charge: best.rate ?? null };
  } catch (error) {
    // Shiprocket answers "no courier" with an error status
    if (error instanceof Error && /no courier|not serviceable|delivery postcode/i.test(error.message)) return { deliverable: false, codAvailable: false, days: null, courier: null, charge: null };
    throw error;
  }
};

export type NewParcel = {
  orderNumber: string; orderDate: Date; pickupPlace: string;
  name: string; phone: string; email: string | null; address: string; city: string; state: string; pincode: string;
  items: { name: string; sku: string; units: number; price: number; hsn: string | null; gstPercent: number }[];
  cod: boolean; subTotal: number; shippingCharge: number; discount: number;
  weightKg: number; lengthCm: number; breadthCm: number; heightCm: number;
};

/** Creates the order at Shiprocket. Returns Shiprocket's own order and shipment numbers. */
export const createParcel = async (p: NewParcel) => {
  const istDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(p.orderDate).replace(",", "");
  const reply = await call<{ order_id?: number; shipment_id?: number; status?: string }>("/orders/create/adhoc", {
    body: {
      order_id: p.orderNumber, order_date: istDate, pickup_location: p.pickupPlace,
      billing_customer_name: p.name, billing_last_name: "", billing_address: p.address, billing_city: p.city, billing_pincode: p.pincode,
      billing_state: p.state, billing_country: "India", billing_email: p.email ?? "", billing_phone: p.phone, shipping_is_billing: true,
      order_items: p.items.map((i) => ({ name: i.name.slice(0, 100), sku: i.sku.slice(0, 50), units: i.units, selling_price: i.price, discount: 0, tax: i.gstPercent, hsn: i.hsn ?? "" })),
      payment_method: p.cod ? "COD" : "Prepaid", shipping_charges: p.shippingCharge, total_discount: p.discount, sub_total: p.subTotal,
      length: p.lengthCm, breadth: p.breadthCm, height: p.heightCm, weight: p.weightKg,
    },
  });
  if (!reply.order_id || !reply.shipment_id) throw new Error("Shiprocket did not create the order");
  return { orderId: String(reply.order_id), shipmentId: String(reply.shipment_id) };
};

export type ReturnParcel = {
  returnNumber: string; date: Date;
  from: { name: string; phone: string; email: string | null; address: string; city: string; state: string; pincode: string }; // the customer: where the courier collects
  to: PlaceDetails; // our own address: where the parcel comes back to
  items: { name: string; sku: string; units: number; price: number; hsn: string | null }[];
  subTotal: number; weightKg: number; lengthCm: number; breadthCm: number; heightCm: number;
};

/** Creates a return order at Shiprocket: the courier collects from the customer and brings the parcel to us. */
export const createReturnParcel = async (p: ReturnParcel) => {
  const istDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(p.date).replace(",", "");
  const reply = await call<{ order_id?: number; shipment_id?: number; status?: string }>("/orders/create/return", {
    body: {
      order_id: p.returnNumber, order_date: istDate,
      pickup_customer_name: p.from.name, pickup_last_name: "", pickup_address: p.from.address, pickup_city: p.from.city, pickup_state: p.from.state, pickup_country: "India",
      pickup_pincode: p.from.pincode, pickup_email: p.from.email ?? "", pickup_phone: p.from.phone, pickup_isd_code: "91",
      shipping_customer_name: p.to.name, shipping_last_name: "", shipping_address: p.to.address, shipping_city: p.to.city, shipping_state: p.to.state, shipping_country: "India",
      shipping_pincode: p.to.pincode, shipping_email: p.to.email ?? "", shipping_phone: p.to.phone, shipping_isd_code: "91",
      order_items: p.items.map((i) => ({ name: i.name.slice(0, 100), sku: i.sku.slice(0, 50), units: i.units, selling_price: i.price, discount: 0, hsn: i.hsn ?? "", qc_enable: false })),
      payment_method: "Prepaid", total_discount: 0, sub_total: p.subTotal,
      length: p.lengthCm, breadth: p.breadthCm, height: p.heightCm, weight: p.weightKg,
    },
  });
  if (!reply.order_id || !reply.shipment_id) throw new Error("Shiprocket did not create the return order");
  return { orderId: String(reply.order_id), shipmentId: String(reply.shipment_id) };
};

/**
 * Books a courier for a shipment (Shiprocket picks one by the rules set in its panel) and returns the tracking number.
 * For a return the same call also arranges the pickup from the customer.
 */
export const bookCourier = async (shipmentId: string, { isReturn = false } = {}) => {
  const reply = await call<{ awb_assign_status?: number; response?: { data?: { awb_code?: string; courier_name?: string; applied_weight?: number; freight_charges?: number } }; message?: string }>("/courier/assign/awb", { body: { shipment_id: shipmentId, ...(isReturn ? { is_return: 1 } : {}) } });
  const data = reply.response?.data;
  if (reply.awb_assign_status !== 1 || !data?.awb_code) throw new Error(`Shiprocket could not book a courier: ${reply.message ?? "no courier available"}`);
  return { awb: data.awb_code, courier: data.courier_name ?? null, charge: data.freight_charges ?? null };
};

export const schedulePickup = async (shipmentId: string) => {
  const reply = await call<{ pickup_status?: number; response?: { pickup_scheduled_date?: string } }>("/courier/generate/pickup", { body: { shipment_id: [shipmentId] } });
  return { scheduled: reply.pickup_status === 1, date: reply.response?.pickup_scheduled_date ?? null };
};

export const labelFor = async (shipmentId: string) => {
  const reply = await call<{ label_created?: number; label_url?: string }>("/courier/generate/label", { body: { shipment_id: [shipmentId] } });
  if (!reply.label_url) throw new Error("Shiprocket did not make the label");
  return reply.label_url;
};

export type TrackingEvent = { at: string; status: string; place: string | null };
export type Tracking = { status: string; delivered: boolean; expected: string | null; events: TrackingEvent[] };

export const track = async (awb: string): Promise<Tracking> => {
  const reply = await call<{ tracking_data?: { shipment_track?: { current_status?: string; edd?: string | null; delivered_date?: string | null }[]; shipment_track_activities?: { date: string; activity?: string; "sr-status-label"?: string; location?: string }[] } }>(`/courier/track/awb/${encodeURIComponent(awb)}`);
  const head = reply.tracking_data?.shipment_track?.[0];
  return {
    status: head?.current_status ?? "",
    delivered: Boolean(head?.delivered_date) || /delivered/i.test(head?.current_status ?? "") && !/rto|undelivered/i.test(head?.current_status ?? ""),
    expected: head?.edd ?? null,
    events: (reply.tracking_data?.shipment_track_activities ?? []).map((a) => ({ at: a.date, status: a["sr-status-label"] ?? a.activity ?? "", place: a.location ?? null })),
  };
};

export const cancelParcel = async (shiprocketOrderId: string) => {
  await call("/orders/cancel", { body: { ids: [Number(shiprocketOrderId)] } });
};

export const trackingLink = (awb: string) => `https://shiprocket.co/tracking/${encodeURIComponent(awb)}`;
