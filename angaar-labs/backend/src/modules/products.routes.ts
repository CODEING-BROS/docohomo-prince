import { productSeo } from "../lib/seo";
import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "../generated/prisma/client";
import { getPage, idParam, notFound, num, numOrNull, optionalInt, optionalString, paged } from "../lib/http";
import { prisma } from "../lib/prisma";

export const productRoutes = Router();

const listSchema = z.object({
  q: optionalString,
  brandId: optionalInt,
  categoryId: optionalInt,
  status: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional()),
  stock: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["in", "low", "out"]).optional()),
  sort: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["newest", "oldest", "name", "updated"]).default("newest")),
});

const ORDER_BY: Record<string, Prisma.ProductOrderByWithRelationInput> = {
  newest: { createdAt: "desc" },
  oldest: { createdAt: "asc" },
  name: { name: "asc" },
  updated: { updatedAt: "desc" },
};

/** A category filter also matches everything below that category. */
const categoryWithChildren = async (categoryId: number) => {
  const all = await prisma.category.findMany({ select: { id: true, parentId: true } });
  const ids = [categoryId];
  for (let i = 0; i < ids.length; i++) {
    for (const c of all) if (c.parentId === ids[i]) ids.push(c.id);
  }
  return ids;
};

// Brands and categories for filter dropdowns and forms.
productRoutes.get("/lookups", async (_req, res) => {
  const [brands, categories] = await Promise.all([
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, parentId: true } }),
  ]);
  res.json({ brands, categories });
});

export const productFilters = listSchema;

export const productWhere = async (filters: z.infer<typeof listSchema>) => {
  const where: Prisma.ProductWhereInput = {};
  if (filters.q) {
    where.OR = [
      { name: { contains: filters.q, mode: "insensitive" } },
      { legacyCode: { contains: filters.q, mode: "insensitive" } },
      { variants: { some: { sku: { contains: filters.q, mode: "insensitive" } } } },
    ];
  }
  if (filters.brandId) where.brandId = filters.brandId;
  if (filters.categoryId) where.categoryId = { in: await categoryWithChildren(filters.categoryId) };
  if (filters.status) where.status = filters.status;
  if (filters.stock === "out") where.variants = { every: { stockQuantity: { lte: 0 } } };
  if (filters.stock === "in") where.variants = { some: { stockQuantity: { gt: 0 } } };
  if (filters.stock === "low") where.variants = { some: { stockQuantity: { gt: 0, lte: 5 } } };
  return where;
};

productRoutes.get("/", async (req, res) => {
  const { page, pageSize, skip, take } = getPage(req);
  const filters = listSchema.parse(req.query);
  const where = await productWhere(filters);

  const [total, rows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: ORDER_BY[filters.sort],
      skip,
      take,
      select: {
        id: true, name: true, slug: true, status: true, form: true, createdAt: true, updatedAt: true,
        brand: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
        variants: {
          orderBy: { sortOrder: "asc" },
          select: { id: true, sku: true, title: true, mrp: true, sellingPrice: true, stockQuantity: true },
        },
      },
    }),
  ]);

  const items = rows.map((p) => {
    const prices = p.variants.map((v) => num(v.sellingPrice));
    return {
      id: p.id, name: p.name, slug: p.slug, status: p.status, form: p.form,
      brand: p.brand, category: p.category,
      imageUrl: p.images[0]?.url ?? null,
      variantCount: p.variants.length,
      variantTitles: p.variants.map((v) => v.title),
      sku: p.variants[0]?.sku ?? null,
      priceMin: prices.length ? Math.min(...prices) : 0,
      priceMax: prices.length ? Math.max(...prices) : 0,
      stock: p.variants.reduce((sum, v) => sum + v.stockQuantity, 0),
      createdAt: p.createdAt, updatedAt: p.updatedAt,
    };
  });

  res.json(paged(items, total, page, pageSize));
});

productRoutes.get("/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      brand: { select: { id: true, name: true } },
      category: { select: { id: true, name: true, parent: { select: { id: true, name: true } } } },
      images: { orderBy: { sortOrder: "asc" } },
      variants: { orderBy: { sortOrder: "asc" } },
      _count: { select: { reviews: true, orderItems: true } },
    },
  });
  if (!product) throw notFound("Product");

  res.json({
    ...product,
    seo: productSeo({ ...product, brandName: product.brand?.name }),
    gstPercent: num(product.gstPercent),
    ratingAverage: num(product.ratingAverage),
    variants: product.variants.map((v) => ({
      ...v,
      mrp: num(v.mrp),
      sellingPrice: num(v.sellingPrice),
      b2bPrice: numOrNull(v.b2bPrice),
      costPrice: numOrNull(v.costPrice),
    })),
  });
});
