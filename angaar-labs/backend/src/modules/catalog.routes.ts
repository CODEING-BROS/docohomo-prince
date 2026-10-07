import { Router } from "express";
import { z } from "zod";
import { HttpError, idParam, notFound, optionalString } from "../lib/http";
import { prisma } from "../lib/prisma";

// Brands and the category tree.
export const brandRoutes = Router();
export const categoryRoutes = Router();

export const slugify = (text: string) =>
  text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 110) || "item";

/** A slug nobody else in the table is using; `taken` answers whether a candidate is in use. */
export const freeSlug = async (base: string, taken: (slug: string) => Promise<boolean>) => {
  let slug = base;
  for (let n = 2; await taken(slug); n++) slug = `${base}-${n}`;
  return slug;
};

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const optionalText = z.preprocess(emptyToNull, z.string().trim().max(2000).nullable().optional());
const imageAddress = z.union([z.url(), z.string().regex(/^\/uploads\/[\w./-]+$/)], "Upload an image, or enter a full link starting with https://");
const optionalUrl = z.preprocess(emptyToNull, imageAddress.nullable().optional());

// ─────────────────────────────────────────────── brands

const brandInput = z.object({
  name: z.string().trim().min(1, "Give the brand a name").max(120),
  logoUrl: optionalUrl,
  description: optionalText,
  isActive: z.boolean().optional(),
});

brandRoutes.get("/", async (req, res) => {
  const { q } = z.object({ q: optionalString }).parse(req.query);
  const brands = await prisma.brand.findMany({
    where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
    orderBy: { name: "asc" },
    include: { _count: { select: { products: true } } },
  });
  res.json({ items: brands.map(({ _count, ...b }) => ({ ...b, productCount: _count.products })) });
});

brandRoutes.post("/", async (req, res) => {
  const input = brandInput.parse(req.body);
  if (await prisma.brand.findFirst({ where: { name: { equals: input.name, mode: "insensitive" } } })) {
    throw new HttpError(400, "A brand with this name already exists");
  }
  const slug = await freeSlug(slugify(input.name), async (s) => Boolean(await prisma.brand.findUnique({ where: { slug: s } })));
  const brand = await prisma.brand.create({ data: { ...input, slug } });
  res.status(201).json(brand);
});

brandRoutes.patch("/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const input = brandInput.partial().parse(req.body);
  if (!(await prisma.brand.findUnique({ where: { id } }))) throw notFound("Brand");
  if (input.name && (await prisma.brand.findFirst({ where: { id: { not: id }, name: { equals: input.name, mode: "insensitive" } } }))) {
    throw new HttpError(400, "Another brand already has this name");
  }
  res.json(await prisma.brand.update({ where: { id }, data: input }));
});

brandRoutes.delete("/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const brand = await prisma.brand.findUnique({ where: { id }, include: { _count: { select: { products: true } } } });
  if (!brand) throw notFound("Brand");
  if (brand._count.products > 0) {
    throw new HttpError(400, `${brand._count.products} products use this brand. Move them to another brand first, or mark the brand inactive.`);
  }
  await prisma.brand.delete({ where: { id } });
  res.json({ ok: true });
});

// ─────────────────────────────────────────────── categories

const MAX_DEPTH = 3; // main category › category › subcategory

const categoryInput = z.object({
  name: z.string().trim().min(1, "Give the category a name").max(120),
  parentId: z.number().int().positive().nullable().optional(),
  imageUrl: optionalUrl,
  description: optionalText,
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

/** How many levels deep a category sits; a main category is 1. */
const depthOf = async (categoryId: number | null | undefined) => {
  let depth = 0;
  for (let id = categoryId ?? null; id !== null && depth <= MAX_DEPTH; depth++) {
    id = (await prisma.category.findUnique({ where: { id }, select: { parentId: true } }))?.parentId ?? null;
  }
  return depth;
};

// The whole tree as a flat list; the admin page nests it. Product counts are the category's own.
categoryRoutes.get("/", async (_req, res) => {
  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { products: true, children: true } } },
  });

  // A category with no image of its own borrows a product photo: one of its own products,
  // or failing that one from a category inside it. Nothing is saved; it is only for display.
  const firstProductImage = await prisma.$queryRaw<{ id: number; url: string }[]>`
    SELECT DISTINCT ON (p."categoryId") p."categoryId" AS id, i.url
    FROM "Product" p JOIN "ProductImage" i ON i."productId" = p.id
    WHERE p."categoryId" IS NOT NULL
    ORDER BY p."categoryId", p.id, i."sortOrder"`;
  const borrowed = new Map(firstProductImage.map((row) => [row.id, row.url]));
  const childrenOf = new Map<number, number[]>();
  for (const c of categories) if (c.parentId) childrenOf.set(c.parentId, [...(childrenOf.get(c.parentId) ?? []), c.id]);
  const borrow = (id: number): string | null => {
    const own = borrowed.get(id);
    if (own) return own;
    for (const child of childrenOf.get(id) ?? []) {
      const found = borrow(child);
      if (found) return found;
    }
    return null;
  };

  res.json({
    items: categories.map(({ _count, ...c }) => ({
      ...c,
      productCount: _count.products,
      childCount: _count.children,
      fallbackImageUrl: c.imageUrl ? null : borrow(c.id),
    })),
  });
});

categoryRoutes.post("/", async (req, res) => {
  const input = categoryInput.parse(req.body);
  const parentId = input.parentId ?? null;
  if (parentId && !(await prisma.category.findUnique({ where: { id: parentId } }))) throw new HttpError(400, "The parent category does not exist");
  if ((await depthOf(parentId)) >= MAX_DEPTH) throw new HttpError(400, "Categories can only go three levels deep");
  if (await prisma.category.findFirst({ where: { parentId, name: { equals: input.name, mode: "insensitive" } } })) {
    throw new HttpError(400, "This name is already used at this level");
  }
  const slug = await freeSlug(slugify(input.name), async (s) => Boolean(await prisma.category.findUnique({ where: { slug: s } })));
  res.status(201).json(await prisma.category.create({ data: { ...input, parentId, slug } }));
});

categoryRoutes.patch("/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  // renaming and details only; a category is not moved to another parent once created
  const input = categoryInput.omit({ parentId: true }).partial().parse(req.body);
  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) throw notFound("Category");
  if (input.name && (await prisma.category.findFirst({ where: { id: { not: id }, parentId: category.parentId, name: { equals: input.name, mode: "insensitive" } } }))) {
    throw new HttpError(400, "This name is already used at this level");
  }
  res.json(await prisma.category.update({ where: { id }, data: input }));
});

categoryRoutes.delete("/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const category = await prisma.category.findUnique({ where: { id }, include: { _count: { select: { products: true, children: true } } } });
  if (!category) throw notFound("Category");
  if (category._count.children > 0) throw new HttpError(400, "Delete or move the categories inside this one first");
  if (category._count.products > 0) {
    throw new HttpError(400, `${category._count.products} products are in this category. Move them first, or mark the category inactive.`);
  }
  await prisma.category.delete({ where: { id } });
  res.json({ ok: true });
});
