import { Router } from "express";
import { z } from "zod";
import { bulkResult, idsBody, logBulkDelete } from "../lib/bulk";
import { HttpError, idParam, notFound, num, numOrNull } from "../lib/http";
import { prisma } from "../lib/prisma";

// B2B pricing set-up: price tiers and discount rules. How they turn into a price is in lib/pricing.ts.
export const discountRoutes = Router();

const emptyToNull = (v: unknown) => (v === "" || v === undefined ? null : v);
const optionalId = z.preprocess(emptyToNull, z.coerce.number().int().positive().nullable());
const optionalDay = z.preprocess(emptyToNull, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable());

// ─────────────────────────────────────────────── price tiers

const tierInput = z.object({
  name: z.string().trim().min(2, "Give the tier a name").max(60),
  description: z.preprocess(emptyToNull, z.string().trim().max(300).nullable()).optional(),
  defaultDiscountPercent: z.coerce.number().min(0, "The discount cannot be negative").max(90, "The discount cannot be more than 90%"),
  isActive: z.boolean().optional(),
});

discountRoutes.post("/tiers", async (req, res) => {
  const input = tierInput.parse(req.body);
  if (await prisma.priceTier.findFirst({ where: { name: { equals: input.name, mode: "insensitive" } } })) {
    throw new HttpError(400, "A tier with this name already exists");
  }
  res.status(201).json(await prisma.priceTier.create({ data: input }));
});

discountRoutes.patch("/tiers/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const input = tierInput.partial().parse(req.body);
  if (!(await prisma.priceTier.findUnique({ where: { id } }))) throw notFound("Price tier");
  if (input.name && (await prisma.priceTier.findFirst({ where: { id: { not: id }, name: { equals: input.name, mode: "insensitive" } } }))) {
    throw new HttpError(400, "Another tier already has this name");
  }
  res.json(await prisma.priceTier.update({ where: { id }, data: input }));
});

discountRoutes.delete("/tiers/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const tier = await prisma.priceTier.findUnique({ where: { id }, include: { _count: { select: { accounts: true } } } });
  if (!tier) throw notFound("Price tier");
  if (tier._count.accounts > 0) throw new HttpError(400, `${tier._count.accounts} B2B customers are on this tier. Move them to another tier first.`);
  await prisma.priceTier.delete({ where: { id } });
  res.json({ ok: true });
});

// ─────────────────────────────────────────────── discount rules

const ruleInput = z
  .object({
    name: z.string().trim().min(2, "Give the rule a name").max(120),
    // who gets it: one doctor, one tier, or (both empty) every B2B customer
    b2bAccountId: optionalId,
    priceTierId: optionalId,
    // what it applies to
    scope: z.enum(["ALL", "BRAND", "CATEGORY", "PRODUCT", "VARIANT"]),
    brandId: optionalId,
    categoryId: optionalId,
    productId: optionalId,
    variantId: optionalId,
    discountType: z.enum(["PERCENT", "FLAT", "FIXED_PRICE"]),
    value: z.coerce.number().positive("Enter the discount amount").max(10_000_000),
    minQuantity: z.coerce.number().int().min(1).default(1),
    minOrderValue: z.preprocess(emptyToNull, z.coerce.number().min(0).nullable()),
    priority: z.coerce.number().int().min(0).max(1000).default(0),
    startsOn: optionalDay,
    endsOn: optionalDay,
    isActive: z.boolean().default(true),
  })
  .superRefine((rule, ctx) => {
    const need = { BRAND: "brandId", CATEGORY: "categoryId", PRODUCT: "productId", VARIANT: "variantId" } as const;
    if (rule.scope !== "ALL" && !rule[need[rule.scope]]) {
      ctx.addIssue({ code: "custom", path: [need[rule.scope]], message: `Choose the ${rule.scope.toLowerCase()} this rule is for` });
    }
    if (rule.b2bAccountId && rule.priceTierId) ctx.addIssue({ code: "custom", path: ["priceTierId"], message: "Pick either one doctor or a tier, not both" });
    if (rule.discountType === "PERCENT" && rule.value > 90) ctx.addIssue({ code: "custom", path: ["value"], message: "The discount cannot be more than 90%" });
    if (rule.discountType === "FIXED_PRICE" && rule.scope !== "VARIANT") {
      ctx.addIssue({ code: "custom", path: ["discountType"], message: "A fixed price only works for one pack of a product" });
    }
    if (rule.startsOn && rule.endsOn && rule.endsOn < rule.startsOn) ctx.addIssue({ code: "custom", path: ["endsOn"], message: "The end date is before the start date" });
  });

const dayStart = (day: string | null) => (day ? new Date(`${day}T00:00:00+05:30`) : null);
const dayEnd = (day: string | null) => (day ? new Date(`${day}T23:59:59.999+05:30`) : null);
const toDay = (date: Date | null) => (date ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(date) : null);

const toData = (input: z.infer<typeof ruleInput>) => {
  const { startsOn, endsOn, scope, ...rest } = input;
  return {
    ...rest,
    scope,
    // only the target that matches the scope is kept
    brandId: scope === "BRAND" ? rest.brandId : null,
    categoryId: scope === "CATEGORY" ? rest.categoryId : null,
    productId: scope === "PRODUCT" ? rest.productId : null,
    variantId: scope === "VARIANT" ? rest.variantId : null,
    startsAt: dayStart(startsOn),
    endsAt: dayEnd(endsOn),
  };
};

discountRoutes.get("/rules", async (_req, res) => {
  const rules = await prisma.b2BDiscountRule.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    include: {
      priceTier: { select: { id: true, name: true } },
      b2bAccount: { select: { id: true, businessName: true, contactName: true } },
      brand: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
      product: { select: { id: true, name: true } },
      variant: { select: { id: true, title: true, sku: true, product: { select: { name: true } } } },
    },
  });
  res.json({
    items: rules.map((r) => ({
      id: r.id, name: r.name, scope: r.scope, discountType: r.discountType, value: num(r.value),
      minQuantity: r.minQuantity, minOrderValue: numOrNull(r.minOrderValue), priority: r.priority, isActive: r.isActive,
      startsOn: toDay(r.startsAt), endsOn: toDay(r.endsAt),
      priceTierId: r.priceTierId, b2bAccountId: r.b2bAccountId, brandId: r.brandId, categoryId: r.categoryId, productId: r.productId, variantId: r.variantId,
      who: r.b2bAccount ? (r.b2bAccount.contactName ?? r.b2bAccount.businessName) : r.priceTier ? `${r.priceTier.name} tier` : "All B2B customers",
      whoKind: r.b2bAccount ? "DOCTOR" : r.priceTier ? "TIER" : "EVERYONE",
      target:
        r.scope === "BRAND" ? r.brand?.name
        : r.scope === "CATEGORY" ? r.category?.name
        : r.scope === "PRODUCT" ? r.product?.name
        : r.scope === "VARIANT" ? (r.variant ? `${r.variant.product.name} · ${r.variant.title}` : null)
        : "All products",
    })),
  });
});

discountRoutes.post("/rules", async (req, res) => {
  const rule = await prisma.b2BDiscountRule.create({ data: toData(ruleInput.parse(req.body)) });
  await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "discount.create", entity: "B2BDiscountRule", entityId: String(rule.id) } });
  res.status(201).json({ id: rule.id });
});

discountRoutes.patch("/rules/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  if (!(await prisma.b2BDiscountRule.findUnique({ where: { id }, select: { id: true } }))) throw notFound("Discount rule");
  await prisma.b2BDiscountRule.update({ where: { id }, data: toData(ruleInput.parse(req.body)) });
  await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "discount.update", entity: "B2BDiscountRule", entityId: String(id) } });
  res.json({ id });
});

discountRoutes.post("/rules/bulk-delete", async (req, res) => {
  const { ids } = idsBody.parse(req.body);
  const deleted = await prisma.b2BDiscountRule.deleteMany({ where: { id: { in: ids } } });
  await logBulkDelete(req.user!.id, "B2BDiscountRule", ids);
  res.json(bulkResult(deleted.count, ids.length - deleted.count));
});

discountRoutes.delete("/rules/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  if (!(await prisma.b2BDiscountRule.findUnique({ where: { id }, select: { id: true } }))) throw notFound("Discount rule");
  await prisma.b2BDiscountRule.delete({ where: { id } });
  res.json({ ok: true });
});
