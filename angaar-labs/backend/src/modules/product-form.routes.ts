import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "../generated/prisma/client";
import { HttpError, idParam, notFound } from "../lib/http";
import { prisma } from "../lib/prisma";
import { htmlToText } from "../lib/text";

// Creating and editing a product together with its variants and images.
// Mounted at /api/admin/products next to the list and detail routes.
export const productFormRoutes = Router();

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const text = (max: number) =>
  z.preprocess((v) => emptyToNull(typeof v === "string" ? htmlToText(v) : v), z.string().trim().max(max).nullable().optional());
const money = z.coerce.number().min(0).max(10_000_000);
const optionalMoney = z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), money.nullable());
const optionalCount = z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), z.coerce.number().int().min(1).nullable());
const imageAddress = z.union([z.url(), z.string().regex(/^\/uploads\/[\w./-]+$/)], "Each image must be an upload or a full link");

const variantInput = z
  .object({
    id: z.number().int().positive().optional(), // present when editing an existing variant
    title: z.string().trim().min(1, "Every variant needs a name, like 30 ml").max(120),
    packSize: text(40),
    potency: text(40),
    sku: text(60), // left empty, one is generated
    barcode: text(60),
    mrp: money,
    sellingPrice: money,
    b2bPrice: optionalMoney,
    costPrice: optionalMoney,
    stockQuantity: z.coerce.number().int().min(0).default(0),
    lowStockThreshold: z.coerce.number().int().min(0).default(5),
    minOrderQuantity: z.coerce.number().int().min(1).default(1),
    maxOrderQuantity: optionalCount,
    b2bMinQuantity: z.coerce.number().int().min(1).default(1),
    isDefault: z.boolean().default(false),
    isActive: z.boolean().default(true),
  })
  .refine((v) => v.sellingPrice <= v.mrp, { message: "The selling price cannot be higher than the MRP", path: ["sellingPrice"] })
  .refine((v) => v.b2bPrice === null || v.b2bPrice <= v.mrp, { message: "The B2B price cannot be higher than the MRP", path: ["b2bPrice"] });

const productInput = z.object({
  name: z.string().trim().min(2, "Give the product a name").max(300),
  brandId: z.number().int().positive().nullable().optional(),
  categoryId: z.number().int().positive().nullable().optional(),
  form: text(60),
  shortDescription: text(1000),
  description: text(50_000),
  composition: text(5000),
  indications: text(5000),
  directions: text(5000),
  safetyInfo: text(5000),
  manufacturer: text(300),
  countryOfOrigin: text(80),
  hsnCode: text(20),
  gstPercent: z.coerce.number().min(0).max(40).default(0),
  requiresPrescription: z.boolean().default(false),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).default("ACTIVE"),
  isFeatured: z.boolean().default(false),
  isNewArrival: z.boolean().default(false),
  isTrending: z.boolean().default(false),
  seoTitle: text(200),
  seoDescription: text(500),
  // the last part of the product's web address; left out, it is made from the name
  slug: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "The web address can only have small letters, numbers and dashes").max(200).optional()),
  images: z.array(imageAddress).max(12).default([]),
  variants: z.array(variantInput).min(1, "Add at least one variant").max(50),
});

type ProductInput = z.infer<typeof productInput>;
type Tx = Prisma.TransactionClient;

const slugify = (value: string) =>
  value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 110) || "product";

const freeSlug = async (name: string, exceptId?: number) => {
  const base = slugify(name);
  let slug = base;
  for (let n = 2; await prisma.product.findFirst({ where: { slug, id: exceptId ? { not: exceptId } : undefined }, select: { id: true } }); n++) {
    slug = `${base}-${n}`;
  }
  return slug;
};

/** Checks the brand and category, SKU clashes, and leaves exactly one variant as the default. */
const prepare = async (input: ProductInput, productId?: number) => {
  if (input.brandId && !(await prisma.brand.findUnique({ where: { id: input.brandId }, select: { id: true } }))) {
    throw new HttpError(400, "That brand does not exist");
  }
  if (input.categoryId && !(await prisma.category.findUnique({ where: { id: input.categoryId }, select: { id: true } }))) {
    throw new HttpError(400, "That category does not exist");
  }

  const skus = input.variants.map((v) => v.sku).filter((sku): sku is string => Boolean(sku));
  if (new Set(skus.map((s) => s.toLowerCase())).size !== skus.length) throw new HttpError(400, "Two variants have the same SKU");
  if (skus.length) {
    const clash = await prisma.productVariant.findFirst({
      where: { sku: { in: skus, mode: "insensitive" }, productId: productId ? { not: productId } : undefined },
      select: { sku: true, product: { select: { name: true } } },
    });
    if (clash) throw new HttpError(400, `SKU ${clash.sku} is already used by "${clash.product.name}"`);
  }

  const defaultIndex = Math.max(0, input.variants.findIndex((v) => v.isDefault));
  return input.variants.map((variant, index) => ({ ...variant, isDefault: index === defaultIndex, sortOrder: index }));
};

type PreparedVariant = Awaited<ReturnType<typeof prepare>>[number];

/** Adds a variant; without a SKU it gets a generated one, and any starting stock is logged. */
const createVariant = async (tx: Tx, productId: number, { id: _id, sku, ...variant }: PreparedVariant, staffId: number) => {
  const saved = await tx.productVariant.create({
    data: { ...variant, productId, sku: sku ?? `pending-${productId}-${variant.sortOrder}-${Date.now()}` },
  });
  if (!sku) await tx.productVariant.update({ where: { id: saved.id }, data: { sku: `DH-${String(saved.id).padStart(6, "0")}` } });
  if (saved.stockQuantity > 0) {
    await tx.inventoryMovement.create({
      data: { variantId: saved.id, type: "OPENING", quantity: saved.stockQuantity, balanceAfter: saved.stockQuantity, note: "Opening stock", createdById: staffId },
    });
  }
};

/** The web address staff typed, if nobody else has it; otherwise one made from the name. */
const chosenSlug = async (typed: string | undefined, name: string, exceptId?: number) => {
  if (!typed) return freeSlug(name, exceptId);
  const taken = await prisma.product.findFirst({ where: { slug: typed, id: exceptId ? { not: exceptId } : undefined }, select: { id: true } });
  if (taken) throw new HttpError(400, "Another product already uses that web address");
  return typed;
};

productFormRoutes.post("/", async (req, res) => {
  const input = productInput.parse(req.body);
  const variants = await prepare(input);
  const slug = await chosenSlug(input.slug, input.name);
  const { images, variants: _variants, slug: _slug, ...fields } = input;

  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: { ...fields, slug, images: { create: images.map((url, sortOrder) => ({ url, sortOrder })) } },
    });
    for (const variant of variants) await createVariant(tx, created.id, variant, req.user!.id);
    await tx.auditLog.create({ data: { actorId: req.user!.id, action: "product.create", entity: "Product", entityId: String(created.id) } });
    return created;
  });

  res.status(201).json({ id: product.id });
});

productFormRoutes.patch("/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const input = productInput.parse(req.body);
  const existing = await prisma.product.findUnique({ where: { id }, include: { variants: { select: { id: true, stockQuantity: true } } } });
  if (!existing) throw notFound("Product");

  const variants = await prepare(input, id);
  const known = new Map(existing.variants.map((v) => [v.id, v]));
  if (variants.some((v) => v.id && !known.has(v.id))) throw new HttpError(400, "One of the variants belongs to another product");
  // Renaming a product keeps its web address, so links from search engines and elsewhere keep working.
  // It changes only when staff type a new one.
  const slug = input.slug && input.slug !== existing.slug ? await chosenSlug(input.slug, input.name, id) : existing.slug;
  const { images, variants: _variants, slug: _slug, ...fields } = input;
  const keptIds = variants.map((v) => v.id).filter((v): v is number => Boolean(v));

  await prisma.$transaction(async (tx) => {
    await tx.product.update({ where: { id }, data: { ...fields, slug } });

    await tx.productImage.deleteMany({ where: { productId: id } });
    await tx.productImage.createMany({ data: images.map((url, sortOrder) => ({ productId: id, url, sortOrder })) });

    // variants taken off the form are removed; past orders keep their own copy of the details
    await tx.productVariant.deleteMany({ where: { productId: id, id: { notIn: keptIds } } });

    for (const variant of variants) {
      if (!variant.id) {
        await createVariant(tx, id, variant, req.user!.id);
        continue;
      }
      const { id: variantId, sku, ...data } = variant;
      await tx.productVariant.update({ where: { id: variantId }, data: { ...data, ...(sku ? { sku } : {}) } });
      const change = data.stockQuantity - known.get(variantId)!.stockQuantity;
      if (change !== 0) {
        await tx.inventoryMovement.create({
          data: { variantId, type: "ADJUSTMENT", quantity: change, balanceAfter: data.stockQuantity, note: "Changed on the product page", createdById: req.user!.id },
        });
      }
    }
    await tx.auditLog.create({ data: { actorId: req.user!.id, action: "product.update", entity: "Product", entityId: String(id) } });
  });

  res.json({ id });
});
