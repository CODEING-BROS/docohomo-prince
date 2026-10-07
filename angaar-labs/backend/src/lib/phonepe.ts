import { createHash } from "node:crypto";
import { env } from "../config/env";

// PhonePe payment gateway ("standard checkout", the same one the old site used).
// We send the amount and get back the address of PhonePe's own pay page; the customer pays there
// by UPI, card or net banking and is sent back to us. We then ask PhonePe whether the money arrived:
// nothing the browser says is trusted.

export const gatewayReady = Boolean(env.PHONEPE_MERCHANT_ID && env.PHONEPE_SALT_KEY);

const BASE = env.PHONEPE_BASE_URL ?? (env.PHONEPE_ENV === "sandbox" ? "https://api-preprod.phonepe.com/apis/pg-sandbox" : "https://api.phonepe.com/apis/hermes");
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
// every request is signed with the merchant's secret key
const sign = (text: string) => `${sha256(text + env.PHONEPE_SALT_KEY)}###${env.PHONEPE_SALT_INDEX}`;

type PhonePeReply = { success?: boolean; code?: string; message?: string; data?: Record<string, any> };

/** Asks PhonePe for a pay page. Returns the address to send the customer to. */
export const createPayPage = async (input: { transactionId: string; userId: number; amount: number; phone?: string | null; redirectUrl: string; callbackUrl?: string }) => {
  const payload = Buffer.from(
    JSON.stringify({
      merchantId: env.PHONEPE_MERCHANT_ID,
      merchantTransactionId: input.transactionId,
      merchantUserId: `U${input.userId}`,
      amount: Math.round(input.amount * 100), // paise
      redirectUrl: input.redirectUrl,
      redirectMode: "REDIRECT",
      ...(input.callbackUrl ? { callbackUrl: input.callbackUrl } : {}),
      ...(input.phone ? { mobileNumber: input.phone } : {}),
      paymentInstrument: { type: "PAY_PAGE" },
    }),
  ).toString("base64");

  const response = await fetch(`${BASE}/pg/v1/pay`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", "X-VERIFY": sign(`${payload}/pg/v1/pay`) },
    body: JSON.stringify({ request: payload }),
    signal: AbortSignal.timeout(15_000),
  });
  const reply = (await response.json().catch(() => null)) as PhonePeReply | null;
  const url = reply?.data?.instrumentResponse?.redirectInfo?.url as string | undefined;
  if (!response.ok || !reply?.success || !url) throw new Error(`PhonePe did not open a pay page: ${reply?.code ?? response.status} ${reply?.message ?? ""}`.trim());
  return url;
};

export type GatewayStatus = { state: "SUCCESS" | "FAILED" | "PENDING"; amount: number | null; method: string | null; reference: string | null; raw: unknown };

/** What PhonePe says happened to a payment. This is the only thing that decides whether money arrived. */
export const fetchStatus = async (transactionId: string): Promise<GatewayStatus> => {
  const path = `/pg/v1/status/${env.PHONEPE_MERCHANT_ID}/${transactionId}`;
  const response = await fetch(`${BASE}${path}`, {
    headers: { accept: "application/json", "content-type": "application/json", "X-VERIFY": sign(path), "X-MERCHANT-ID": env.PHONEPE_MERCHANT_ID! },
    signal: AbortSignal.timeout(15_000),
  });
  const reply = (await response.json().catch(() => null)) as PhonePeReply | null;
  const code = reply?.code ?? "";
  const state = code === "PAYMENT_SUCCESS" ? "SUCCESS" : code === "PAYMENT_PENDING" || code === "INTERNAL_SERVER_ERROR" || !reply ? "PENDING" : "FAILED";
  return {
    state,
    amount: typeof reply?.data?.amount === "number" ? reply.data.amount / 100 : null,
    method: (reply?.data?.paymentInstrument?.type as string | undefined) ?? null,
    reference: (reply?.data?.transactionId as string | undefined) ?? null,
    raw: reply,
  };
};

/** Checks that a server-to-server message really came from PhonePe, and returns the payment it is about. */
export const readCallback = (body: unknown, signature: string | undefined) => {
  const encoded = (body as { response?: unknown } | null)?.response;
  if (typeof encoded !== "string" || !signature) return null;
  if (signature !== sign(encoded)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as PhonePeReply;
    return (decoded.data?.merchantTransactionId as string | undefined) ?? null;
  } catch {
    return null;
  }
};

/**
 * Asks PhonePe to send money back for a payment. `refundId` is our own new reference for the refund;
 * what happened to it is then read with fetchStatus(refundId), the same way as for a payment.
 */
export const requestRefund = async (input: { refundId: string; paymentTransactionId: string; userId: number | null; amount: number; callbackUrl?: string }): Promise<GatewayStatus> => {
  const payload = Buffer.from(
    JSON.stringify({
      merchantId: env.PHONEPE_MERCHANT_ID,
      merchantUserId: `U${input.userId ?? 0}`,
      originalTransactionId: input.paymentTransactionId,
      merchantTransactionId: input.refundId,
      amount: Math.round(input.amount * 100), // paise
      ...(input.callbackUrl ? { callbackUrl: input.callbackUrl } : {}),
    }),
  ).toString("base64");
  const response = await fetch(`${BASE}/pg/v1/refund`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", "X-VERIFY": sign(`${payload}/pg/v1/refund`) },
    body: JSON.stringify({ request: payload }),
    signal: AbortSignal.timeout(20_000),
  });
  const reply = (await response.json().catch(() => null)) as PhonePeReply | null;
  const code = reply?.code ?? "";
  // "accepted" is not "done": PhonePe finishes most refunds a little later
  const state = code === "PAYMENT_SUCCESS" ? "SUCCESS" : code === "PAYMENT_PENDING" || code === "PAYMENT_INITIATED" ? "PENDING" : "FAILED";
  return { state, amount: typeof reply?.data?.amount === "number" ? reply.data.amount / 100 : null, method: null, reference: (reply?.data?.transactionId as string | undefined) ?? null, raw: reply ?? { httpStatus: response.status } };
};
