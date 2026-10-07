import nodemailer from "nodemailer";
import { env } from "../config/env";

// The three ways the system can reach someone, each used only when its keys are filled in in .env:
//   email     any SMTP account (Brevo now; the old site used Gmail)
//   SMS       MSG91, the same account as the old site. In India every SMS text must be approved
//             first (DLT); MSG91 gives each approved text a "flow id", which is what we send.
//   WhatsApp  Meta's WhatsApp Cloud API. Every message must use a template approved by WhatsApp.

export const emailReady = Boolean(env.SMTP_USER && env.SMTP_PASS);
// With a plain mailbox (Gmail) the login is also the sender. With a mail service (Brevo and the like)
// the login is only a key, so the address the emails come from has to be given separately.
const mailbox = /gmail|googlemail|outlook|office365|zoho|yahoo/i.test(env.SMTP_HOST);
const sender = env.MAIL_FROM ?? (mailbox && env.SMTP_USER ? `DocHomoeo <${env.SMTP_USER}>` : null);
export const smsReady = Boolean(env.MSG91_AUTH_KEY);
export const otpSmsReady = Boolean(env.MSG91_AUTH_KEY && env.MSG91_TEMPLATE_ID);
export const whatsappReady = Boolean(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);

const mobile = (phone: string) => `91${phone.replace(/\D/g, "").slice(-10)}`;

// ───────────────────────────────────────────── email

let mailer: nodemailer.Transporter | null = null;
const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// links typed in a message become clickable
const linkify = (html: string) => html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#0d7a4f">$1</a>');

/** Wraps a plain-text message in the shop's simple letterhead. */
const letter = (text: string) => `<!doctype html><html><body style="margin:0;background:#f4f6f5;font-family:Arial,Helvetica,sans-serif;color:#1f2a25">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #e3e8e5">
<tr><td style="padding:20px 28px;border-bottom:1px solid #e3e8e5;font-size:20px;font-weight:700;color:#0d7a4f">DocHomoeo</td></tr>
<tr><td style="padding:24px 28px;font-size:15px;line-height:1.6">${linkify(escapeHtml(text)).split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${p.replace(/\n/g, "<br>")}</p>`).join("")}</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #e3e8e5;font-size:12px;color:#6b7a73">This is an automatic message from DocHomoeo. Please do not share any code or password with anyone.</td></tr>
</table></td></tr></table></body></html>`;

export type Attachment = { filename: string; content: Buffer };

export const sendEmail = async (to: string, subject: string, text: string, attachments: Attachment[] = []) => {
  mailer ??= nodemailer.createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_PORT === 465, auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } });
  if (!sender) throw new Error("No sender address is set (MAIL_FROM)");
  await mailer.sendMail({ from: sender, to, subject, text, html: letter(text), attachments });
};

// ───────────────────────────────────────────── SMS

/** How the last real text message went. Kept in memory; null until one has been sent since the server started. */
let lastSms: { ok: boolean; at: number; reason?: string } | null = null;
const smsWent = () => { lastSms = { ok: true, at: Date.now() }; };
const smsFailed = (reason: string) => {
  lastSms = { ok: false, at: Date.now(), reason };
  return new Error(reason);
};

/** Sends an approved SMS text. `values` fill the text's variables in order (var1, var2…). */
export const sendSms = async (phone: string, flowId: string, values: string[]) => {
  const response = await fetch("https://control.msg91.com/api/v5/flow", {
    method: "POST",
    headers: { authkey: env.MSG91_AUTH_KEY!, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ template_id: flowId, short_url: "0", recipients: [{ mobiles: mobile(phone), ...Object.fromEntries(values.map((value, index) => [`var${index + 1}`, value])) }] }),
    signal: AbortSignal.timeout(10_000),
  });
  const result = (await response.json().catch(() => null)) as { type?: string; message?: string } | null;
  if (!response.ok || result?.type === "error") throw smsFailed(`MSG91 refused the message: ${result?.message ?? response.status}`);
  smsWent();
};

/** The sign-in code, through MSG91's own OTP route. Its text must contain the ##OTP## placeholder. */
const sendOtpSms = async (phone: string, code: string) => {
  const url = new URL("https://control.msg91.com/api/v5/otp");
  url.searchParams.set("template_id", env.MSG91_TEMPLATE_ID!);
  url.searchParams.set("mobile", mobile(phone));
  url.searchParams.set("otp", code);
  const response = await fetch(url, { method: "POST", headers: { authkey: env.MSG91_AUTH_KEY!, "content-type": "application/json" }, signal: AbortSignal.timeout(10_000) });
  const result = (await response.json().catch(() => null)) as { type?: string; message?: string } | null;
  if (!response.ok || result?.type === "error") throw smsFailed(`MSG91 refused the message: ${result?.message ?? response.status}`);
  smsWent();
};

// ───────────────────────────────────────────── WhatsApp

/** Sends an approved WhatsApp template. `values` fill its {{1}}, {{2}}… in order. */
export const sendWhatsapp = async (phone: string, template: string, language: string, values: string[]) => {
  const response = await fetch(`https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.WHATSAPP_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp", to: mobile(phone), type: "template",
      template: { name: template, language: { code: language }, ...(values.length ? { components: [{ type: "body", parameters: values.map((text) => ({ type: "text", text })) }] } : {}) },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const result = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (!response.ok || result?.error) throw new Error(`WhatsApp refused the message: ${result?.error?.message ?? response.status}`);
};

// ───────────────────────────────────────────── sign-in codes

/**
 * Sends a sign-in code to the mobile number and, when we have one, the email address.
 * Succeeds if at least one of them went out; says which.
 */
export const deliverCode = async (phone: string, code: string, email?: string | null) => {
  const sent = { sms: false, email: false };
  const problems: string[] = [];
  if (otpSmsReady) {
    try {
      await sendOtpSms(phone, code);
      sent.sms = true;
    } catch (error) {
      problems.push(error instanceof Error ? error.message : "SMS failed");
    }
  }
  if (emailReady && email) {
    try {
      await sendEmail(email, `${code} is your DocHomoeo verification code`, `Your DocHomoeo verification code is ${code}.\n\nIt works for 10 minutes. If you did not ask for it, you can ignore this email.`);
      sent.email = true;
    } catch (error) {
      problems.push(error instanceof Error ? error.message : "Email failed");
    }
  }
  if (problems.length) console.error("[otp]", problems.join("; "));
  return sent;
};

// ───────────────────────────────────────────── is it really working?

let checked: { at: number; problems: { email?: string; sms?: string } } | null = null;

/**
 * Keys being filled in does not mean a channel works: the email login may be refused, the SMS key
 * may be wrong. Email is asked directly (without sending anything) and the answer is remembered for
 * ten minutes. For SMS the test is what MSG91 said the last time a text was really sent; until one
 * has been, only a key MSG91 does not recognise is reported.
 *
 * MSG91's balance figure is deliberately NOT used: it reports one credit pool, sign-in codes and
 * approved texts are paid from others, and an account showing 0 there can be sending normally.
 */
/** The latest real send always wins over an older check. */
const withSms = (problems: { email?: string; sms?: string }) => {
  if (!lastSms) return problems;
  const { sms: _old, ...rest } = problems;
  return lastSms.ok ? rest : { ...rest, sms: `The last text message did not go out. ${lastSms.reason ?? ""}`.trim() };
};

/** When a text message last went out successfully, for the admin page. */
export const lastSmsSentAt = () => (lastSms?.ok ? new Date(lastSms.at).toISOString() : null);

export const channelProblems = async () => {
  if (checked && Date.now() - checked.at < 10 * 60_000) return withSms(checked.problems);
  const problems: { email?: string; sms?: string } = {};
  if (emailReady && !sender) {
    problems.email = "No sender address is set. Add MAIL_FROM with an address that is verified in the mail service.";
  } else if (emailReady) {
    try {
      mailer ??= nodemailer.createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_PORT === 465, auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } });
      await mailer.verify();
    } catch (error) {
      const reason = error instanceof Error ? error.message : "";
      problems.email = /invalid login|not accepted|534|535/i.test(reason)
        ? "The email service refuses the login. Check the login and the key (for Brevo: the SMTP login and an SMTP key, not the API key)."
        : "The email service could not be reached.";
    }
  }
  let keyRefused = false;
  if (smsReady && !lastSms) {
    try {
      const response = await fetch(`https://control.msg91.com/api/balance.php?authkey=${encodeURIComponent(env.MSG91_AUTH_KEY!)}&type=4`, { signal: AbortSignal.timeout(8000) });
      const answer = (await response.text()).trim();
      keyRefused = /auth|invalid|not\s*valid/i.test(answer) && !/^[0-9]/.test(answer);
    } catch {
      // not reachable just now: say nothing rather than raise a false alarm
    }
  }
  checked = { at: Date.now(), problems: { ...problems, ...(keyRefused ? { sms: "MSG91 does not accept the key." } : {}) } };
  return withSms(checked.problems);
};
