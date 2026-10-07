import { checkRefund } from "../lib/refunds";
import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { settlePayment } from "../lib/payments";
import { readCallback } from "../lib/phonepe";

// Where the payment gateway sends people and messages back to. Mounted at /api/pay, open to everyone:
// neither route trusts what it is told, both ask the gateway itself what happened.
export const payRoutes = Router();

const reference = z.string().regex(/^DH\d+T[0-9a-f]{10}$/);

// The customer's browser returning from the pay page. We check the payment, then send them to the page they came from.
payRoutes.all("/return/:transactionId", async (req, res) => {
  const parsed = reference.safeParse(req.params.transactionId);
  const result = parsed.success ? await settlePayment(parsed.data).catch(() => null) : null;
  if (!result) return res.redirect(303, `${env.FRONTEND_URL}/`);
  const outcome = result.state === "SUCCESS" ? "success" : result.state === "PENDING" ? "pending" : "failed";
  res.redirect(303, `${env.FRONTEND_URL}${result.returnTo}${result.returnTo.includes("?") ? "&" : "?"}payment=${outcome}`);
});

// PhonePe's own server-to-server message. Only works once the site has a public address (PUBLIC_API_URL).
payRoutes.post("/callback", async (req, res) => {
  const transactionId = readCallback(req.body, req.header("x-verify"));
  if (!transactionId) return res.status(400).json({ ok: false });
  // a refund's reference starts DHR; a payment's starts DH
  if (/^DHR\d+T[0-9a-f]{10}$/.test(transactionId)) {
    await checkRefund(transactionId);
    return res.json({ ok: true });
  }
  if (!reference.safeParse(transactionId).success) return res.status(400).json({ ok: false });
  await settlePayment(transactionId);
  res.json({ ok: true });
});
