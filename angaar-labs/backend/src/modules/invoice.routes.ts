import { Router } from "express";
import { z } from "zod";
import { HttpError, idParam } from "../lib/http";
import { invoicePdf, issueInvoice, missingSellerDetails, saveSellerDetails, sellerAdvice, sellerDetails } from "../lib/invoice";
import { prisma } from "../lib/prisma";

// Admin → invoices. Mounted at /api/admin/invoices.
//   /settings                the business details printed on every invoice, and when invoices are made
//   /orders/:id              make the invoice for one order now
//   /orders/:id/pdf          download it
export const invoiceRoutes = Router();

invoiceRoutes.get("/settings", async (_req, res) => {
  const seller = await sellerDetails();
  const year = await prisma.invoiceCounter.findMany({ orderBy: { financialYear: "desc" }, take: 3 });
  res.json({ seller, missing: missingSellerDetails(seller), advice: sellerAdvice(seller), counters: year });
});

const optional = (max: number) => z.string().trim().max(max).default("");
const sellerInput = z.object({
  legalName: optional(160), tradeName: optional(120),
  gstin: z.string().trim().toUpperCase().regex(/^(\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z])?$/, "That GSTIN does not look right: it has 15 characters, like 09ABCDE1234F1Z5").default(""),
  pan: z.string().trim().toUpperCase().regex(/^([A-Z]{5}\d{4}[A-Z])?$/, "That PAN does not look right: it looks like ABCDE1234F").default(""),
  drugLicence: optional(120), address: optional(300), city: optional(80), state: optional(80),
  pincode: z.string().trim().regex(/^(\d{6})?$/, "A pincode has 6 digits").default(""),
  phone: optional(40), email: optional(120),
  prefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{1,6}$/, "Use 1 to 6 capital letters or numbers, like DH").default("DH"),
  issueOn: z.enum(["dispatch", "placed"]).default("placed"),
  footer: optional(500),
});

invoiceRoutes.put("/settings", async (req, res) => {
  const input = sellerInput.parse(req.body);
  // the GSTIN starts with the state's code; a mismatch is almost always a typing mistake
  const saved = await saveSellerDetails(input);
  await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "invoice.settings", entity: "Setting", entityId: "invoice.seller", changes: saved } });
  res.json({ seller: saved, missing: missingSellerDetails(saved), advice: sellerAdvice(saved) });
});

invoiceRoutes.post("/orders/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.status(201).json({ invoiceNumber: await issueInvoice(id, { strict: true }) });
});

invoiceRoutes.get("/orders/:id/pdf", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { number, pdf } = await invoicePdf(id);
  res.setHeader("content-type", "application/pdf");
  res.setHeader("content-disposition", `inline; filename="Invoice-${number.replace(/\//g, "-")}.pdf"`);
  res.send(pdf);
});

// ───────────────────────────────────────────── GST rate and HSN code on products, in bulk
// The old data had no tax details at all. Staff set them here for a whole group of products at once.

invoiceRoutes.get("/tax-summary", async (_req, res) => {
  const [total, missingRate, missingHsn, byForm, rates] = await Promise.all([
    prisma.product.count(),
    prisma.product.count({ where: { gstPercent: 0 } }),
    prisma.product.count({ where: { OR: [{ hsnCode: null }, { hsnCode: "" }] } }),
    prisma.product.groupBy({ by: ["form"], _count: true, orderBy: { _count: { form: "desc" } } }),
    prisma.product.groupBy({ by: ["gstPercent", "hsnCode"], _count: true, orderBy: { _count: { id: "desc" } }, take: 12 }),
  ]);
  res.json({
    total, missingRate, missingHsn,
    forms: byForm.map((f) => ({ form: f.form ?? "", count: f._count })),
    combinations: rates.map((r) => ({ gstPercent: Number(r.gstPercent), hsnCode: r.hsnCode ?? "", count: r._count })),
  });
});

const taxInput = z.object({
  gstPercent: z.coerce.number().refine((v) => [0, 0.1, 0.25, 1.5, 3, 5, 6, 12, 18, 28, 40].includes(v), "Choose one of the GST rates"),
  hsnCode: z.string().trim().regex(/^(\d{4}|\d{6}|\d{8})$/, "An HSN code has 4, 6 or 8 digits"),
  form: z.string().trim().max(60).optional(), // product type, e.g. Dilution; "" means products with no type
  brandId: z.number().int().positive().optional(),
  categoryId: z.number().int().positive().optional(),
  onlyMissing: z.boolean().default(true), // leave products that already have a rate alone
});

invoiceRoutes.post("/tax-bulk", async (req, res) => {
  const input = taxInput.parse(req.body);
  // a category also covers everything inside it
  let categoryIds: number[] | undefined;
  if (input.categoryId) {
    const all = await prisma.category.findMany({ select: { id: true, parentId: true } });
    categoryIds = [input.categoryId];
    for (let i = 0; i < categoryIds.length; i++) for (const c of all) if (c.parentId === categoryIds[i] && !categoryIds.includes(c.id)) categoryIds.push(c.id);
  }
  const where = {
    // products without a type are stored either empty or blank
    ...(input.form !== undefined ? (input.form === "" ? { OR: [{ form: null }, { form: "" }] } : { form: input.form }) : {}),
    ...(input.brandId ? { brandId: input.brandId } : {}),
    ...(categoryIds ? { categoryId: { in: categoryIds } } : {}),
    ...(input.onlyMissing ? { gstPercent: 0 } : {}),
  };
  if (input.form === undefined && !input.brandId && !input.categoryId && !input.onlyMissing) {
    throw new HttpError(400, "Choose a product type, brand or category, or tick 'only products without a rate'");
  }
  const { count } = await prisma.product.updateMany({ where, data: { gstPercent: input.gstPercent, hsnCode: input.hsnCode } });
  await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "product.tax-bulk", entity: "Product", entityId: "bulk", changes: { ...input, count } } });
  res.json({ updated: count });
});
