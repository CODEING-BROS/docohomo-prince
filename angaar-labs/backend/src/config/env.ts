import "dotenv/config";
import { z } from "zod";

const blankable = z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().optional());

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  LEGACY_DATABASE_URL: z.string().optional(),
  // The old site's MongoDB address. Only read, never written. With it filled in, the owner can bring
  // the old site's current data in from Admin → Import from old site (before launch only).
  LEGACY_MONGODB_URI: blankable,
  PORT: z.coerce.number().default(4000),
  FRONTEND_URL: z.string().default("http://localhost:3000"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  // Text messages (MSG91) and email (an SMTP account: Brevo, or Gmail with an app password) for sign-in codes.
  // Leave them empty to send nothing.
  MSG91_AUTH_KEY: blankable,
  MSG91_TEMPLATE_ID: blankable,
  SMTP_HOST: z.string().default("smtp.gmail.com"),
  SMTP_PORT: z.coerce.number().default(465),
  SMTP_USER: blankable,
  SMTP_PASS: blankable,
  MAIL_FROM: blankable, // e.g. DocHomoeo <care@dochomoeo.com>; needed with a mail service such as Brevo, where the login is not an address
  // WhatsApp Cloud API (Meta): the permanent access token and the id of the WhatsApp business number.
  WHATSAPP_TOKEN: blankable,
  WHATSAPP_PHONE_NUMBER_ID: blankable,
  // PhonePe payment gateway. With the merchant id and key filled in, customers pay on PhonePe's page.
  PHONEPE_MERCHANT_ID: blankable,
  PHONEPE_SALT_KEY: blankable,
  PHONEPE_SALT_INDEX: z.coerce.number().int().default(1),
  PHONEPE_ENV: z.enum(["production", "sandbox"]).default("production"),
  PHONEPE_BASE_URL: blankable, // only for trying the flow against a stand-in server
  // Shiprocket: the email and password of a Shiprocket API user (Settings → API in the Shiprocket panel).
  SHIPROCKET_EMAIL: blankable,
  SHIPROCKET_PASSWORD: blankable,
  SHIPROCKET_BASE_URL: blankable, // only for trying the flow against a stand-in server
  // A secret word Shiprocket sends with tracking updates (set the same in Shiprocket → Settings → Webhooks).
  SHIPROCKET_WEBHOOK_TOKEN: blankable,
  // This server's public address, once it has one: PhonePe posts payment results to it.
  PUBLIC_API_URL: blankable,
  // Test mode: this fixed code signs anyone in and nothing is sent. Leave empty in production.
  OTP_DEV_CODE: z.preprocess((v) => (v === "" ? undefined : v), z.string().regex(/^\d{4,6}$/).optional()),
  // Used only while the PhonePe keys above are empty: online payments are recorded as paid without taking money.
  // Never true in production.
  PAYMENTS_TEST_MODE: z.preprocess((v) => v === "true" || v === true, z.boolean()).default(false),
  // On a development computer: orders go to a pretend courier (nothing is booked at Shiprocket, nothing costs money)
  // and it "delivers" by itself after a few minutes. Never true in production.
  SHIPPING_TEST_MODE: z.preprocess((v) => v === "true" || v === true, z.boolean()).default(false),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export const env = schema.parse(process.env);
export const isProduction = env.NODE_ENV === "production";
