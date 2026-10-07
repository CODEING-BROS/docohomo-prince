import type { B2BDiscountRule, DiscountScope } from "../generated/prisma/client";
import { HttpError, num } from "./http";
import { prisma } from "./prisma";

// What a B2B customer (a doctor buying wholesale) pays for each pack.
//
// For every line, the first of these that applies sets the price:
//   1. a rule made for this doctor alone
//   2. the fixed B2B price typed on the product variant
//   3. a rule for the doctor's price tier, or for all B2B customers
//      (the most specific one: variant > product > category > brand > everything;
//       then the highest priority, then the biggest quantity slab reached)
//   4. the price tier's standard percentage off
// The result is never higher than the retail selling price.

export type CartLine = { variantId: number; quantity: number };

const SCOPE_RANK: Record<DiscountScope, number> = { VARIANT: 4, PRODUCT: 3, CATEGORY: 2, BRAND: 1, ALL: 0 };
const round = (value: number) => Math.round(value * 100) / 100;

const apply = (rule: B2BDiscountRule, sellingPrice: number) => {
  const value = num(rule.value);
  if (rule.discountType === "PERCENT") return sellingPrice * (1 - value / 100);
  if (rule.discountType === "FLAT") return sellingPrice - value;
  return value; // FIXED_PRICE
};

const describe = (rule: B2BDiscountRule) => {
  const value = num(rule.value);
  const amount = rule.discountType === "PERCENT" ? `${value}% off` : rule.discountType === "FLAT" ? `₹${value} off each` : `₹${value} each`;
  return `${rule.name} (${amount})`;
};

/**
 * `each` prices every line as if it were the only one in the cart. Listing pages use it, where the
 * lines are unrelated products and must not add up towards a "minimum order value" rule.
 */
export const priceB2BCart = async (accountId: number, lines: CartLine[], options: { each?: boolean } = {}) => {
  const account = await prisma.b2BAccount.findUnique({ where: { id: accountId }, include: { priceTier: true } });
  if (!account) throw new HttpError(400, "That B2B customer does not exist");

  const variants = await prisma.productVariant.findMany({
    where: { id: { in: lines.map((l) => l.variantId) } },
    include: {
      product: {
        select: {
          id: true, name: true, brandId: true, categoryId: true, gstPercent: true, status: true,
          brand: { select: { name: true } },
          images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
        },
      },
    },
  });
  const variantById = new Map(variants.map((v) => [v.id, v]));
  for (const line of lines) if (!variantById.has(line.variantId)) throw new HttpError(400, "One of the products no longer exists");

  // a category rule also covers everything inside that category
  const categories = await prisma.category.findMany({ select: { id: true, parentId: true } });
  const parentOf = new Map(categories.map((c) => [c.id, c.parentId]));
  const withAncestors = (categoryId: number | null) => {
    const ids: number[] = [];
    for (let id = categoryId; id !== null && id !== undefined; id = parentOf.get(id) ?? null) ids.push(id);
    return ids;
  };

  const now = new Date();
  const rules = await prisma.b2BDiscountRule.findMany({
    where: {
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        { OR: [{ b2bAccountId: accountId }, { b2bAccountId: null, priceTierId: account.priceTierId }, { b2bAccountId: null, priceTierId: null }] },
      ],
    },
  });

  const retailTotal = lines.reduce((sum, l) => sum + num(variantById.get(l.variantId)!.sellingPrice) * l.quantity, 0);
  const tierPercent = account.priceTier ? num(account.priceTier.defaultDiscountPercent) : 0;

  const priced = lines.map((line) => {
    const variant = variantById.get(line.variantId)!;
    const sellingPrice = num(variant.sellingPrice);
    const categoryIds = withAncestors(variant.product.categoryId);
    const orderValue = options.each ? sellingPrice * line.quantity : retailTotal;

    const matching = rules
      .filter((rule) => {
        if (line.quantity < rule.minQuantity) return false;
        if (rule.minOrderValue !== null && orderValue < num(rule.minOrderValue)) return false;
        if (rule.scope === "VARIANT") return rule.variantId === variant.id;
        if (rule.scope === "PRODUCT") return rule.productId === variant.productId;
        if (rule.scope === "CATEGORY") return rule.categoryId !== null && categoryIds.includes(rule.categoryId);
        if (rule.scope === "BRAND") return rule.brandId !== null && rule.brandId === variant.product.brandId;
        return true;
      })
      .sort((a, b) =>
        SCOPE_RANK[b.scope] - SCOPE_RANK[a.scope] || b.priority - a.priority || b.minQuantity - a.minQuantity ||
        num(b.minOrderValue) - num(a.minOrderValue));

    const ownRule = matching.find((rule) => rule.b2bAccountId === accountId);
    const sharedRule = matching.find((rule) => rule.b2bAccountId === null);

    let unitPrice = sellingPrice;
    let source = "Retail price";
    if (ownRule) {
      unitPrice = apply(ownRule, sellingPrice);
      source = `Special for this doctor: ${describe(ownRule)}`;
    } else if (variant.b2bPrice !== null) {
      unitPrice = num(variant.b2bPrice);
      source = "B2B price set on the product";
    } else if (sharedRule) {
      unitPrice = apply(sharedRule, sellingPrice);
      source = describe(sharedRule);
    } else if (tierPercent > 0) {
      unitPrice = sellingPrice * (1 - tierPercent / 100);
      source = `${account.priceTier!.name} tier (${tierPercent}% off)`;
    }
    unitPrice = round(Math.min(sellingPrice, Math.max(0, unitPrice)));

    return {
      variantId: variant.id,
      productId: variant.productId,
      productName: variant.product.name,
      variantTitle: variant.title,
      sku: variant.sku,
      brandName: variant.product.brand?.name ?? null,
      imageUrl: variant.product.images[0]?.url ?? null,
      gstPercent: num(variant.product.gstPercent),
      quantity: line.quantity,
      mrp: num(variant.mrp),
      retailPrice: sellingPrice,
      unitPrice,
      lineTotal: round(unitPrice * line.quantity),
      source,
      stock: variant.stockQuantity,
      minimumQuantity: variant.b2bMinQuantity,
      // why this line cannot be ordered as it stands, if anything
      problem:
        variant.product.status !== "ACTIVE" || !variant.isActive ? "This product is not on sale"
        : line.quantity < variant.b2bMinQuantity ? `Minimum wholesale quantity is ${variant.b2bMinQuantity}`
        : line.quantity > variant.stockQuantity ? `Only ${variant.stockQuantity} in stock`
        : null,
    };
  });

  const subtotal = round(priced.reduce((sum, l) => sum + l.lineTotal, 0));
  return {
    account: {
      id: account.id, businessName: account.businessName, contactName: account.contactName, status: account.status,
      tier: account.priceTier ? { name: account.priceTier.name, discountPercent: tierPercent } : null,
      creditLimit: num(account.creditLimit), creditDays: account.creditDays,
    },
    lines: priced,
    retailTotal: round(retailTotal),
    subtotal,
    savings: round(retailTotal - subtotal),
  };
};

/** Delivery charge for an order value on a channel, from the shipping rules. */
export const shippingFor = async (channel: "D2C" | "B2B", orderValue: number) => {
  const rules = await prisma.shippingRule.findMany({
    where: { isActive: true, OR: [{ channel: null }, { channel }] },
    orderBy: { minOrderValue: "desc" },
  });
  const rule = rules.find((r) => orderValue >= num(r.minOrderValue) && (r.maxOrderValue === null || orderValue < num(r.maxOrderValue)));
  // the smallest order value that would be delivered free, when that is more than this order
  const freeFrom = rules.filter((r) => num(r.charge) === 0 && num(r.minOrderValue) > orderValue).map((r) => num(r.minOrderValue)).sort((a, b) => a - b)[0] ?? null;
  return {
    charge: rule ? num(rule.charge) : 0, ruleName: rule?.name ?? null,
    codAvailable: rule ? rule.codAvailable : true, codCharge: rule ? num(rule.codCharge) : 0, freeFrom,
  };
};
