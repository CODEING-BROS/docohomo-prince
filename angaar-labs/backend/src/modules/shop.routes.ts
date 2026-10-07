import { invoicePdf } from "../lib/invoice";
import { shippingSettings } from "../lib/shipping";
import { serviceability, shiprocketReady } from "../lib/shiprocket";
import * as events from "../lib/events";
import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { type CatalogEntry, getCatalog, toCard } from "../lib/catalog-index";
import { newOrderNumber } from "../lib/consult";
import { cancelOrderAndRestock } from "../lib/housekeeping";
import { HttpError, idParam, notFound, num, numOrNull } from "../lib/http";
import { paymentsMode, startPayment } from "../lib/payments";
import { priceB2BCart, shippingFor } from "../lib/pricing";
import { prisma } from "../lib/prisma";
import { blogSeo, productSeo } from "../lib/seo";

// The shop.
//   shopRoutes    /api/shop  open to everyone: home, listing with filters, product page, cart prices
//   shopMeRoutes  /api/me    signed in: place an order, see and cancel an order, saved addresses
// A doctor with an approved wholesale account sees wholesale prices everywhere, automatically.
export const shopRoutes = Router();
export const shopMeRoutes = Router();

const round = (value: number) => Math.round(value * 100) / 100;

/** The wholesale account of whoever is looking, when they have an approved one. */
const wholesaleAccountOf = async (userId: number | undefined) => {
  if (!userId) return null;
  const account = await prisma.b2BAccount.findFirst({ where: { userId, status: "APPROVED" }, select: { id: true } });
  return account?.id ?? null;
};

type Card = ReturnType<typeof toCard> & { wholesalePrice?: number };

/** Adds the doctor's own price to each card. */
const withWholesale = async (cards: Card[], accountId: number | null): Promise<Card[]> => {
  if (!accountId || cards.length === 0) return cards;
  const priced = await priceB2BCart(accountId, cards.map((card) => ({ variantId: card.variantId, quantity: 1 })), { each: true }).catch(() => null);
  if (!priced) return cards;
  const priceOf = new Map(priced.lines.map((line) => [line.variantId, line.unitPrice]));
  return cards.map((card) => ({ ...card, wholesalePrice: priceOf.get(card.variantId) }));
};

// ---------------------------------------------------------------- home

shopRoutes.get("/home", async (req, res) => {
  const now = new Date();
  const [catalog, banners, accountId] = await Promise.all([
    getCatalog(),
    prisma.banner.findMany({
      where: { isActive: true, placement: "HOME_HERO", AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: { id: true, title: true, imageUrl: true, linkUrl: true, platform: true },
    }),
    wholesaleAccountOf(req.user?.id),
  ]);

  const { entries } = catalog;
  const buyable = entries.filter((e) => e.inStock);
  const top = (list: CatalogEntry[], sort: (a: CatalogEntry, b: CatalogEntry) => number, count = 12) => [...list].sort(sort).slice(0, count);
  const bySold = (a: CatalogEntry, b: CatalogEntry) => b.sold - a.sold;

  // a category shows its own picture, or borrows one from a product inside it
  const productCount = new Map<number, number>();
  const borrowedImage = new Map<number, string>();
  for (const entry of entries) {
    for (const id of entry.categoryIds) {
      productCount.set(id, (productCount.get(id) ?? 0) + 1);
      if (entry.imageUrl && !borrowedImage.has(id)) borrowedImage.set(id, entry.imageUrl);
    }
  }
  const categories = catalog.categories
    .filter((c) => c.parentId === null && (productCount.get(c.id) ?? 0) > 0)
    .map((c) => ({ id: c.id, name: c.name, slug: c.slug, imageUrl: c.imageUrl || borrowedImage.get(c.id) || null, productCount: productCount.get(c.id) ?? 0 }));

  const brandCount = new Map<number, number>();
  for (const entry of entries) if (entry.brandId) brandCount.set(entry.brandId, (brandCount.get(entry.brandId) ?? 0) + 1);
  const brands = catalog.brands
    .filter((b) => (brandCount.get(b.id) ?? 0) > 0)
    .map((b) => ({ ...b, productCount: brandCount.get(b.id) ?? 0 }))
    .sort((a, b) => b.productCount - a.productCount)
    .slice(0, 18);

  const marked = (flag: "isFeatured" | "isTrending" | "isNewArrival") => buyable.filter((e) => e[flag]);
  const rails = [
    { key: "bestsellers", title: "Best sellers", href: "/products?sort=popular", items: top(buyable, bySold) },
    // staff can mark products as trending or featured; until enough are marked the rail is left out
    { key: "trending", title: "Trending now", href: "/products?sort=popular", items: marked("isTrending").length >= 4 ? top(marked("isTrending"), bySold) : [] },
    { key: "featured", title: "Picked for you", href: "/products", items: marked("isFeatured").length >= 4 ? top(marked("isFeatured"), bySold) : [] },
    { key: "deals", title: "Biggest savings", href: "/products?sort=discount", items: top(buyable.filter((e) => e.discountPercent >= 10), (a, b) => b.discountPercent - a.discountPercent || b.sold - a.sold) },
    { key: "new", title: "Just added", href: "/products?sort=newest", items: top(buyable, (a, b) => b.createdAt - a.createdAt) },
  ].filter((rail) => rail.items.length > 0);

  res.json({
    banners,
    categories,
    brands,
    rails: await Promise.all(rails.map(async (rail) => ({ ...rail, items: await withWholesale(rail.items.map(toCard), accountId) }))),
    wholesale: accountId !== null,
  });
});

// ---------------------------------------------------------------- listing with filters

const list = (value: unknown) => (typeof value === "string" && value !== "" ? value.split(",").map((v) => v.trim()).filter(Boolean) : []);
const optionalNumber = z.preprocess((v) => (v === "" || v === undefined ? undefined : v), z.coerce.number().min(0).optional());
const listingSchema = z.object({
  q: z.string().trim().max(80).default(""),
  category: z.string().trim().default(""), // slug
  brand: z.preprocess(list, z.array(z.string())), // slugs, comma separated
  form: z.preprocess(list, z.array(z.string())),
  potency: z.preprocess(list, z.array(z.string())),
  pack: z.preprocess(list, z.array(z.string())),
  minPrice: optionalNumber,
  maxPrice: optionalNumber,
  discount: optionalNumber, // at least this % off
  rating: optionalNumber, // at least this many stars
  inStock: z.preprocess((v) => v === "1" || v === "true", z.boolean()),
  sort: z.enum(["relevance", "popular", "price-asc", "price-desc", "newest", "discount", "rating", "name"]).default("relevance"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(24),
});

const PRICE_BANDS = [
  { key: "0-100", label: "Under ₹100", min: 0, max: 100 },
  { key: "100-250", label: "₹100 to ₹250", min: 100, max: 250 },
  { key: "250-500", label: "₹250 to ₹500", min: 250, max: 500 },
  { key: "500-1000", label: "₹500 to ₹1,000", min: 500, max: 1000 },
  { key: "1000-", label: "Above ₹1,000", min: 1000, max: null as number | null },
];

/** How well a product matches what was typed; 0 means it does not match. */
const searchScore = (entry: CatalogEntry, query: string, words: string[]) => {
  if (!words.every((word) => entry.text.includes(word))) return 0;
  if (entry.nameLower === query) return 100;
  if (entry.nameLower.startsWith(query)) return 80;
  if (entry.nameLower.includes(query)) return 60;
  if (words.every((word) => entry.nameLower.includes(word))) return 40;
  return 10;
};

shopRoutes.get("/products", async (req, res) => {
  const filters = listingSchema.parse(req.query);
  const [catalog, accountId] = await Promise.all([getCatalog(), wholesaleAccountOf(req.user?.id)]);

  const query = filters.q.toLowerCase();
  const words = query.split(/\s+/).filter(Boolean);
  const category = filters.category ? catalog.categoryBySlug.get(filters.category) ?? null : null;
  const brandIds = new Set(filters.brand.map((slug) => catalog.brandBySlug.get(slug)?.id).filter((id): id is number => id !== undefined));
  const forms = new Set(filters.form);
  const potencies = new Set(filters.potency);
  const packs = new Set(filters.pack);

  // Each group of filters is checked on its own. A product that fails exactly one group still counts
  // towards that group's numbers, so "Brand" shows how many you would get by ticking another brand.
  type Group = "category" | "brand" | "form" | "potency" | "pack" | "price" | "discount" | "rating";
  const checks: [Group, (e: CatalogEntry) => boolean][] = [
    ["category", (e) => !category || e.categoryIds.includes(category.id)],
    ["brand", (e) => brandIds.size === 0 || (e.brandId !== null && brandIds.has(e.brandId))],
    ["form", (e) => forms.size === 0 || (e.form !== null && forms.has(e.form))],
    ["potency", (e) => potencies.size === 0 || e.potencies.some((p) => potencies.has(p))],
    ["pack", (e) => packs.size === 0 || e.packSizes.some((p) => packs.has(p))],
    ["price", (e) => (filters.minPrice === undefined || e.price >= filters.minPrice) && (filters.maxPrice === undefined || e.price <= filters.maxPrice)],
    ["discount", (e) => filters.discount === undefined || e.discountPercent >= filters.discount],
    ["rating", (e) => filters.rating === undefined || e.rating >= filters.rating],
  ];

  const matches: { entry: CatalogEntry; score: number }[] = [];
  const count = {
    category: new Map<number, number>(), brand: new Map<number, number>(), form: new Map<string, number>(),
    potency: new Map<string, number>(), pack: new Map<string, number>(), price: new Map<string, number>(),
    discount: new Map<number, number>(), rating: new Map<number, number>(),
  };
  const bump = <K>(map: Map<K, number>, key: K) => map.set(key, (map.get(key) ?? 0) + 1);
  const DISCOUNT_STEPS = [10, 20, 30, 40];
  const RATING_STEPS = [4, 3];
  let lowest = Infinity;
  let highest = 0;

  for (const entry of catalog.entries) {
    // typed text and "in stock only" are not facet groups: they always apply
    const score = words.length ? searchScore(entry, query, words) : 1;
    if (score === 0) continue;
    if (filters.inStock && !entry.inStock) continue;

    let failed: Group | null = null;
    let failures = 0;
    for (const [group, passes] of checks) {
      if (!passes(entry)) {
        failed = group;
        if (++failures > 1) break;
      }
    }
    if (failures > 1) continue;

    const counts = (group: Group) => failures === 0 || failed === group;
    if (counts("category")) for (const id of entry.categoryIds) bump(count.category, id);
    if (counts("brand") && entry.brandId !== null) bump(count.brand, entry.brandId);
    if (counts("form") && entry.form) bump(count.form, entry.form);
    if (counts("potency")) for (const potency of entry.potencies) bump(count.potency, potency);
    if (counts("pack")) for (const pack of entry.packSizes) bump(count.pack, pack);
    if (counts("price")) {
      const band = PRICE_BANDS.find((b) => entry.price >= b.min && (b.max === null || entry.price < b.max));
      if (band) bump(count.price, band.key);
      lowest = Math.min(lowest, entry.price);
      highest = Math.max(highest, entry.price);
    }
    if (counts("discount")) for (const step of DISCOUNT_STEPS) if (entry.discountPercent >= step) bump(count.discount, step);
    if (counts("rating")) for (const step of RATING_STEPS) if (entry.rating >= step) bump(count.rating, step);

    if (failures === 0) matches.push({ entry, score });
  }

  const sort = filters.sort === "relevance" && words.length === 0 ? "popular" : filters.sort;
  const inStockFirst = (a: CatalogEntry, b: CatalogEntry) => Number(b.inStock) - Number(a.inStock);
  const order: Record<typeof sort, (a: { entry: CatalogEntry; score: number }, b: { entry: CatalogEntry; score: number }) => number> = {
    relevance: (a, b) => b.score - a.score || inStockFirst(a.entry, b.entry) || b.entry.sold - a.entry.sold,
    popular: (a, b) => inStockFirst(a.entry, b.entry) || b.entry.sold - a.entry.sold || a.entry.nameLower.localeCompare(b.entry.nameLower),
    "price-asc": (a, b) => a.entry.price - b.entry.price,
    "price-desc": (a, b) => b.entry.price - a.entry.price,
    newest: (a, b) => b.entry.createdAt - a.entry.createdAt || b.entry.id - a.entry.id,
    discount: (a, b) => b.entry.discountPercent - a.entry.discountPercent || b.entry.sold - a.entry.sold,
    rating: (a, b) => b.entry.rating - a.entry.rating || b.entry.ratingCount - a.entry.ratingCount,
    name: (a, b) => a.entry.nameLower.localeCompare(b.entry.nameLower),
  };
  matches.sort(order[sort]);

  const total = matches.length;
  const pageCount = Math.max(1, Math.ceil(total / filters.pageSize));
  const page = Math.min(filters.page, pageCount);
  const cards = await withWholesale(matches.slice((page - 1) * filters.pageSize, page * filters.pageSize).map((m) => toCard(m.entry)), accountId);

  // the trail from the top category down to the chosen one, and what to offer below it
  const categoryById = new Map(catalog.categories.map((c) => [c.id, c]));
  const trail: { name: string; slug: string }[] = [];
  for (let c = category; c; c = c.parentId ? categoryById.get(c.parentId) ?? null : null) trail.unshift({ name: c.name, slug: c.slug });
  const facetOptions = <K extends string | number>(map: Map<K, number>, chosen: Set<K>) =>
    [...map.entries()].map(([value, n]) => ({ value, count: n, selected: chosen.has(value) })).sort((a, b) => Number(b.selected) - Number(a.selected) || b.count - a.count);

  res.json({
    items: cards, total, page, pageSize: filters.pageSize, pageCount,
    sort,
    category: category ? { name: category.name, slug: category.slug, trail } : null,
    facets: {
      categories: catalog.categories
        .filter((c) => (count.category.get(c.id) ?? 0) > 0)
        .map((c) => ({ id: c.id, parentId: c.parentId, name: c.name, slug: c.slug, count: count.category.get(c.id) ?? 0 })),
      brands: catalog.brands
        .filter((b) => (count.brand.get(b.id) ?? 0) > 0 || brandIds.has(b.id))
        .map((b) => ({ value: b.slug, label: b.name, count: count.brand.get(b.id) ?? 0, selected: brandIds.has(b.id) }))
        .sort((a, b) => Number(b.selected) - Number(a.selected) || b.count - a.count),
      forms: facetOptions(count.form, forms),
      potencies: facetOptions(count.potency, potencies),
      packs: facetOptions(count.pack, packs),
      prices: PRICE_BANDS.map((band) => ({ ...band, count: count.price.get(band.key) ?? 0 })).filter((band) => band.count > 0),
      priceRange: { min: lowest === Infinity ? 0 : Math.floor(lowest), max: Math.ceil(highest) },
      discounts: DISCOUNT_STEPS.map((step) => ({ value: step, count: count.discount.get(step) ?? 0 })).filter((d) => d.count > 0),
      ratings: RATING_STEPS.map((step) => ({ value: step, count: count.rating.get(step) ?? 0 })).filter((r) => r.count > 0),
    },
    wholesale: accountId !== null,
  });
});

/** What the search box offers while someone is typing. */
shopRoutes.get("/suggest", async (req, res) => {
  const query = z.string().trim().max(60).parse(req.query.q ?? "").toLowerCase();
  if (query.length < 2) return res.json({ products: [], categories: [], brands: [] });
  const catalog = await getCatalog();
  const words = query.split(/\s+/).filter(Boolean);

  const products = catalog.entries
    .map((entry) => ({ entry, score: searchScore(entry, query, words) }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score || Number(b.entry.inStock) - Number(a.entry.inStock) || b.entry.sold - a.entry.sold)
    .slice(0, 6)
    .map(({ entry }) => ({ name: entry.name, slug: entry.slug, brandName: entry.brandName, imageUrl: entry.imageUrl, price: entry.price }));
  const named = <T extends { name: string }>(items: T[]) => items.filter((item) => words.every((word) => item.name.toLowerCase().includes(word))).slice(0, 4);

  res.json({
    products,
    categories: named(catalog.categories).map((c) => ({ name: c.name, slug: c.slug })),
    brands: named(catalog.brands).map((b) => ({ name: b.name, slug: b.slug })),
  });
});

// ---------------------------------------------------------------- one product

shopRoutes.get("/products/:slug", async (req, res) => {
  const slug = z.string().min(1).max(200).parse(req.params.slug);
  const product = await prisma.product.findFirst({
    where: { slug, status: "ACTIVE" },
    select: {
      id: true, name: true, slug: true, form: true, shortDescription: true, description: true, composition: true, indications: true,
      directions: true, safetyInfo: true, manufacturer: true, countryOfOrigin: true, requiresPrescription: true, ratingAverage: true, ratingCount: true,
      categoryId: true, seoTitle: true, seoDescription: true,
      brand: { select: { name: true, slug: true, logoUrl: true } },
      images: { orderBy: { sortOrder: "asc" }, select: { url: true, altText: true, variantId: true } },
      variants: {
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        select: {
          id: true, sku: true, title: true, packSize: true, potency: true, mrp: true, sellingPrice: true, stockQuantity: true,
          isDefault: true, minOrderQuantity: true, maxOrderQuantity: true, b2bMinQuantity: true,
        },
      },
      reviews: {
        where: { status: "APPROVED" }, orderBy: { createdAt: "desc" }, take: 20,
        select: { id: true, authorName: true, rating: true, title: true, body: true, isVerifiedBuyer: true, createdAt: true },
      },
    },
  });
  if (!product || product.variants.length === 0) throw notFound("Product");

  const [catalog, accountId] = await Promise.all([getCatalog(), wholesaleAccountOf(req.user?.id)]);

  // the doctor's price for each pack, at the smallest quantity they are allowed to buy
  const wholesaleOf = new Map<number, { unitPrice: number; source: string }>();
  if (accountId) {
    const priced = await priceB2BCart(accountId, product.variants.map((v) => ({ variantId: v.id, quantity: Math.max(1, v.b2bMinQuantity) })), { each: true }).catch(() => null);
    for (const line of priced?.lines ?? []) wholesaleOf.set(line.variantId, { unitPrice: line.unitPrice, source: line.source });
  }

  const categoryById = new Map(catalog.categories.map((c) => [c.id, c]));
  const trail: { name: string; slug: string }[] = [];
  for (let c = product.categoryId ? categoryById.get(product.categoryId) : undefined; c; c = c.parentId ? categoryById.get(c.parentId) : undefined) trail.unshift({ name: c.name, slug: c.slug });

  const sameCategory = catalog.entries.filter((e) => e.id !== product.id && e.inStock && product.categoryId !== null && e.categoryId === product.categoryId);
  const related = [...sameCategory].sort((a, b) => b.sold - a.sold).slice(0, 10);

  const { categoryId: _categoryId, seoTitle: _seoTitle, seoDescription: _seoDescription, ...rest } = product;
  const seo = productSeo({ ...product, brandName: product.brand?.name });
  res.json({
    ...rest,
    // for the page's <title> and description tags, and the address search engines should keep
    seo: { title: seo.title, description: seo.description, path: `/products/${product.slug}`, image: product.images[0]?.url ?? null },
    ratingAverage: num(product.ratingAverage),
    trail,
    variants: product.variants.map((v) => {
      const sellingPrice = num(v.sellingPrice);
      const mrp = Math.max(num(v.mrp), sellingPrice);
      return {
        id: v.id, sku: v.sku, title: v.title, packSize: v.packSize, potency: v.potency, isDefault: v.isDefault,
        mrp, price: sellingPrice, discountPercent: mrp > 0 ? Math.round((1 - sellingPrice / mrp) * 100) : 0,
        inStock: v.stockQuantity > 0, stockLeft: v.stockQuantity > 0 && v.stockQuantity <= 5 ? v.stockQuantity : null,
        minQuantity: accountId ? Math.max(1, v.b2bMinQuantity) : Math.max(1, v.minOrderQuantity),
        maxQuantity: Math.max(1, Math.min(v.stockQuantity, accountId ? v.stockQuantity : v.maxOrderQuantity ?? 20)),
        wholesale: wholesaleOf.get(v.id) ?? null,
      };
    }),
    related: await withWholesale(related.map(toCard), accountId),
    wholesale: accountId !== null,
  });
});

// ---------------------------------------------------------------- blog (for the website)

const blogCard = { id: true, title: true, slug: true, excerpt: true, coverImageUrl: true, authorName: true, publishedAt: true, category: { select: { name: true, slug: true } } } as const;

shopRoutes.get("/blog", async (req, res) => {
  const query = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(12), category: z.string().trim().optional() }).parse(req.query);
  const where = { status: "PUBLISHED" as const, ...(query.category ? { category: { slug: query.category } } : {}) };
  const [items, total] = await Promise.all([
    prisma.blogPost.findMany({ where, orderBy: [{ publishedAt: "desc" }, { id: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize, select: blogCard }),
    prisma.blogPost.count({ where }),
  ]);
  res.json({ items, total, page: query.page, pageSize: query.pageSize, pageCount: Math.max(1, Math.ceil(total / query.pageSize)) });
});

shopRoutes.get("/blog/:slug", async (req, res) => {
  const slug = z.string().min(1).max(300).parse(req.params.slug);
  const post = await prisma.blogPost.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: { ...blogCard, content: true, authorBio: true, authorImageUrl: true, updatedAt: true, seoTitle: true, seoDescription: true },
  });
  if (!post) throw notFound("Article");
  const { seoTitle: _seoTitle, seoDescription: _seoDescription, ...rest } = post;
  const seo = blogSeo(post);
  res.json({ ...rest, seo: { title: seo.title, description: seo.description, path: `/blog/${post.slug}`, image: post.coverImageUrl } });
});

// A plain list of every page the website should tell search engines about (for its sitemap).
shopRoutes.get("/sitemap", async (_req, res) => {
  const [products, categories, brands, posts] = await Promise.all([
    prisma.product.findMany({ where: { status: "ACTIVE", variants: { some: { isActive: true } } }, select: { slug: true, updatedAt: true } }),
    prisma.category.findMany({ where: { isActive: true }, select: { slug: true, updatedAt: true } }),
    prisma.brand.findMany({ where: { isActive: true }, select: { slug: true, updatedAt: true } }),
    prisma.blogPost.findMany({ where: { status: "PUBLISHED" }, select: { slug: true, updatedAt: true } }),
  ]);
  res.json({
    products: products.map((p) => ({ path: `/products/${p.slug}`, updatedAt: p.updatedAt })),
    categories: categories.map((c) => ({ path: `/products?category=${c.slug}`, updatedAt: c.updatedAt })),
    brands: brands.map((b) => ({ path: `/products?brand=${b.slug}`, updatedAt: b.updatedAt })),
    blog: posts.map((p) => ({ path: `/blog/${p.slug}`, updatedAt: p.updatedAt })),
  });
});

// ---------------------------------------------------------------- cart prices

const linesSchema = z.array(z.object({ variantId: z.coerce.number().int().positive(), quantity: z.coerce.number().int().min(1).max(9999) })).max(100);
const quoteSchema = z.object({
  lines: linesSchema,
  couponCode: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(40).optional()),
  paymentMethod: z.enum(["COD", "ONLINE", "CREDIT"]).default("COD"),
});
export type QuoteInput = z.infer<typeof quoteSchema>;

/** Checks a coupon against this order and says how much it takes off. */
const couponFor = async (code: string, order: { userId?: number; channel: "D2C" | "B2B"; subtotal: number; shipping: number }) => {
  const coupon = await prisma.coupon.findFirst({ where: { code: { equals: code, mode: "insensitive" }, isActive: true } });
  const now = new Date();
  const refuse = (message: string) => ({ ok: false as const, message });
  if (!coupon) return refuse("That coupon code is not valid");
  if (coupon.startsAt && coupon.startsAt > now) return refuse("This coupon is not active yet");
  if (coupon.expiresAt && coupon.expiresAt < now) return refuse("This coupon has expired");
  if (coupon.channel && coupon.channel !== order.channel) return refuse("This coupon cannot be used on this order");
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) return refuse("This coupon has been used up");
  if (coupon.minOrderValue !== null && order.subtotal < num(coupon.minOrderValue)) return refuse(`Add ₹${Math.ceil(num(coupon.minOrderValue) - order.subtotal)} more to use this coupon`);
  if (coupon.perUserLimit !== null && order.userId) {
    const used = await prisma.couponRedemption.count({ where: { couponId: coupon.id, userId: order.userId } });
    if (used >= coupon.perUserLimit) return refuse("You have already used this coupon");
  }
  const value = num(coupon.value);
  let discount = coupon.type === "PERCENT" ? (order.subtotal * value) / 100 : coupon.type === "FLAT" ? value : order.shipping;
  if (coupon.maxDiscount !== null) discount = Math.min(discount, num(coupon.maxDiscount));
  discount = round(Math.min(discount, coupon.type === "FREE_SHIPPING" ? order.shipping : order.subtotal));
  return { ok: true as const, id: coupon.id, code: coupon.code, discount, description: coupon.description };
};

/**
 * Prices a cart from live data. Used for the cart page and again, unchanged, when the order is placed.
 * Staff placing a retail order use it too: `retail` ignores any wholesale account the customer has,
 * and `noDelivery` is for goods handed over at the counter.
 */
export const buildQuote = async (userId: number | undefined, input: QuoteInput, options: { retail?: boolean; noDelivery?: boolean } = {}) => {
  const accountId = options.retail ? null : await wholesaleAccountOf(userId);
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: input.lines.map((l) => l.variantId) } },
    select: {
      id: true, sku: true, title: true, mrp: true, sellingPrice: true, stockQuantity: true, isActive: true, minOrderQuantity: true, maxOrderQuantity: true, b2bMinQuantity: true,
      product: { select: { id: true, name: true, slug: true, status: true, gstPercent: true, brand: { select: { name: true } }, images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } } } },
    },
  });
  const variantById = new Map(variants.map((v) => [v.id, v]));
  // anything deleted since it was put in the cart is dropped, and the page is told so
  const kept = input.lines.filter((l) => variantById.has(l.variantId));
  const removed = input.lines.filter((l) => !variantById.has(l.variantId)).map((l) => l.variantId);

  const wholesale = accountId && kept.length ? await priceB2BCart(accountId, kept) : null;
  const wholesaleLine = new Map(wholesale?.lines.map((l) => [l.variantId, l]) ?? []);

  const lines = kept.map((line) => {
    const variant = variantById.get(line.variantId)!;
    const retailPrice = num(variant.sellingPrice);
    const own = wholesaleLine.get(variant.id);
    const unitPrice = own ? own.unitPrice : retailPrice;
    const minQuantity = accountId ? Math.max(1, variant.b2bMinQuantity) : Math.max(1, variant.minOrderQuantity);
    const maxQuantity = accountId ? variant.stockQuantity : Math.min(variant.stockQuantity, variant.maxOrderQuantity ?? 20);
    return {
      variantId: variant.id, productId: variant.product.id, productName: variant.product.name, slug: variant.product.slug, variantTitle: variant.title, sku: variant.sku,
      brandName: variant.product.brand?.name ?? null, imageUrl: variant.product.images[0]?.url ?? null, gstPercent: num(variant.product.gstPercent),
      quantity: line.quantity, mrp: Math.max(num(variant.mrp), retailPrice), retailPrice, unitPrice, lineTotal: round(unitPrice * line.quantity),
      priceNote: own && own.unitPrice < retailPrice ? own.source : null,
      minQuantity, maxQuantity: Math.max(0, maxQuantity),
      problem:
        variant.product.status !== "ACTIVE" || !variant.isActive ? "No longer on sale"
        : variant.stockQuantity <= 0 ? "Out of stock"
        : line.quantity > variant.stockQuantity ? `Only ${variant.stockQuantity} left`
        : line.quantity < minQuantity ? `Minimum quantity is ${minQuantity}`
        : line.quantity > maxQuantity ? `You can buy up to ${maxQuantity} of this`
        : null,
    };
  });

  const channel: "D2C" | "B2B" = accountId ? "B2B" : "D2C";
  const subtotal = round(lines.reduce((sum, l) => sum + l.lineTotal, 0));
  const mrpTotal = round(lines.reduce((sum, l) => sum + l.mrp * l.quantity, 0));
  const shipping = lines.length && !options.noDelivery ? await shippingFor(channel, subtotal) : { charge: 0, ruleName: null, codAvailable: true, codCharge: 0, freeFrom: null };

  let coupon: { id: number; code: string; discount: number; description: string | null } | null = null;
  let couponError: string | null = null;
  if (input.couponCode && lines.length) {
    const result = await couponFor(input.couponCode, { userId, channel, subtotal, shipping: shipping.charge });
    if (result.ok) coupon = { id: result.id, code: result.code, discount: result.discount, description: result.description };
    else couponError = result.message;
  }

  const codCharge = input.paymentMethod === "COD" ? shipping.codCharge : 0;
  const grandTotal = round(Math.max(0, subtotal - (coupon?.discount ?? 0) + shipping.charge + codCharge));
  return {
    channel, accountId, lines, removed,
    itemCount: lines.reduce((sum, l) => sum + l.quantity, 0),
    mrpTotal, subtotal, savings: round(mrpTotal - subtotal),
    coupon, couponError,
    shippingCharge: shipping.charge, freeDeliveryFrom: shipping.freeFrom, codAvailable: shipping.codAvailable, codCharge,
    grandTotal,
    wholesale: wholesale ? { businessName: wholesale.account.businessName, tier: wholesale.account.tier?.name ?? null, creditLimit: wholesale.account.creditLimit, creditDays: wholesale.account.creditDays } : null,
    onlinePayment: paymentsMode() !== "off",
    onlineTest: paymentsMode() === "test", // no money is taken; only while the gateway keys are missing
  };
};

shopRoutes.post("/quote", async (req, res) => {
  const { accountId: _accountId, ...quote } = await buildQuote(req.user?.id, quoteSchema.parse(req.body));
  res.json(quote);
});

/** Can we deliver to this pincode? Pincodes we have no record of are treated as deliverable. */
shopRoutes.get("/pincode/:pincode", async (req, res) => {
  const pincode = z.string().regex(/^\d{6}$/, "A pincode has 6 digits").parse(req.params.pincode);
  let known = await prisma.pincodeServiceability.findUnique({ where: { pincode } });
  if (shiprocketReady && (!known || known.updatedAt < new Date(Date.now() - 86_400_000))) {
    const settings = await shippingSettings();
    if (settings.pickupPincode) {
      const answer = await serviceability({ from: settings.pickupPincode, to: pincode, weightKg: settings.weightKg, cod: true }).catch(() => null);
      if (answer) {
        const data = { isServiceable: answer.deliverable, codAvailable: answer.codAvailable, deliveryDays: answer.days };
        known = await prisma.pincodeServiceability.upsert({ where: { pincode }, update: data, create: { pincode, ...data } });
      }
    }
  }
  res.json({
    pincode, deliverable: known ? known.isServiceable : true, codAvailable: known ? known.codAvailable : true,
    deliveryDays: known?.deliveryDays ?? null, city: known?.city ?? null, state: known?.state ?? null,
  });
});

// ---------------------------------------------------------------- placing an order

const addressSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the name for delivery").max(120),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number"),
  line1: z.string().trim().min(5, "Enter the house number and street").max(300),
  landmark: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(120).nullable().optional()),
  city: z.string().trim().min(2, "Enter the city").max(80),
  state: z.string().trim().min(2, "Choose the state").max(80),
  pincode: z.string().trim().regex(/^\d{6}$/, "A pincode has 6 digits"),
});

const checkoutSchema = quoteSchema.extend({
  lines: linesSchema.min(1, "Your cart is empty"),
  address: addressSchema,
  saveAddress: z.boolean().default(true),
  note: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(500).nullable().optional()),
  expectedTotal: z.coerce.number().optional(), // what the page showed; a mismatch means prices moved
  prescriptionId: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.number().int().positive().optional()), // the order is for the medicines on this prescription
});

shopMeRoutes.get("/addresses", async (req, res) => {
  const addresses = await prisma.address.findMany({
    where: { userId: req.user!.id }, orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }], take: 10,
    select: { id: true, fullName: true, phone: true, line1: true, landmark: true, city: true, state: true, pincode: true, isDefault: true },
  });
  res.json({ items: addresses });
});

shopMeRoutes.delete("/addresses/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { count } = await prisma.address.deleteMany({ where: { id, userId: req.user!.id } });
  if (count === 0) throw notFound("Address");
  // if that was the usual address, the most recently used one takes its place
  if (!(await prisma.address.count({ where: { userId: req.user!.id, isDefault: true } }))) {
    const next = await prisma.address.findFirst({ where: { userId: req.user!.id }, orderBy: { updatedAt: "desc" }, select: { id: true } });
    if (next) await prisma.address.update({ where: { id: next.id }, data: { isDefault: true } });
  }
  res.json({ ok: true });
});

shopMeRoutes.post("/checkout", async (req, res) => {
  const input = checkoutSchema.parse(req.body);
  const userId = req.user!.id;
  const quote = await buildQuote(userId, input);

  if (quote.lines.length === 0) throw new HttpError(400, "Your cart is empty");
  const blocked = quote.lines.find((line) => line.problem);
  if (blocked) throw new HttpError(409, `${blocked.productName} (${blocked.variantTitle}): ${blocked.problem}`);
  if (input.couponCode && quote.couponError) throw new HttpError(400, quote.couponError);
  if (input.expectedTotal !== undefined && Math.abs(input.expectedTotal - quote.grandTotal) > 0.5) {
    throw new HttpError(409, "Prices changed while you were checking out. Please look at your cart again.");
  }

  const known = await prisma.pincodeServiceability.findUnique({ where: { pincode: input.address.pincode } });
  if (known && !known.isServiceable) throw new HttpError(400, "We do not deliver to this pincode yet");
  if (input.paymentMethod === "COD" && (!quote.codAvailable || (known && !known.codAvailable))) throw new HttpError(400, "Pay on delivery is not available for this order");
  const mode = paymentsMode();
  if (input.paymentMethod === "ONLINE" && mode === "off") throw new HttpError(501, "Online payment is not connected yet. Choose pay on delivery.");

  const account = quote.accountId
    ? await prisma.b2BAccount.findUnique({ where: { id: quote.accountId }, select: { id: true, businessName: true, gstNumber: true, creditLimit: true } })
    : null;
  if (input.paymentMethod === "CREDIT") {
    if (!account) throw new HttpError(400, "Buying on credit is only for wholesale accounts");
    const owed = await prisma.order.aggregate({
      where: { b2bAccountId: account.id, paymentMethod: "CREDIT", paymentStatus: { in: ["PENDING", "PARTIALLY_PAID"] }, status: { notIn: ["CANCELLED", "RETURNED", "REFUNDED"] } },
      _sum: { grandTotal: true },
    });
    const limit = num(account.creditLimit);
    if (num(owed._sum.grandTotal) + quote.grandTotal > limit) {
      throw new HttpError(400, limit === 0 ? "Your account has no credit limit yet. Choose another way to pay." : "This order would go over your credit limit. Choose another way to pay.");
    }
  }

  const prescription = input.prescriptionId
    ? await prisma.prescription.findFirst({ where: { id: input.prescriptionId, patientId: userId, status: "ISSUED" }, select: { id: true, prescriptionNumber: true } })
    : null;
  if (input.prescriptionId && !prescription) throw new HttpError(400, "That prescription could not be found");

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, email: true } });
  const orderNumber = await newOrderNumber();
  const paidNow = input.paymentMethod === "ONLINE" && mode === "test"; // with the gateway, the order is paid once PhonePe confirms it
  const now = new Date();
  const { address } = input;
  const addressText = [address.line1, address.landmark ? `Near ${address.landmark}` : null].filter(Boolean).join(", ");

  const waitsForPayment = input.paymentMethod === "ONLINE" && !paidNow;

  const order = await prisma.$transaction(async (tx) => {
    // take the stock first; if another order got there before us, stop
    for (const line of quote.lines) {
      const taken = await tx.productVariant.updateMany({ where: { id: line.variantId, stockQuantity: { gte: line.quantity } }, data: { stockQuantity: { decrement: line.quantity } } });
      if (taken.count === 0) throw new HttpError(409, `${line.productName} (${line.variantTitle}) just went out of stock`);
    }

    const created = await tx.order.create({
      data: {
        orderNumber, channel: quote.channel, userId, b2bAccountId: account?.id ?? null, prescriptionId: prescription?.id ?? null,
        // only an order still waiting for its online payment stays "pending"; everything else is confirmed at once
        status: waitsForPayment ? "PENDING" : "CONFIRMED", confirmedAt: waitsForPayment ? null : now,
        paymentMethod: input.paymentMethod, paymentStatus: paidNow ? "PAID" : "PENDING",
        subtotal: quote.subtotal, discountTotal: quote.savings, couponCode: quote.coupon?.code ?? null, couponDiscount: quote.coupon?.discount ?? 0,
        shippingCharge: quote.shippingCharge, codCharge: quote.codCharge, grandTotal: quote.grandTotal,
        customerName: address.fullName, customerPhone: address.phone, customerEmail: user?.email ?? null,
        shippingAddress: addressText, shippingCity: address.city, shippingState: address.state, shippingPincode: address.pincode,
        billingName: account?.businessName ?? null, billingGstNumber: account?.gstNumber ?? null,
        customerNote: input.note ?? null,
        items: {
          create: quote.lines.map((line) => ({
            productId: line.productId, variantId: line.variantId, productName: line.productName, variantTitle: line.variantTitle, sku: line.sku,
            brandName: line.brandName, imageUrl: line.imageUrl, quantity: line.quantity, mrp: line.mrp, unitPrice: line.unitPrice,
            discount: round((line.mrp - line.unitPrice) * line.quantity), gstPercent: line.gstPercent, lineTotal: line.lineTotal,
          })),
        },
        history: { create: { status: waitsForPayment ? "PENDING" : "CONFIRMED", note: prescription ? `Placed from prescription ${prescription.prescriptionNumber}` : quote.channel === "B2B" ? "Wholesale order placed on the website" : "Placed on the website", changedById: userId } },
        payments: paidNow
          ? { create: { userId, provider: "TEST", method: "TEST", providerRef: `test_${randomBytes(8).toString("hex")}`, amount: quote.grandTotal, status: "SUCCESS", paidAt: now } }
          : undefined,
      },
    });

    for (const line of quote.lines) {
      const after = await tx.productVariant.findUnique({ where: { id: line.variantId }, select: { stockQuantity: true } });
      await tx.inventoryMovement.create({ data: { variantId: line.variantId, type: "SALE", quantity: -line.quantity, balanceAfter: after?.stockQuantity ?? 0, orderId: created.id, note: `Order ${orderNumber}` } });
    }
    if (quote.coupon) {
      await tx.coupon.update({ where: { id: quote.coupon.id }, data: { usedCount: { increment: 1 } } });
      await tx.couponRedemption.create({ data: { couponId: quote.coupon.id, userId, orderId: created.id } });
    }
    if (input.saveAddress) {
      const same = await tx.address.findFirst({ where: { userId, line1: address.line1, pincode: address.pincode } });
      await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      const data = { fullName: address.fullName, phone: address.phone, line1: address.line1, landmark: address.landmark ?? null, city: address.city, state: address.state, pincode: address.pincode, isDefault: true };
      if (same) await tx.address.update({ where: { id: same.id }, data });
      else await tx.address.create({ data: { userId, ...data } });
    }
    if (!user?.firstName) await tx.user.update({ where: { id: userId }, data: { firstName: address.fullName } });
    return created;
  });

  // the order exists and holds its stock; now the customer pays for it on the gateway's page
  let payUrl: string | null = null;
  if (input.paymentMethod === "ONLINE" && mode === "gateway") {
    const returnTo = `${quote.channel === "B2B" ? "/doctor/orders" : "/patient/orders"}/${order.id}`;
    payUrl = await startPayment({ userId, amount: quote.grandTotal, phone: address.phone, orderId: order.id, returnTo })
      .then((started) => started.payUrl)
      .catch(() => null); // the order page offers "Pay now" to try again
  }
  // paying online: everyone hears about the order once the money has arrived
  if (input.paymentMethod !== "ONLINE" || paidNow) events.orderPlaced(order.id);
  res.status(201).json({ id: order.id, orderNumber, total: quote.grandTotal, paid: paidNow, payUrl });
});

// ---------------------------------------------------------------- one of my orders

shopMeRoutes.get("/orders/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const order = await prisma.order.findFirst({
    where: { id, userId: req.user!.id },
    select: {
      id: true, orderNumber: true, channel: true, status: true, paymentMethod: true, paymentStatus: true, placedAt: true, estimatedDelivery: true,
      subtotal: true, couponCode: true, couponDiscount: true, shippingCharge: true, codCharge: true, grandTotal: true,
      customerName: true, customerPhone: true, shippingAddress: true, shippingCity: true, shippingState: true, shippingPincode: true,
      billingName: true, billingGstNumber: true, cancelReason: true, invoiceNumber: true,
      items: { select: { id: true, productName: true, variantTitle: true, brandName: true, imageUrl: true, quantity: true, mrp: true, unitPrice: true, lineTotal: true, product: { select: { slug: true } } } },
      history: { orderBy: { createdAt: "asc" }, select: { status: true, note: true, createdAt: true } },
      shipments: { select: { carrier: true, trackingNumber: true, trackingUrl: true, status: true } },
    },
  });
  if (!order) throw notFound("Order");
  res.json({
    ...order,
    subtotal: num(order.subtotal), couponDiscount: num(order.couponDiscount), shippingCharge: num(order.shippingCharge), codCharge: num(order.codCharge), grandTotal: num(order.grandTotal),
    items: order.items.map(({ product, ...item }) => ({ ...item, slug: product?.slug ?? null, mrp: numOrNull(item.mrp), unitPrice: num(item.unitPrice), lineTotal: num(item.lineTotal) })),
    canCancel: customerCanCancel(order.status, order.shipments),
    canPay: order.paymentMethod === "ONLINE" && order.paymentStatus !== "PAID" && order.status !== "CANCELLED" && paymentsMode() === "gateway",
  });
});

// Pay for an order that was placed to be paid online but is not paid yet (the first try failed or was abandoned).
shopMeRoutes.post("/orders/:id/pay", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const order = await prisma.order.findFirst({ where: { id, userId: req.user!.id }, select: { id: true, channel: true, status: true, paymentMethod: true, paymentStatus: true, grandTotal: true, customerPhone: true } });
  if (!order) throw notFound("Order");
  if (order.paymentMethod !== "ONLINE") throw new HttpError(400, "This order is not paid online");
  if (order.paymentStatus === "PAID") throw new HttpError(400, "This order is already paid");
  if (order.status === "CANCELLED") throw new HttpError(400, "This order was cancelled");
  const { payUrl } = await startPayment({
    userId: req.user!.id, amount: num(order.grandTotal), phone: order.customerPhone, orderId: order.id,
    returnTo: `${order.channel === "B2B" ? "/doctor/orders" : "/patient/orders"}/${order.id}`,
  });
  res.json({ payUrl });
});

shopMeRoutes.get("/orders/:id/invoice", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const mine = await prisma.order.findFirst({ where: { id, userId: req.user!.id }, select: { invoiceNumber: true } });
  if (!mine?.invoiceNumber) throw notFound("Invoice");
  const { number, pdf } = await invoicePdf(id);
  res.setHeader("content-type", "application/pdf");
  res.setHeader("content-disposition", `inline; filename="Invoice-${number.replace(/\//g, "-")}.pdf"`);
  res.send(pdf);
});

/** Until the courier has picked the parcel up, the customer can still cancel; a booked pickup is called off. */
const customerCanCancel = (status: string, shipments: { status: string }[]) =>
  ["PENDING", "CONFIRMED", "PROCESSING", "PACKED"].includes(status) && shipments.every((s) => ["PENDING", "PICKUP_SCHEDULED", "CANCELLED"].includes(s.status));

/** The customer cancels their order. The stock goes back on the shelf. */
shopMeRoutes.post("/orders/:id/cancel", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const reason = z.object({ reason: z.string().trim().max(300).optional() }).parse(req.body ?? {}).reason || "Cancelled by the customer";
  const order = await prisma.order.findFirst({ where: { id, userId: req.user!.id }, select: { status: true, shipments: { select: { status: true } } } });
  if (!order) throw notFound("Order");
  if (!customerCanCancel(order.status, order.shipments)) throw new HttpError(400, "This order has already left with the courier and can no longer be cancelled here. Please contact us.");

  const cancelled = await prisma.$transaction((tx) => cancelOrderAndRestock(tx, id, reason, req.user!.id, ["PENDING", "CONFIRMED", "PROCESSING", "PACKED"]));
  if (!cancelled) throw new HttpError(409, "This order has just changed. Please reload the page.");
  events.orderCancelled(id);
  res.json({ ok: true });
});
