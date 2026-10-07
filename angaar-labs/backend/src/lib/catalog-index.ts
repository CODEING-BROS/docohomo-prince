import { num } from "./http";
import { prisma } from "./prisma";

// A small in-memory copy of everything on sale, one entry per product.
// The shop's listing, filters, counts, sorting and search all run on this copy, so a filter click
// never waits on a heavy database query. It is rebuilt at most once a minute, which means a change
// made in the admin panel can take up to a minute to show in the listing. Product pages, the cart
// and checkout always read live prices and stock from the database.

export type CatalogEntry = {
  id: number;
  name: string;
  slug: string;
  brandId: number | null;
  brandName: string | null;
  categoryId: number | null;
  categoryIds: number[]; // the product's category and every category above it
  form: string | null;
  imageUrl: string | null;
  variantId: number; // the pack shown on the card
  variantTitle: string;
  variantCount: number;
  price: number;
  mrp: number;
  discountPercent: number;
  inStock: boolean;
  potencies: string[];
  packSizes: string[];
  rating: number;
  ratingCount: number;
  sold: number;
  createdAt: number;
  isFeatured: boolean;
  isNewArrival: boolean;
  isTrending: boolean;
  requiresPrescription: boolean;
  nameLower: string;
  text: string; // everything a shopper might type, in lower case
};

export type CatalogCategory = { id: number; parentId: number | null; name: string; slug: string; imageUrl: string | null; sortOrder: number };
export type CatalogBrand = { id: number; name: string; slug: string; logoUrl: string | null };

type Catalog = {
  entries: CatalogEntry[];
  categories: CatalogCategory[];
  categoryBySlug: Map<string, CatalogCategory>;
  brands: CatalogBrand[];
  brandBySlug: Map<string, CatalogBrand>;
};

const MAX_AGE_MS = 60_000;
let cached: { at: number; catalog: Catalog } | null = null;
let building: Promise<Catalog> | null = null;

const build = async (): Promise<Catalog> => {
  const [products, categories, brands, sales] = await Promise.all([
    prisma.product.findMany({
      where: { status: "ACTIVE", variants: { some: { isActive: true } } },
      select: {
        id: true, name: true, slug: true, brandId: true, categoryId: true, form: true, tags: true, createdAt: true,
        ratingAverage: true, ratingCount: true, isFeatured: true, isNewArrival: true, isTrending: true, requiresPrescription: true,
        images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
        variants: {
          where: { isActive: true },
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          select: { id: true, sku: true, title: true, packSize: true, potency: true, mrp: true, sellingPrice: true, stockQuantity: true, isDefault: true },
        },
      },
    }),
    prisma.category.findMany({ where: { isActive: true }, select: { id: true, parentId: true, name: true, slug: true, imageUrl: true, sortOrder: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.brand.findMany({ where: { isActive: true }, select: { id: true, name: true, slug: true, logoUrl: true }, orderBy: { name: "asc" } }),
    prisma.orderItem.groupBy({ by: ["productId"], _sum: { quantity: true }, where: { productId: { not: null } } }),
  ]);

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const brandById = new Map(brands.map((b) => [b.id, b]));
  const soldByProduct = new Map(sales.map((s) => [s.productId!, s._sum.quantity ?? 0]));
  const withAncestors = (categoryId: number | null) => {
    const ids: number[] = [];
    for (let id = categoryId; id !== null && id !== undefined && ids.length < 10; id = categoryById.get(id)?.parentId ?? null) ids.push(id);
    return ids;
  };
  const unique = (values: (string | null)[]) => [...new Set(values.filter((v): v is string => Boolean(v && v.trim())).map((v) => v.trim()))];

  const entries = products.map((product): CatalogEntry => {
    const inStockPacks = product.variants.filter((v) => v.stockQuantity > 0);
    const pool = inStockPacks.length ? inStockPacks : product.variants;
    // the card shows the pack marked as default when it can be bought, otherwise the cheapest one that can
    const shown = pool.find((v) => v.isDefault) ?? [...pool].sort((a, b) => num(a.sellingPrice) - num(b.sellingPrice))[0];
    const price = num(shown.sellingPrice);
    const mrp = Math.max(num(shown.mrp), price);
    const brand = product.brandId ? brandById.get(product.brandId) : undefined;
    const categoryIds = withAncestors(product.categoryId);
    const potencies = unique(product.variants.map((v) => v.potency));
    const packSizes = unique(product.variants.map((v) => v.packSize));
    return {
      id: product.id, name: product.name, slug: product.slug,
      brandId: brand ? brand.id : null, brandName: brand?.name ?? null,
      categoryId: product.categoryId, categoryIds, form: product.form?.trim() || null,
      imageUrl: product.images[0]?.url ?? null,
      variantId: shown.id, variantTitle: shown.title, variantCount: product.variants.length,
      price, mrp, discountPercent: mrp > 0 ? Math.round((1 - price / mrp) * 100) : 0,
      inStock: inStockPacks.length > 0,
      potencies, packSizes,
      rating: num(product.ratingAverage), ratingCount: product.ratingCount,
      sold: soldByProduct.get(product.id) ?? 0, createdAt: product.createdAt.getTime(),
      isFeatured: product.isFeatured, isNewArrival: product.isNewArrival, isTrending: product.isTrending, requiresPrescription: product.requiresPrescription,
      nameLower: product.name.toLowerCase(),
      text: [
        product.name, brand?.name, product.form, ...product.tags, ...categoryIds.map((id) => categoryById.get(id)?.name),
        ...potencies, ...packSizes, ...product.variants.map((v) => v.sku),
      ].filter(Boolean).join(" ").toLowerCase(),
    };
  });

  return {
    entries, categories, brands,
    categoryBySlug: new Map(categories.map((c) => [c.slug, c])),
    brandBySlug: new Map(brands.map((b) => [b.slug, b])),
  };
};

export const getCatalog = async (): Promise<Catalog> => {
  if (cached && Date.now() - cached.at < MAX_AGE_MS) return cached.catalog;
  // one rebuild at a time; while it runs, everyone else keeps the copy they have
  building ??= build()
    .then((catalog) => {
      cached = { at: Date.now(), catalog };
      return catalog;
    })
    .finally(() => {
      building = null;
    });
  return cached ? cached.catalog : building;
};

/** What a product card needs. */
export const toCard = (entry: CatalogEntry) => ({
  id: entry.id, name: entry.name, slug: entry.slug, brandName: entry.brandName, imageUrl: entry.imageUrl,
  variantId: entry.variantId, variantTitle: entry.variantTitle, variantCount: entry.variantCount,
  price: entry.price, mrp: entry.mrp, discountPercent: entry.discountPercent, inStock: entry.inStock,
  rating: entry.rating, ratingCount: entry.ratingCount, requiresPrescription: entry.requiresPrescription,
});
