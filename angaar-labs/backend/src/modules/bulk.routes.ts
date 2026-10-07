import { Router } from "express";
import { z } from "zod";
import { type Column, EXPORT_LIMIT, idsBody, idsQuery, sendCsv, stamp } from "../lib/bulk";
import { num, numOrNull, optionalString } from "../lib/http";
import { prisma } from "../lib/prisma";
import { zoneParam } from "../lib/time";
import { b2bFilters, b2bWhere } from "./b2b.routes";
import { customerFilters, customerWhere } from "./customers.routes";
import { doctorFilters, doctorWhere } from "./doctors.routes";
import { orderFilters, orderWhere } from "./orders.routes";
import { productFilters, productWhere } from "./products.routes";

// Export and bulk delete for every admin table.
//   GET  /api/admin/<table>/export        the rows the current filters match, or only ?ids=1,2,3
//   POST /api/admin/<table>/bulk-delete   { ids: [...] }
// Mounted before the per-table routers so "/export" is not read as an id.
export const bulkRoutes = Router();

const NOT_A_SALE = ["CANCELLED", "UNDELIVERED", "RETURNED", "REFUNDED"] as const;
const name = (first: string | null, last: string | null) => [first, last].filter(Boolean).join(" ");

/** Records who deleted what. */
const logDelete = (actorId: number, entity: string, ids: number[]) =>
  prisma.auditLog.create({ data: { actorId, action: `${entity.toLowerCase()}.bulk-delete`, entity, changes: { ids } } });

const result = (deleted: number, skipped: number, reason?: string) => ({ deleted, skipped, reason: skipped ? reason : undefined });

// ─────────────────────────────────────────────── orders

bulkRoutes.get("/orders/export", async (req, res) => {
  const filters = orderFilters.extend({ ids: idsQuery }).parse(req.query);
  const rows = await prisma.order.findMany({
    where: filters.ids ? { id: { in: filters.ids } } : orderWhere(filters).where,
    orderBy: { placedAt: "desc" },
    take: EXPORT_LIMIT,
    include: { _count: { select: { items: true } } },
  });
  const columns: Column<(typeof rows)[number]>[] = [
    { header: "Order number", value: (o) => o.orderNumber },
    { header: `Placed (${filters.tz})`, value: (o) => stamp(o.placedAt, filters.tz) },
    { header: "Type", value: (o) => o.channel },
    { header: "Status", value: (o) => o.status },
    { header: "Payment method", value: (o) => o.paymentMethod },
    { header: "Payment status", value: (o) => o.paymentStatus },
    { header: "Customer", value: (o) => o.customerName },
    { header: "Phone", value: (o) => o.customerPhone },
    { header: "Email", value: (o) => o.customerEmail },
    { header: "Address", value: (o) => o.shippingAddress },
    { header: "City", value: (o) => o.shippingCity },
    { header: "State", value: (o) => o.shippingState },
    { header: "Pincode", value: (o) => o.shippingPincode },
    { header: "Items", value: (o) => o._count.items },
    { header: "Items total", value: (o) => num(o.subtotal) },
    { header: "Delivery", value: (o) => num(o.shippingCharge) },
    { header: "Order total", value: (o) => num(o.grandTotal) },
  ];
  sendCsv(res, "orders", columns, rows);
});

bulkRoutes.post("/orders/bulk-delete", async (req, res) => {
  const { ids } = idsBody.parse(req.body);
  const deleted = await prisma.order.deleteMany({ where: { id: { in: ids } } });
  await logDelete(req.user!.id, "Order", ids);
  res.json(result(deleted.count, ids.length - deleted.count));
});

// ─────────────────────────────────────────────── products (one export row per variant)

bulkRoutes.get("/products/export", async (req, res) => {
  const filters = productFilters.extend({ ids: idsQuery }).parse(req.query);
  const products = await prisma.product.findMany({
    where: filters.ids ? { id: { in: filters.ids } } : await productWhere(filters),
    orderBy: { name: "asc" },
    take: EXPORT_LIMIT,
    include: {
      brand: { select: { name: true } },
      category: { select: { name: true, parent: { select: { name: true } } } },
      variants: { orderBy: { sortOrder: "asc" } },
    },
  });
  const rows = products.flatMap((product) => product.variants.map((variant) => ({ product, variant })));
  const columns: Column<(typeof rows)[number]>[] = [
    { header: "Product", value: (r) => r.product.name },
    { header: "Brand", value: (r) => r.product.brand?.name },
    { header: "Parent category", value: (r) => r.product.category?.parent?.name },
    { header: "Category", value: (r) => r.product.category?.name },
    { header: "Form", value: (r) => r.product.form },
    { header: "Variant", value: (r) => r.variant.title },
    { header: "Pack size", value: (r) => r.variant.packSize },
    { header: "Potency", value: (r) => r.variant.potency },
    { header: "SKU", value: (r) => r.variant.sku },
    { header: "MRP", value: (r) => num(r.variant.mrp) },
    { header: "Selling price", value: (r) => num(r.variant.sellingPrice) },
    { header: "B2B price", value: (r) => numOrNull(r.variant.b2bPrice) },
    { header: "Stock", value: (r) => r.variant.stockQuantity },
    { header: "Status", value: (r) => r.product.status },
  ];
  sendCsv(res, "products", columns, rows);
});

bulkRoutes.post("/products/bulk-delete", async (req, res) => {
  const { ids } = idsBody.parse(req.body);
  // past orders keep their own copy of the product name and price, so they are not affected
  const deleted = await prisma.product.deleteMany({ where: { id: { in: ids } } });
  await logDelete(req.user!.id, "Product", ids);
  res.json(result(deleted.count, ids.length - deleted.count));
});

// ─────────────────────────────────────────────── customers

bulkRoutes.get("/customers/export", async (req, res) => {
  const filters = customerFilters.extend({ ids: idsQuery, tz: zoneParam }).parse(req.query);
  const users = await prisma.user.findMany({
    where: filters.ids ? { id: { in: filters.ids }, role: "CUSTOMER" } : customerWhere(filters),
    orderBy: { createdAt: "desc" },
    take: EXPORT_LIMIT,
    include: { addresses: { where: { isDefault: true }, take: 1 } },
  });
  const spend = await prisma.order.groupBy({
    by: ["userId"],
    where: { userId: { in: users.map((u) => u.id) }, status: { notIn: [...NOT_A_SALE] } },
    _count: true,
    _sum: { grandTotal: true },
  });
  const spendByUser = new Map(spend.map((s) => [s.userId, s]));
  const columns: Column<(typeof users)[number]>[] = [
    { header: "Name", value: (u) => name(u.firstName, u.lastName) },
    { header: "Phone", value: (u) => u.phone },
    { header: "Email", value: (u) => u.email },
    { header: "Address", value: (u) => u.addresses[0]?.line1 },
    { header: "City", value: (u) => u.addresses[0]?.city },
    { header: "State", value: (u) => u.addresses[0]?.state },
    { header: "Pincode", value: (u) => u.addresses[0]?.pincode },
    { header: "Phone verified", value: (u) => (u.phoneVerifiedAt ? "Yes" : "No") },
    { header: `Joined (${filters.tz})`, value: (u) => stamp(u.createdAt, filters.tz) },
    { header: "Orders", value: (u) => spendByUser.get(u.id)?._count ?? 0 },
    { header: "Total spent", value: (u) => num(spendByUser.get(u.id)?._sum.grandTotal) },
  ];
  sendCsv(res, "customers", columns, users);
});

bulkRoutes.post("/customers/bulk-delete", async (req, res) => {
  const { ids } = idsBody.parse(req.body);
  // consultation history must stay attached to a patient, so those accounts are kept
  const deletable = await prisma.user.findMany({
    where: { id: { in: ids }, role: "CUSTOMER", appointments: { none: {} }, prescriptions: { none: {} } },
    select: { id: true },
  });
  const deleted = await prisma.user.deleteMany({ where: { id: { in: deletable.map((u) => u.id) } } });
  await logDelete(req.user!.id, "User", deletable.map((u) => u.id));
  res.json(result(deleted.count, ids.length - deleted.count, "Customers with consultations or prescriptions were kept."));
});

// ─────────────────────────────────────────────── doctors

bulkRoutes.get("/doctors/export", async (req, res) => {
  const filters = doctorFilters.extend({ ids: idsQuery, tz: zoneParam }).parse(req.query);
  const doctors = await prisma.doctorProfile.findMany({
    where: filters.ids ? { id: { in: filters.ids } } : doctorWhere(filters).where,
    orderBy: { createdAt: "desc" },
    take: EXPORT_LIMIT,
    include: { user: { select: { phone: true, email: true } } },
  });
  const columns: Column<(typeof doctors)[number]>[] = [
    { header: "Name", value: (d) => d.displayName },
    { header: "Qualification", value: (d) => d.qualification },
    { header: "Specialization", value: (d) => d.specialization },
    { header: "Experience (years)", value: (d) => numOrNull(d.experienceYears) },
    { header: "Languages", value: (d) => d.languages.join(", ") },
    { header: "Registration number", value: (d) => d.registrationNumber },
    { header: "Phone", value: (d) => d.user.phone },
    { header: "Email", value: (d) => d.user.email },
    { header: "Video fee", value: (d) => numOrNull(d.videoFee) },
    { header: "Call fee", value: (d) => numOrNull(d.audioFee) },
    { header: "Verification", value: (d) => d.verificationStatus },
    { header: "Accepting consultations", value: (d) => (d.acceptsConsultations ? "Yes" : "No") },
    { header: `Added (${filters.tz})`, value: (d) => stamp(d.createdAt, filters.tz) },
  ];
  sendCsv(res, "doctors", columns, doctors);
});

bulkRoutes.post("/doctors/bulk-delete", async (req, res) => {
  const { ids } = idsBody.parse(req.body);
  // a doctor who has seen patients keeps their record; suspend them instead
  const deletable = await prisma.doctorProfile.findMany({
    where: { id: { in: ids }, appointments: { none: {} }, prescriptions: { none: {} } },
    select: { id: true, userId: true },
  });
  const deleted = await prisma.user.deleteMany({ where: { id: { in: deletable.map((d) => d.userId) }, role: "DOCTOR" } });
  await logDelete(req.user!.id, "DoctorProfile", deletable.map((d) => d.id));
  res.json(result(deleted.count, ids.length - deleted.count, "Doctors with appointments or prescriptions were kept. Suspend them instead."));
});

// ─────────────────────────────────────────────── B2B customers

bulkRoutes.get("/b2b/export", async (req, res) => {
  const filters = b2bFilters.extend({ ids: idsQuery, tz: zoneParam }).parse(req.query);
  const accounts = await prisma.b2BAccount.findMany({
    where: filters.ids ? { id: { in: filters.ids } } : b2bWhere(filters).where,
    orderBy: { createdAt: "desc" },
    take: EXPORT_LIMIT,
    include: { priceTier: { select: { name: true } }, user: { select: { firstName: true, lastName: true, phone: true, email: true } } },
  });
  const columns: Column<(typeof accounts)[number]>[] = [
    { header: "Doctor", value: (a) => a.contactName ?? name(a.user.firstName, a.user.lastName) },
    { header: "Clinic / practice", value: (a) => a.businessName },
    { header: "Registration number", value: (a) => a.registrationNumber },
    { header: "GST number", value: (a) => a.gstNumber },
    { header: "Phone", value: (a) => a.contactPhone ?? a.user.phone },
    { header: "Email", value: (a) => a.contactEmail ?? a.user.email },
    { header: "City", value: (a) => a.city },
    { header: "State", value: (a) => a.state },
    { header: "Price tier", value: (a) => a.priceTier?.name },
    { header: "Status", value: (a) => a.status },
    { header: `Applied (${filters.tz})`, value: (a) => stamp(a.createdAt, filters.tz) },
    { header: `Approved (${filters.tz})`, value: (a) => stamp(a.approvedAt, filters.tz) },
  ];
  sendCsv(res, "b2b-customers", columns, accounts);
});

bulkRoutes.post("/b2b/bulk-delete", async (req, res) => {
  const { ids } = idsBody.parse(req.body);
  const deleted = await prisma.b2BAccount.deleteMany({ where: { id: { in: ids } } });
  await logDelete(req.user!.id, "B2BAccount", ids);
  res.json(result(deleted.count, ids.length - deleted.count));
});

// ─────────────────────────────────────────────── brands

bulkRoutes.get("/brands/export", async (req, res) => {
  const filters = z.object({ q: optionalString, ids: idsQuery }).parse(req.query);
  const brands = await prisma.brand.findMany({
    where: filters.ids ? { id: { in: filters.ids } } : filters.q ? { name: { contains: filters.q, mode: "insensitive" } } : undefined,
    orderBy: { name: "asc" },
    include: { _count: { select: { products: true } } },
  });
  const columns: Column<(typeof brands)[number]>[] = [
    { header: "Brand", value: (b) => b.name },
    { header: "Web address", value: (b) => b.slug },
    { header: "Products", value: (b) => b._count.products },
    { header: "Active", value: (b) => (b.isActive ? "Yes" : "No") },
    { header: "Logo", value: (b) => b.logoUrl },
  ];
  sendCsv(res, "brands", columns, brands);
});

bulkRoutes.post("/brands/bulk-delete", async (req, res) => {
  const { ids } = idsBody.parse(req.body);
  const deletable = await prisma.brand.findMany({ where: { id: { in: ids }, products: { none: {} } }, select: { id: true } });
  const deleted = await prisma.brand.deleteMany({ where: { id: { in: deletable.map((b) => b.id) } } });
  await logDelete(req.user!.id, "Brand", deletable.map((b) => b.id));
  res.json(result(deleted.count, ids.length - deleted.count, "Brands that still have products were kept."));
});

// ─────────────────────────────────────────────── categories

bulkRoutes.get("/categories/export", async (req, res) => {
  const { ids } = z.object({ ids: idsQuery }).parse(req.query);
  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { products: true } } },
  });
  const byId = new Map(categories.map((c) => [c.id, c]));
  const pathOf = (category: (typeof categories)[number]) => {
    const path = [category.name];
    for (let parent = category.parentId ? byId.get(category.parentId) : undefined; parent; parent = parent.parentId ? byId.get(parent.parentId) : undefined) {
      path.unshift(parent.name);
    }
    return path;
  };
  const rows = categories.filter((category) => !ids || ids.includes(category.id)).map((category) => ({ category, path: pathOf(category) })).sort((a, b) => a.path.join(" / ").localeCompare(b.path.join(" / ")));
  const columns: Column<(typeof rows)[number]>[] = [
    { header: "Main category", value: (r) => r.path[0] },
    { header: "Category", value: (r) => r.path[1] },
    { header: "Subcategory", value: (r) => r.path[2] },
    { header: "Web address", value: (r) => r.category.slug },
    { header: "Products directly in it", value: (r) => r.category._count.products },
    { header: "Shown on store", value: (r) => (r.category.isActive ? "Yes" : "No") },
    { header: "Image", value: (r) => r.category.imageUrl },
  ];
  sendCsv(res, "categories", columns, rows);
});

bulkRoutes.post("/categories/bulk-delete", async (req, res) => {
  const { ids } = idsBody.parse(req.body);
  // only empty categories go; ticking a parent together with everything inside it clears them level by level
  let deleted = 0;
  for (let pass = 0; pass < 3; pass++) {
    const empty = await prisma.category.findMany({
      where: { id: { in: ids }, products: { none: {} }, children: { none: {} } },
      select: { id: true },
    });
    if (empty.length === 0) break;
    deleted += (await prisma.category.deleteMany({ where: { id: { in: empty.map((c) => c.id) } } })).count;
  }
  await logDelete(req.user!.id, "Category", ids);
  res.json(result(deleted, ids.length - deleted, "Categories that still contain products or other categories were kept."));
});
