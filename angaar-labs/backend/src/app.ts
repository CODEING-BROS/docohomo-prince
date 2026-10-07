import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env";
import { optionalSession, requireDoctor, requireSignedIn, requireStaff } from "./middleware/auth";
import { errorHandler, notFoundHandler } from "./middleware/error";
import { authRoutes } from "./modules/auth.routes";
import { b2bRoutes } from "./modules/b2b.routes";
import { blogRoutes } from "./modules/blog.routes";
import { bulkRoutes } from "./modules/bulk.routes";
import { careRoutes, patientRoutes } from "./modules/care.routes";
import { adminFileRoutes, doctorFileRoutes, patientFileRoutes } from "./modules/consultation-files.routes";
import { brandRoutes, categoryRoutes } from "./modules/catalog.routes";
import { appointmentAdminRoutes, payoutRoutes, prescriptionAdminRoutes } from "./modules/consult-admin.routes";
import { customerRoutes } from "./modules/customers.routes";
import { dashboardRoutes } from "./modules/dashboard.routes";
import { dataImportRoutes } from "./modules/data-import.routes";
import { discountRoutes } from "./modules/discounts.routes";
import { doctorAdminRoutes } from "./modules/doctor-admin.routes";
import { doctorPanelRoutes } from "./modules/doctor-panel.routes";
import { doctorRegisterRoutes } from "./modules/doctor-register.routes";
import { doctorRoutes } from "./modules/doctors.routes";
import { otpAuthRoutes } from "./modules/otp-auth.routes";
import { orderCreateRoutes } from "./modules/order-create.routes";
import { notificationRoutes } from "./modules/notifications.routes";
import { messageRoutes } from "./modules/messages.routes";
import { payoutAutoRoutes, tierAutoRoutes } from "./modules/doctor-auto.routes";
import { doctorOnboardingRoutes, doctorReviewRoutes, doctorTierRoutes, streamRoutes } from "./modules/onboarding-admin.routes";
import { bannerRoutes, enquiryRoutes, inventoryRoutes } from "./modules/operations.routes";
import { orderRoutes } from "./modules/orders.routes";
import { b2bFormRoutes, customerFormRoutes } from "./modules/people-form.routes";
import { productFormRoutes } from "./modules/product-form.routes";
import { productImportRoutes } from "./modules/product-import.routes";
import { productRoutes } from "./modules/products.routes";
import { reportRoutes } from "./modules/reports.routes";
import { couponRoutes, paymentRoutes, shippingRoutes } from "./modules/sales-settings.routes";
import { payRoutes } from "./modules/pay.routes";
import { invoiceRoutes } from "./modules/invoice.routes";
import { patientPanelRoutes } from "./modules/patient-panel.routes";
import { requirePermission } from "./lib/permissions";
import { staffRoutes } from "./modules/staff.routes";
import { reportEmailRoutes } from "./modules/report-email.routes";
import { returnMeRoutes, returnRoutes } from "./modules/returns.routes";
import { refundRoutes } from "./modules/refunds.routes";
import { shipWebhookRoutes, shiprocketRoutes } from "./modules/shiprocket.routes";
import { shopMeRoutes, shopRoutes } from "./modules/shop.routes";
import { UPLOAD_DIR, uploadRoutes } from "./modules/uploads.routes";

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// certificates and ID proofs are for staff only
app.use("/uploads/documents", cookieParser(), requireStaff);
// uploaded images; file names are random, so they can be cached for a long time
app.use("/uploads", express.static(UPLOAD_DIR, { maxAge: "30d", immutable: true, index: false }));
app.use("/api/auth", authRoutes);
app.use("/api/auth", otpAuthRoutes); // patients and doctors sign in with a one-time code

// the payment gateway sends people and messages back here
app.use("/api/pay", payRoutes);
app.use("/api/ship", shipWebhookRoutes); // the courier's tracking updates

// the shop
app.use("/api/shop", optionalSession, shopRoutes); // open to everyone; doctors with a wholesale account see their prices
app.use("/api/me", requireSignedIn, shopMeRoutes); // checkout, one order, saved addresses

// consultations
app.use("/api/care", careRoutes); // public: doctors and their free slots
app.use("/api/me", requireSignedIn, doctorRegisterRoutes); // a doctor registering themselves
app.use("/api/me", requireSignedIn, returnMeRoutes); // asking to return items from one's own order
app.use("/api/me", requireSignedIn, patientPanelRoutes); // the patient dashboard's overview and saved addresses
app.use("/api/me", requireSignedIn, patientRoutes); // a patient's own appointments, prescriptions, orders
app.use("/api/me", requireSignedIn, patientFileRoutes); // reports and photos added while booking (private files)
app.use("/api/doctor", requireDoctor, doctorPanelRoutes); // a doctor's own area
app.use("/api/doctor", requireDoctor, doctorFileRoutes); // the files of the doctor's own appointments

// everything under /api/admin needs a signed-in staff member
app.use("/api/admin", requireStaff);
app.use("/api/admin", requirePermission); // each staff role says which areas its holders may see and change
app.use("/api/admin/data-import", dataImportRoutes); // owner only: bring the old site's data in, before launch
app.use("/api/admin/staff", staffRoutes); // who can sign in to the panel, and the roles
app.use("/api/admin", bulkRoutes); // export + bulk delete, before the per-table routers
app.use("/api/admin/uploads", uploadRoutes);
app.use("/api/admin/dashboard", dashboardRoutes);
app.use("/api/admin/reports/email", reportEmailRoutes); // the summary sent by email
app.use("/api/admin/reports", reportRoutes);
app.use("/api/admin/notifications", notificationRoutes);
app.use("/api/admin/messages", messageRoutes); // automatic emails, SMS and WhatsApp
app.use("/api/admin/shiprocket", shiprocketRoutes); // courier bookings and tracking
app.use("/api/admin/invoices", invoiceRoutes); // GST invoices
app.use("/api/admin/returns", returnRoutes); // items coming back from customers
app.use("/api/admin/refunds", refundRoutes); // money sent back to customers
app.use("/api/admin/products", productRoutes);
app.use("/api/admin/products", productFormRoutes); // create and edit
app.use("/api/admin/product-import", productImportRoutes); // bulk upload from a spreadsheet
app.use("/api/admin/orders", orderCreateRoutes); // new order: search, quote, create (before /:id)
app.use("/api/admin/orders", orderRoutes);
app.use("/api/admin/discounts", discountRoutes);
app.use("/api/admin/customers", customerRoutes);
app.use("/api/admin/customers", customerFormRoutes); // add by hand
app.use("/api/admin/doctors", doctorRoutes);
app.use("/api/admin/doctors", doctorAdminRoutes); // register, edit, documents, working hours
app.use("/api/admin/doctors", doctorOnboardingRoutes); // /:id/onboarding: the four steps, level, test
app.use("/api/admin/streams", streamRoutes); // consulting streams and their test questions
app.use("/api/admin/doctor-tiers", tierAutoRoutes); // check promotions now
app.use("/api/admin/doctor-tiers", doctorTierRoutes); // Bronze, Silver, Gold
app.use("/api/admin/doctor-reviews", doctorReviewRoutes);
app.use("/api/admin/appointments", adminFileRoutes); // before the appointment routes, so /files/:id is not read as an appointment id
app.use("/api/admin/appointments", appointmentAdminRoutes);
app.use("/api/admin/prescriptions", prescriptionAdminRoutes);
app.use("/api/admin/payouts", payoutAutoRoutes); // payout day, bank sheet, pay many at once
app.use("/api/admin/payouts", payoutRoutes); // what doctors are owed for consultations
app.use("/api/admin/b2b", b2bRoutes);
app.use("/api/admin/b2b", b2bFormRoutes); // add by hand
app.use("/api/admin/brands", brandRoutes);
app.use("/api/admin/categories", categoryRoutes);
app.use("/api/admin/coupons", couponRoutes);
app.use("/api/admin/shipping", shippingRoutes);
app.use("/api/admin/payments", paymentRoutes);
app.use("/api/admin/inventory", inventoryRoutes);
app.use("/api/admin/enquiries", enquiryRoutes);
app.use("/api/admin/banners", bannerRoutes);
app.use("/api/admin/blog", blogRoutes); // posts and their categories

app.use(notFoundHandler);
app.use(errorHandler);
