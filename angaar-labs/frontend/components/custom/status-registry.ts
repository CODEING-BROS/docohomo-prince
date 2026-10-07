import type { Tone } from "./tone";

// Every status string the three panels show, in one table: which colour it speaks in and the
// words a person sees. A status that means something different in one area (a refund that is
// PENDING is in flight, a payout that is PENDING just waits for Monday) gets an override by kind.

export type StatusKind =
  | "order" | "shipment" | "return" | "payment" | "refund" | "doctor" | "wholesale" | "appointment" | "prescription"
  | "payout" | "enquiry" | "coupon" | "review" | "stream" | "banner" | "staff" | "inventory" | "message" | "import" | "channel";

export type StatusEntry = { tone: Tone; label: string; inFlight?: boolean };

const entry = (tone: Tone, label: string, inFlight?: boolean): StatusEntry => (inFlight ? { tone, label, inFlight } : { tone, label });

export const STATUS = {
  // success
  DELIVERED: entry("success", "Delivered"),
  PAID: entry("success", "Paid"),
  APPROVED: entry("success", "Approved"),
  ACTIVE: entry("success", "Active"),
  SUCCESS: entry("success", "Successful"),
  COMPLETED: entry("success", "Completed"),
  PUBLISHED: entry("success", "Published"),
  SENT: entry("success", "Sent"),
  LIVE: entry("success", "Live"),
  OPEN: entry("success", "Open"),
  ISSUED: entry("success", "Issued"),
  VERIFIED: entry("success", "Verified"),
  PASSED: entry("success", "Passed"),
  IN_STOCK: entry("success", "In stock"),
  ON: entry("success", "On"),
  // warning
  PENDING: entry("warning", "Pending"),
  PENDING_PAYMENT: entry("warning", "Waiting for payment"),
  UNDER_REVIEW: entry("warning", "Under review", true),
  PROCESSING: entry("warning", "Processing", true),
  PACKED: entry("warning", "Packed"),
  RETURN_REQUESTED: entry("warning", "Return requested"),
  PARTIALLY_PAID: entry("warning", "Partly paid"),
  REQUESTED: entry("warning", "Requested"),
  PICKED_UP: entry("warning", "Picked up"),
  RECEIVED: entry("warning", "Received"),
  NEW: entry("warning", "New"),
  QUEUED: entry("warning", "Queued"),
  RUNNING: entry("warning", "Running", true),
  USED_UP: entry("warning", "Used up"),
  ENDED: entry("warning", "Ended"),
  LOW_STOCK: entry("warning", "Running low"),
  UNPAID: entry("warning", "Unpaid"),
  PAUSED: entry("warning", "Paused"),
  STARTED: entry("warning", "Started"),
  NOT_PASSED: entry("warning", "Not passed"),
  // info
  CONFIRMED: entry("info", "Confirmed"),
  SHIPPED: entry("info", "Shipped", true),
  OUT_FOR_DELIVERY: entry("info", "Out for delivery", true),
  PICKUP_SCHEDULED: entry("info", "Pickup scheduled"),
  PICKUP_BOOKED: entry("info", "Pickup booked"),
  IN_TRANSIT: entry("info", "In transit", true),
  IN_PROGRESS: entry("info", "In progress", true),
  SCHEDULED: entry("info", "Scheduled"),
  BOOKED: entry("info", "Booked"),
  // danger
  CANCELLED: entry("danger", "Cancelled"),
  UNDELIVERED: entry("danger", "Undelivered"),
  REJECTED: entry("danger", "Rejected"),
  FAILED: entry("danger", "Failed"),
  SUSPENDED: entry("danger", "Suspended"),
  NO_SHOW: entry("danger", "Missed"),
  RTO: entry("danger", "Returning to sender"),
  LOST: entry("danger", "Lost"),
  OUT_OF_STOCK: entry("danger", "Out of stock"),
  BLOCKED: entry("danger", "Blocked"),
  // neutral
  RETURNED: entry("neutral", "Returned"),
  REFUNDED: entry("neutral", "Refunded"),
  DRAFT: entry("neutral", "Draft"),
  ARCHIVED: entry("neutral", "Archived"),
  CLOSED: entry("neutral", "Closed"),
  CREATED: entry("neutral", "Created"),
  SKIPPED: entry("neutral", "Skipped"),
  HIDDEN: entry("neutral", "Hidden"),
  EXPIRED: entry("neutral", "Expired"),
  OFF: entry("neutral", "Off"),
  D2C: entry("neutral", "Retail"),
  RESTOCKED: entry("neutral", "Restocked"),
  COMING_SOON: entry("neutral", "Not open yet"),
  // wholesale is always plum
  B2B: entry("plum", "Wholesale"),
  WHOLESALE: entry("plum", "Wholesale"),
} satisfies Record<string, StatusEntry>;

export type KnownStatus = keyof typeof STATUS;

/** Where the same word means something else. */
export const STATUS_BY_KIND: Partial<Record<StatusKind, Record<string, Partial<StatusEntry>>>> = {
  refund: { PENDING: { tone: "warning", inFlight: true, label: "On its way" }, SUCCESS: { label: "Refunded" } },
  payout: { PENDING: { label: "Waiting to be paid" } },
  payment: { PENDING: { label: "Awaiting payment" }, SUCCESS: { label: "Paid" } },
  appointment: {
    PENDING_PAYMENT: { label: "Waiting for payment" }, CONFIRMED: { label: "Booked" }, IN_PROGRESS: { label: "Happening now" },
    COMPLETED: { label: "Done" }, NO_SHOW: { label: "Missed" },
  },
  order: { PENDING: { label: "Awaiting payment" } },
  return: { CLOSED: { label: "Closed without refund" } },
  doctor: { PENDING: { label: "Waiting for review" }, DRAFT: { label: "Registering" }, APPROVED: { label: "Verified" } },
  wholesale: { PENDING: { label: "Waiting for approval" } },
  enquiry: { CLOSED: { tone: "neutral" }, NEW: { tone: "terracotta" } },
  coupon: { OFF: { label: "Switched off" }, ON: { label: "Live" } },
  stream: { COMING_SOON: { tone: "neutral", label: "Not open yet" } },
  message: { FAILED: { label: "Not sent" } },
  import: { RUNNING: { label: "Importing" }, SUCCESS: { label: "Imported" } },
  inventory: { ACTIVE: { label: "Selling" } },
  staff: { ACTIVE: { label: "Can sign in" }, SUSPENDED: { label: "Switched off" } },
};

/** "OUT_FOR_DELIVERY" -> "Out for delivery" */
const humanize = (value: string) => {
  const text = value.replace(/_/g, " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const warned = new Set<string>();

export const statusEntry = (status: string, kind?: StatusKind): StatusEntry => {
  const base = (STATUS as Record<string, StatusEntry>)[status];
  const override = kind ? STATUS_BY_KIND[kind]?.[status] : undefined;
  if (!base) {
    if (process.env.NODE_ENV === "development" && !warned.has(status)) {
      warned.add(status);
      console.warn(`[status-registry] "${status}" has no entry; add it to components/custom/status-registry.ts`);
    }
    return { tone: "neutral", label: humanize(status), ...override };
  }
  return override ? { ...base, ...override } : base;
};
