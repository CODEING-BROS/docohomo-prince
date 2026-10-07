import { env } from "../config/env";
import type { NotificationChannel } from "../generated/prisma/client";
import { type Attachment, emailReady, sendEmail, sendSms, sendWhatsapp, smsReady, whatsappReady } from "./notify";
import { prisma } from "./prisma";

// Messages the system sends by itself when something happens: an order is placed, a payment arrives,
// an appointment is about to start, a doctor is verified…
//
// Each kind of message ("event") has a template staff can edit in Admin → Automatic messages:
// the email wording, and which approved SMS text / WhatsApp template to use. Every message that is
// sent, fails, or is skipped (channel not connected, no address) is kept in a log staff can read.
// Sending never blocks or breaks the action that caused it.

type Default = {
  event: string;
  audience: "CUSTOMER" | "PATIENT" | "DOCTOR" | "STAFF";
  description: string;
  placeholders: string[];
  emailSubject: string;
  emailBody: string;
  smsText: string;
};

const SIGN_OFF = "Thank you,\nTeam DocHomoeo";

/** The messages the system knows how to send, with their starting wording. */
export const EVENTS: Default[] = [
  {
    event: "order.placed", audience: "CUSTOMER", description: "To the buyer, when an order is placed (pay on delivery or credit).",
    placeholders: ["name", "orderNumber", "total", "paymentMethod", "items", "address", "link"],
    emailSubject: "Your DocHomoeo order {{orderNumber}} is placed",
    emailBody: `Hello {{name}},\n\nThank you for your order. We have received it and will start packing it soon.\n\nOrder number: {{orderNumber}}\nItems:\n{{items}}\n\nTotal: {{total}} ({{paymentMethod}})\nDelivering to: {{address}}\n\nYou can follow your order here: {{link}}\n\n${SIGN_OFF}`,
    smsText: "Hi {{name}}, your DocHomoeo order {{orderNumber}} for {{total}} is placed. Track: {{link}}",
  },
  {
    event: "order.paid", audience: "CUSTOMER", description: "To the buyer, when an online payment for an order is received.",
    placeholders: ["name", "orderNumber", "total", "items", "address", "link"],
    emailSubject: "Payment received for order {{orderNumber}}",
    emailBody: `Hello {{name}},\n\nWe have received your payment of {{total}} for order {{orderNumber}}. Thank you.\n\nItems:\n{{items}}\n\nDelivering to: {{address}}\n\nYou can follow your order here: {{link}}\n\n${SIGN_OFF}`,
    smsText: "Hi {{name}}, we received {{total}} for your DocHomoeo order {{orderNumber}}. Track: {{link}}",
  },
  {
    event: "order.shipped", audience: "CUSTOMER", description: "To the buyer, when the order is handed to the courier.",
    placeholders: ["name", "orderNumber", "courier", "trackingNumber", "trackingLink", "link"],
    emailSubject: "Your order {{orderNumber}} is on its way",
    emailBody: `Hello {{name}},\n\nGood news: your order {{orderNumber}} has been shipped.\n\nCourier: {{courier}}\nTracking number: {{trackingNumber}}\nTrack the parcel: {{trackingLink}}\n\nOrder details: {{link}}\n\n${SIGN_OFF}`,
    smsText: "Hi {{name}}, your DocHomoeo order {{orderNumber}} is shipped via {{courier}}. Tracking no. {{trackingNumber}}. {{trackingLink}}",
  },
  {
    event: "order.delivered", audience: "CUSTOMER", description: "To the buyer, when the order is delivered.",
    placeholders: ["name", "orderNumber", "link"],
    emailSubject: "Your order {{orderNumber}} has been delivered",
    emailBody: `Hello {{name}},\n\nYour order {{orderNumber}} has been delivered. We hope everything reached you in good condition.\n\nIf anything is wrong with it, reply to this email and we will help.\n\nOrder details: {{link}}\n\n${SIGN_OFF}`,
    smsText: "Hi {{name}}, your DocHomoeo order {{orderNumber}} has been delivered. Thank you for shopping with us.",
  },
  {
    event: "order.cancelled", audience: "CUSTOMER", description: "To the buyer, when an order is cancelled (by them, by staff, or because it was never paid).",
    placeholders: ["name", "orderNumber", "reason", "refundNote", "link"],
    emailSubject: "Your order {{orderNumber}} has been cancelled",
    emailBody: `Hello {{name}},\n\nYour order {{orderNumber}} has been cancelled.\n\nReason: {{reason}}\n{{refundNote}}\n\nOrder details: {{link}}\n\n${SIGN_OFF}`,
    smsText: "Hi {{name}}, your DocHomoeo order {{orderNumber}} has been cancelled. {{refundNote}}",
  },
  {
    event: "refund.sent", audience: "CUSTOMER", description: "To the customer, when money they paid online is sent back to them.",
    placeholders: ["name", "amount", "what", "number", "link"],
    emailSubject: "Your refund of {{amount}} is on its way",
    emailBody: `Hello {{name}},\n\nWe have refunded {{amount}} for your {{what}} {{number}}.\n\nThe money goes back to the account or card you paid from. Banks usually show it within 5 to 7 working days.\n\nDetails: {{link}}\n\n${SIGN_OFF}`,
    smsText: "Hi {{name}}, DocHomoeo has refunded {{amount}} for your {{what}} {{number}}. It reaches your account in 5-7 working days.",
  },
  {
    event: "appointment.booked", audience: "PATIENT", description: "To the patient, when a consultation is paid for and confirmed.",
    placeholders: ["name", "doctor", "when", "mode", "appointmentNumber", "callLink", "fee"],
    emailSubject: "Your consultation with {{doctor}} is confirmed",
    emailBody: `Hello {{name}},\n\nYour consultation is booked.\n\nDoctor: {{doctor}}\nWhen: {{when}}\nHow: {{mode}}\nBooking number: {{appointmentNumber}}\nFee paid: {{fee}}\n\nJoin the call here at the time of your appointment: {{callLink}}\n\nYou can cancel up to 2 hours before it starts.\n\n${SIGN_OFF}`,
    smsText: "Hi {{name}}, your consultation with {{doctor}} is confirmed for {{when}}. Join: {{callLink}}",
  },
  {
    event: "appointment.new", audience: "DOCTOR", description: "To the doctor, when a patient books one of their slots.",
    placeholders: ["name", "patient", "when", "mode", "appointmentNumber", "problem", "link"],
    emailSubject: "New appointment: {{patient}}, {{when}}",
    emailBody: `Hello {{name}},\n\nA patient has booked a consultation with you.\n\nPatient: {{patient}}\nWhen: {{when}}\nHow: {{mode}}\nBooking number: {{appointmentNumber}}\nProblem: {{problem}}\n\nSee it in your dashboard: {{link}}\n\n${SIGN_OFF}`,
    smsText: "New appointment: {{patient}} on {{when}} ({{mode}}). See your DocHomoeo dashboard.",
  },
  {
    event: "appointment.reminder", audience: "PATIENT", description: "To the patient and the doctor, about 15 minutes before a consultation starts.",
    placeholders: ["name", "with", "when", "mode", "callLink"],
    emailSubject: "Reminder: your consultation starts at {{when}}",
    emailBody: `Hello {{name}},\n\nThis is a reminder that your consultation with {{with}} starts soon.\n\nWhen: {{when}}\nHow: {{mode}}\n\nJoin the call here: {{callLink}}\n\n${SIGN_OFF}`,
    smsText: "Reminder: your DocHomoeo consultation with {{with}} starts at {{when}}. Join: {{callLink}}",
  },
  {
    event: "appointment.cancelled", audience: "PATIENT", description: "To the patient and the doctor, when a consultation is cancelled.",
    placeholders: ["name", "with", "when", "appointmentNumber", "refundNote"],
    emailSubject: "Consultation on {{when}} has been cancelled",
    emailBody: `Hello {{name}},\n\nThe consultation with {{with}} on {{when}} (booking {{appointmentNumber}}) has been cancelled.\n{{refundNote}}\n\n${SIGN_OFF}`,
    smsText: "Your DocHomoeo consultation with {{with}} on {{when}} has been cancelled. {{refundNote}}",
  },
  {
    event: "prescription.issued", audience: "PATIENT", description: "To the patient, when the doctor gives them the prescription.",
    placeholders: ["name", "doctor", "prescriptionNumber", "link"],
    emailSubject: "Your prescription from {{doctor}} is ready",
    emailBody: `Hello {{name}},\n\n{{doctor}} has written your prescription ({{prescriptionNumber}}).\n\nYou can read it and order the medicines in one step here: {{link}}\n\n${SIGN_OFF}`,
    smsText: "Hi {{name}}, your prescription from {{doctor}} is ready. View and order medicines: {{link}}",
  },
  {
    event: "doctor.registered", audience: "DOCTOR", description: "To the doctor, right after they send their registration.",
    placeholders: ["name", "stream", "link"],
    emailSubject: "We have received your registration",
    emailBody: `Hello {{name}},\n\nThank you for registering with DocHomoeo as a {{stream}} doctor.\n\nOur team is checking your documents. This usually takes up to two working days, and we will write to you as soon as it is done. Meanwhile you can take the short test for your stream in your dashboard: {{link}}\n\n${SIGN_OFF}`,
    smsText: "Hi {{name}}, we received your DocHomoeo registration. We will verify your documents within 2 working days.",
  },
  {
    event: "doctor.verified", audience: "DOCTOR", description: "To the doctor, when staff verify their documents.",
    placeholders: ["name", "nextStep", "link"],
    emailSubject: "Your DocHomoeo account is verified",
    emailBody: `Hello {{name}},\n\nYour documents have been verified. Welcome to DocHomoeo.\n\n{{nextStep}}\n\nOpen your dashboard: {{link}}\n\n${SIGN_OFF}`,
    smsText: "Hi {{name}}, your DocHomoeo account is verified. Open your dashboard: {{link}}",
  },
  {
    event: "doctor.rejected", audience: "DOCTOR", description: "To the doctor, when their registration is not accepted or their account is suspended.",
    placeholders: ["name", "decision", "reason"],
    emailSubject: "About your DocHomoeo registration",
    emailBody: `Hello {{name}},\n\n{{decision}}\n\nReason: {{reason}}\n\nIf you think this is a mistake, or you can send the missing documents, please reply to this email.\n\n${SIGN_OFF}`,
    smsText: "Hi {{name}}, there is an update on your DocHomoeo registration. Please check your email.",
  },
  {
    event: "doctor.test_passed", audience: "DOCTOR", description: "To the doctor, when they pass the test for their stream.",
    placeholders: ["name", "stream", "score", "level", "link"],
    emailSubject: "You passed the {{stream}} test",
    emailBody: `Hello {{name}},\n\nWell done. You passed the {{stream}} test with {{score}}.\n\nYou start at the {{level}} level. Set your fee and working hours in your dashboard so patients can book you: {{link}}\n\n${SIGN_OFF}`,
    smsText: "Hi {{name}}, you passed the DocHomoeo {{stream}} test ({{score}}). Set your working hours: {{link}}",
  },
  {
    event: "doctor.level_up", audience: "DOCTOR", description: "To the doctor, when they move up a level by themselves.",
    placeholders: ["name", "level", "patients", "share", "consultations", "link"],
    emailSubject: "Congratulations, you are now a {{level}} doctor",
    emailBody: `Hello {{name}},\n\nYou have completed {{consultations}} consultations, and your patients rate you well. You have moved up to the {{level}} level.\n\nYou can now take up to {{patients}} patients a day, and you keep {{share}} of each consultation fee.\n\nOpen your dashboard: {{link}}\n\n${SIGN_OFF}`,
    smsText: "Congratulations {{name}}, you are now a {{level}} doctor on DocHomoeo: up to {{patients}} patients a day.",
  },
  {
    event: "appointment.missed", audience: "DOCTOR", description: "To the doctor, when a booked consultation passed without them starting the call.",
    placeholders: ["name", "patient", "when", "appointmentNumber", "link"],
    emailSubject: "You missed a consultation at {{when}}",
    emailBody: `Hello {{name}},\n\nThe consultation with {{patient}} at {{when}} (booking {{appointmentNumber}}) was not started, so it has been cancelled and the patient is getting their money back.\n\nIf you cannot take a slot, please mark the time off under Working hours so patients cannot book it: {{link}}\n\n${SIGN_OFF}`,
    smsText: "You missed your DocHomoeo consultation with {{patient}} at {{when}}. It was cancelled and the patient refunded.",
  },
  {
    event: "payout.paid", audience: "DOCTOR", description: "To the doctor, when their earnings are paid to their bank account.",
    placeholders: ["name", "amount", "period", "reference", "link"],
    emailSubject: "{{amount}} has been paid to your bank account",
    emailBody: `Hello {{name}},\n\nWe have transferred {{amount}} to your bank account for consultations from {{period}}.\n\nBank reference: {{reference}}\n\nSee the details in your dashboard: {{link}}\n\n${SIGN_OFF}`,
    smsText: "Hi {{name}}, DocHomoeo has paid {{amount}} to your bank account. Ref {{reference}}.",
  },
  {
    event: "staff.order_placed", audience: "STAFF", description: "To staff, when a new order comes in.",
    placeholders: ["orderNumber", "customer", "total", "paymentMethod", "kind", "items", "link"],
    emailSubject: "New {{kind}} order {{orderNumber}}: {{total}}",
    emailBody: `A new {{kind}} order has been placed.\n\nOrder: {{orderNumber}}\nCustomer: {{customer}}\nTotal: {{total}} ({{paymentMethod}})\n\nItems:\n{{items}}\n\nOpen it: {{link}}`,
    smsText: "New {{kind}} order {{orderNumber}} for {{total}} from {{customer}}.",
  },
  {
    event: "staff.doctor_registered", audience: "STAFF", description: "To staff, when a doctor registers and is waiting to be verified.",
    placeholders: ["doctor", "stream", "city", "phone", "link"],
    emailSubject: "New doctor to verify: {{doctor}}",
    emailBody: `A doctor has registered and is waiting for verification.\n\nName: {{doctor}}\nStream: {{stream}}\nCity: {{city}}\nMobile: {{phone}}\n\nCheck the documents: {{link}}`,
    smsText: "New doctor to verify: {{doctor}} ({{stream}}, {{city}}).",
  },
  {
    event: "return.requested", audience: "CUSTOMER", description: "To the buyer, when they ask to return items and staff have not decided yet.",
    placeholders: ["name", "returnNumber", "orderNumber", "items", "reason", "link"],
    emailSubject: "We have your return request {{returnNumber}}",
    emailBody: `Hello {{name}},\n\nWe have received your request to return items from order {{orderNumber}}.\n\nReturn number: {{returnNumber}}\nItems:\n{{items}}\nReason: {{reason}}\n\nWe will look at it and write to you shortly.\n\nFollow it here: {{link}}\n\n${SIGN_OFF}`,
    smsText: "Hi {{name}}, we have your return request {{returnNumber}} for DocHomoeo order {{orderNumber}}. We will update you shortly.",
  },
  {
    event: "return.approved", audience: "CUSTOMER", description: "To the buyer, when a return is approved (by staff, automatically, or opened by staff for them).",
    placeholders: ["name", "returnNumber", "orderNumber", "items", "amount", "note", "link"],
    emailSubject: "Your return {{returnNumber}} is approved",
    emailBody: `Hello {{name}},\n\nYour return for order {{orderNumber}} is approved.\n\nReturn number: {{returnNumber}}\nItems:\n{{items}}\n\n{{note}}\n\nOnce the parcel reaches us and is checked, we will refund {{amount}}.\n\nFollow it here: {{link}}\n\n${SIGN_OFF}`,
    smsText: "Hi {{name}}, your DocHomoeo return {{returnNumber}} is approved. Keep the parcel ready for pickup. Refund of {{amount}} follows once we receive it.",
  },
  {
    event: "return.pickup_booked", audience: "CUSTOMER", description: "To the buyer, when a courier is booked to collect their return.",
    placeholders: ["name", "returnNumber", "orderNumber", "courier", "trackingNumber", "trackingLink", "link"],
    emailSubject: "Pickup booked for your return {{returnNumber}}",
    emailBody: `Hello {{name}},\n\nA courier is booked to collect your return {{returnNumber}} (order {{orderNumber}}) from your delivery address.\n\nCourier: {{courier}}\nTracking number: {{trackingNumber}}\nFollow the pickup: {{trackingLink}}\n\nPlease keep the parcel packed and ready. You do not have to pay the courier anything.\n\nDetails: {{link}}\n\n${SIGN_OFF}`,
    smsText: "Hi {{name}}, {{courier}} will collect your DocHomoeo return {{returnNumber}}. Tracking no. {{trackingNumber}}. Please keep the parcel ready.",
  },
  {
    event: "return.cancelled", audience: "CUSTOMER", description: "To the buyer, when an approved return is cancelled before the parcel is collected.",
    placeholders: ["name", "returnNumber", "orderNumber", "note", "link"],
    emailSubject: "Your return {{returnNumber}} has been cancelled",
    emailBody: `Hello {{name}},\n\nYour return {{returnNumber}} for order {{orderNumber}} has been cancelled, so no parcel will be collected.\n\nReason: {{note}}\n\nOrder details: {{link}}\n\n${SIGN_OFF}`,
    smsText: "Hi {{name}}, your DocHomoeo return {{returnNumber}} has been cancelled. No parcel will be collected.",
  },
  {
    event: "return.rejected", audience: "CUSTOMER", description: "To the buyer, when a return request is not accepted.",
    placeholders: ["name", "returnNumber", "orderNumber", "note", "link"],
    emailSubject: "About your return request {{returnNumber}}",
    emailBody: `Hello {{name}},\n\nWe are sorry, we could not accept your return request {{returnNumber}} for order {{orderNumber}}.\n\nReason: {{note}}\n\nIf you think this is a mistake, reply to this email and we will look again.\n\nOrder details: {{link}}\n\n${SIGN_OFF}`,
    smsText: "Hi {{name}}, we could not accept your DocHomoeo return {{returnNumber}}. Reason: {{note}}",
  },
  {
    event: "return.received", audience: "CUSTOMER", description: "To the buyer, when the returned parcel reaches the warehouse.",
    placeholders: ["name", "returnNumber", "orderNumber", "refundNote", "link"],
    emailSubject: "We have received your return {{returnNumber}}",
    emailBody: `Hello {{name}},\n\nThe items you returned from order {{orderNumber}} have reached us.\n\n{{refundNote}}\n\nDetails: {{link}}\n\n${SIGN_OFF}`,
    smsText: "Hi {{name}}, DocHomoeo has received your return {{returnNumber}}. {{refundNote}}",
  },
  {
    event: "return.refunded", audience: "CUSTOMER", description: "To the buyer, when a return is refunded outside the payment gateway (bank transfer, UPI, or taken off what they owe).",
    placeholders: ["name", "returnNumber", "orderNumber", "amount", "how", "link"],
    emailSubject: "Your refund of {{amount}} for return {{returnNumber}}",
    emailBody: `Hello {{name}},\n\nWe have refunded {{amount}} for return {{returnNumber}} (order {{orderNumber}}), {{how}}.\n\nDetails: {{link}}\n\n${SIGN_OFF}`,
    smsText: "Hi {{name}}, DocHomoeo has refunded {{amount}} for your return {{returnNumber}}, {{how}}.",
  },
  {
    event: "staff.return_requested", audience: "STAFF", description: "To staff, when a customer asks to return items and someone has to decide.",
    placeholders: ["returnNumber", "orderNumber", "customer", "items", "reason", "amount", "adminLink"],
    emailSubject: "Return request {{returnNumber}} for order {{orderNumber}}",
    emailBody: `A customer wants to return items.\n\nReturn: {{returnNumber}}\nOrder: {{orderNumber}}\nCustomer: {{customer}}\nItems:\n{{items}}\nReason: {{reason}}\nRefund if accepted: {{amount}}\n\nApprove or reject it here: {{adminLink}}`,
    smsText: "Return request {{returnNumber}} for order {{orderNumber}} ({{customer}}): {{reason}}.",
  },
  {
    event: "staff.return_arrived", audience: "STAFF", description: "To staff, when the courier says a returned parcel is back at the warehouse and has to be opened.",
    placeholders: ["returnNumber", "link"],
    emailSubject: "Return {{returnNumber}} has arrived",
    emailBody: `The courier has delivered the parcel for return {{returnNumber}} back to you.\n\nOpen it, count what is fit to sell, and confirm it here so the stock and the refund are sorted out: {{link}}`,
    smsText: "DocHomoeo return {{returnNumber}} has arrived. Open the parcel and confirm it in the panel.",
  },
  {
    event: "staff.return_pickup_problem", audience: "STAFF", description: "To staff, when a courier could not be booked for a return, or the courier cancels or fails the pickup.",
    placeholders: ["returnNumber", "reason", "link"],
    emailSubject: "Pickup problem with return {{returnNumber}}",
    emailBody: `Something went wrong with collecting return {{returnNumber}}.\n\n{{reason}}\n\nOpen the return: {{link}}`,
    smsText: "Pickup problem with DocHomoeo return {{returnNumber}}: {{reason}}",
  },
  {
    event: "staff.refund_due", audience: "STAFF", description: "To staff, when something that was paid for online is cancelled and the money has to be returned.",
    placeholders: ["what", "number", "customer", "amount", "note", "link"],
    emailSubject: "Refund due: {{amount}} for {{what}} {{number}}",
    emailBody: `A paid {{what}} was cancelled and the money has to be returned.\n\n{{what}}: {{number}}\nCustomer: {{customer}}\nAmount: {{amount}}\n{{note}}\n\nSend it back with one button: {{link}}`,
    smsText: "Refund due: {{amount}} for {{what}} {{number}} ({{customer}}).",
  },
  {
    event: "staff.shipping_problem", audience: "STAFF", description: "To staff, when an order could not be sent to the courier, or the courier cannot deliver it.",
    placeholders: ["orderNumber", "reason", "link"],
    emailSubject: "Delivery problem with order {{orderNumber}}",
    emailBody: `Something went wrong with the delivery of order {{orderNumber}}.\n\n{{reason}}\n\nOpen the order: {{link}}`,
    smsText: "Delivery problem with DocHomoeo order {{orderNumber}}: {{reason}}",
  },
  {
    event: "staff.payouts_ready", audience: "STAFF", description: "To staff, on the payout day, when doctor payouts have been gathered and are ready to pay.",
    placeholders: ["count", "total", "list", "skipped", "link"],
    emailSubject: "{{count}} doctor payouts ready to pay: {{total}}",
    emailBody: `This round of doctor payouts is ready.\n\nPayouts: {{count}}\nTotal: {{total}}\n\n{{list}}\n\n{{skipped}}\n\nDownload the bank sheet and mark them paid: {{link}}`,
    smsText: "{{count}} DocHomoeo doctor payouts are ready to pay, total {{total}}.",
  },
  {
    event: "staff.report", audience: "STAFF", description: "To staff: the daily, weekly or monthly summary of sales, consultations and what is waiting. Set who gets it and when in Admin → Report emails.",
    placeholders: ["title", "body", "period", "orders", "revenue", "link"],
    emailSubject: "{{title}}",
    emailBody: `{{body}}\n\nOpen the full reports: {{link}}`,
    smsText: "DocHomoeo {{period}}: {{orders}} orders, {{revenue}}.",
  },
  {
    event: "staff.low_stock", audience: "STAFF", description: "To staff, once a day, when products are out of stock or running low.",
    placeholders: ["outCount", "lowCount", "list", "link"],
    emailSubject: "Stock check: {{outCount}} out of stock, {{lowCount}} running low",
    emailBody: `Today's stock check.\n\nOut of stock: {{outCount}}\nRunning low: {{lowCount}}\n\n{{list}}\n\nSee everything: {{link}}`,
    smsText: "DocHomoeo stock: {{outCount}} products out, {{lowCount}} running low.",
  },
];

const EVENT_BY_KEY = new Map(EVENTS.map((e) => [e.event, e]));

/** Adds any message kind that is not in the database yet. Wording staff have changed is never overwritten. */
export const ensureTemplates = async () => {
  const have = new Set((await prisma.notificationTemplate.findMany({ select: { event: true } })).map((t) => t.event));
  const missing = EVENTS.filter((e) => !have.has(e.event));
  if (missing.length === 0) return;
  await prisma.notificationTemplate.createMany({
    data: missing.map((e) => ({
      event: e.event, audience: e.audience, description: e.description, emailSubject: e.emailSubject, emailBody: e.emailBody,
      smsText: e.smsText, whatsappParams: [...e.smsText.matchAll(/{{(\w+)}}/g)].map((m) => m[1]),
    })),
    skipDuplicates: true,
  });
};

const fill = (text: string, data: Record<string, string>) => text.replace(/{{\s*(\w+)\s*}}/g, (_whole, key: string) => data[key] ?? "").replace(/\n{3,}/g, "\n\n").trim();
/** The placeholders of a text in the order they first appear: these become var1, var2… of an SMS. */
const placeholdersOf = (text: string) => [...new Set([...text.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]))];

export const money = (value: unknown) => `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(value ?? 0))}`;
export const when = (at: Date) => `${new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).format(at)} IST`;
export const siteLink = (path: string) => `${env.FRONTEND_URL}${path}`;

type Recipient = { userId?: number | null; name?: string | null; email?: string | null; phone?: string | null };
type Related = { type: string; id: number };

/** Files go with the first try only; a later retry sends the email without them. */
const deliver = async (id: number, attachments: Attachment[] = []) => {
  const message = await prisma.notification.findUnique({ where: { id } });
  if (!message || message.status === "SENT" || !message.recipient) return;
  const template = await prisma.notificationTemplate.findUnique({ where: { event: message.event } });
  const data = (message.data ?? {}) as Record<string, string>;
  try {
    if (message.channel === "EMAIL") await sendEmail(message.recipient, message.subject ?? "DocHomoeo", message.body ?? "", attachments);
    if (message.channel === "SMS") await sendSms(message.recipient, template!.smsTemplateId!, placeholdersOf(template!.smsText ?? "").map((key) => data[key] ?? ""));
    if (message.channel === "WHATSAPP") await sendWhatsapp(message.recipient, template!.whatsappTemplate!, template!.whatsappLanguage, template!.whatsappParams.map((key) => data[key] ?? ""));
    await prisma.notification.update({ where: { id }, data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 }, error: null } });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Sending failed";
    await prisma.notification.update({ where: { id }, data: { status: "FAILED", attempts: { increment: 1 }, error: reason.slice(0, 2000) } });
  }
};

/**
 * Sends one kind of message to one person on every channel that is switched on for it.
 * Never throws: whatever goes wrong ends up in the log, not in the caller's way.
 */
export const notify = async (event: string, to: Recipient, values: Record<string, unknown>, related?: Related, options: { attachments?: Attachment[] } = {}) => {
  try {
    const template = await prisma.notificationTemplate.findUnique({ where: { event } });
    if (!template || !template.isActive) return;
    const data = Object.fromEntries(Object.entries({ name: to.name?.trim() || "there", ...values }).map(([key, value]) => [key, value === null || value === undefined ? "" : String(value)]));
    const smsBody = fill(template.smsText ?? "", data);

    const plan: { channel: NotificationChannel; on: boolean; recipient?: string | null; subject?: string; body: string; skip?: string }[] = [
      {
        channel: "EMAIL", on: template.emailEnabled, recipient: to.email, subject: fill(template.emailSubject ?? "", data), body: fill(template.emailBody ?? "", data),
        skip: !emailReady ? "Email is not connected yet" : !to.email ? "No email address for this person" : undefined,
      },
      {
        channel: "SMS", on: template.smsEnabled, recipient: to.phone, body: smsBody,
        skip: !smsReady ? "SMS is not connected yet" : !template.smsTemplateId ? "No approved SMS text is set for this message" : !to.phone ? "No mobile number for this person" : undefined,
      },
      {
        channel: "WHATSAPP", on: template.whatsappEnabled, recipient: to.phone, body: smsBody,
        skip: !whatsappReady ? "WhatsApp is not connected yet" : !template.whatsappTemplate ? "No approved WhatsApp template is set for this message" : !to.phone ? "No mobile number for this person" : undefined,
      },
    ];

    for (const step of plan.filter((p) => p.on)) {
      const row = await prisma.notification.create({
        data: {
          event, channel: step.channel, userId: to.userId ?? null, recipient: step.recipient ?? null, subject: step.subject ?? null, body: step.body,
          status: step.skip ? "SKIPPED" : "QUEUED", error: step.skip ?? null, data, relatedType: related?.type ?? null, relatedId: related?.id ?? null,
        },
      });
      if (!step.skip) await deliver(row.id, step.channel === "EMAIL" ? options.attachments : []);
    }
  } catch (error) {
    console.error(`[notify] ${event}`, error);
  }
};

/** The same, for someone we only know by their account. */
export const notifyUser = async (event: string, userId: number | null | undefined, values: Record<string, unknown>, related?: Related) => {
  if (!userId) return;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true, email: true, phone: true, doctorProfile: { select: { displayName: true } } } }).catch(() => null);
  if (!user) return;
  await notify(event, { userId, name: user.doctorProfile?.displayName ?? [user.firstName, user.lastName].filter(Boolean).join(" "), email: user.email, phone: user.phone }, values, related);
};

/**
 * Staff alerts go to the addresses set in Admin → Automatic messages. When none are set they go to
 * the admins who have signed in to this panel; accounts carried over from the old system and never
 * used here are left out, because their email addresses may not belong to the shop.
 */
export const notifyStaff = async (event: string, values: Record<string, unknown>, related?: Related) => {
  try {
    const setting = await prisma.setting.findUnique({ where: { key: "notifications.staff" } });
    const chosen = (setting?.value ?? {}) as { emails?: string[]; phones?: string[] };
    let emails = (chosen.emails ?? []).filter(Boolean);
    if (emails.length === 0) emails = (await prisma.user.findMany({ where: { role: { in: ["SUPER_ADMIN", "ADMIN"] }, isActive: true, email: { not: null }, lastLoginAt: { not: null } }, select: { email: true } })).map((u) => u.email!);
    const phones = (chosen.phones ?? []).filter(Boolean);
    const people = Math.max(emails.length, phones.length);
    for (let i = 0; i < people; i++) await notify(event, { name: "team", email: emails[i] ?? null, phone: phones[i] ?? null }, values, related);
  } catch (error) {
    console.error(`[notify] ${event}`, error);
  }
};

/** Tries again the messages that failed, a few times, a little later each time. */
export const retryFailed = async () => {
  const failed = await prisma.notification.findMany({
    where: {
      createdAt: { gt: new Date(Date.now() - 2 * 86_400_000) },
      // failed ones a few times, and any left half-sent when the server stopped
      OR: [{ status: "FAILED", attempts: { lt: 3 } }, { status: "QUEUED", createdAt: { lt: new Date(Date.now() - 10 * 60_000) } }],
    },
    orderBy: { id: "asc" }, take: 30, select: { id: true },
  });
  for (const message of failed) {
    await prisma.notification.update({ where: { id: message.id }, data: { status: "QUEUED" } });
    await deliver(message.id);
  }
  return failed.length;
};

/** Sends a failed or skipped message again, on staff's request. */
export const resend = async (id: number) => {
  const message = await prisma.notification.findUnique({ where: { id } });
  if (!message) return null;
  await prisma.notification.update({ where: { id }, data: { status: "QUEUED", error: null } });
  await deliver(id);
  return prisma.notification.findUnique({ where: { id } });
};

export const placeholdersFor = (event: string) => EVENT_BY_KEY.get(event)?.placeholders ?? [];
export const defaultFor = (event: string) => EVENT_BY_KEY.get(event) ?? null;
