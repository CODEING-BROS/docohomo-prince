import type { OrderStatus, Prisma } from "../generated/prisma/client";
import { htmlToText } from "./text";

// Turns the old site's data (already copied into its staging tables) into the new tables.
// Used by the terminal command (src/scripts/import-legacy.ts) and by Admin → Import from old site
// (lib/legacy-import.ts). It only inserts: emptying the tables first is the caller's job.
// Products that only differed by pack size in the old system become one product with several variants.

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Row = Record<string, any>;
/** The database to write to: the client itself, or one transaction of it. */
export type Db = Prisma.TransactionClient;
export type LoadOptions = {
  /** Added to every old customer id, so customers never collide with staff accounts that were kept. */
  userIdShift?: number;
  /** Old admin accounts with one of these emails are skipped: that person already has an account here. */
  skipStaffEmails?: Set<string>;
  log?: (line: string) => void;
};

// ---- helpers
const clean = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" || s.toLowerCase() === "n/a" || s.toLowerCase() === "n/f" ? null : s;
};
const norm = (v: unknown) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 110) || "item";
const uniqueSlug = (used: Set<string>, base: string) => {
  let slug = base;
  for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
  used.add(slug);
  return slug;
};

// "30ml", "100 gm", "75tab" in a product name -> "30 ml", "100 g", "75 tablets"
const UNITS: Record<string, string> = {
  ml: "ml", l: "l", ltr: "l", g: "g", gm: "g", gms: "g", kg: "kg",
  tab: "tablets", tabs: "tablets", tablet: "tablets", tablets: "tablets",
  cap: "capsules", caps: "capsules", capsule: "capsules", capsules: "capsules",
  pc: "pcs", pcs: "pcs",
};
const packSizeOf = (name: string) => {
  const m = name.match(/(\d+(?:\.\d+)?)\s?(ml|ltr|l|gms|gm|g|kg|tablets|tablet|tabs|tab|capsules|capsule|caps|cap|pcs|pc)\b/i);
  return m ? `${m[1]} ${UNITS[m[2].toLowerCase()]}` : null;
};
// "30 CH", "200c", "6x", "1M", "CM", mother tincture "Q"
const potencyOf = (name: string) => {
  const m = name.match(/\b(\d{1,4})\s?(ch|c|x)\b/i) ?? name.match(/\b(\d{1,2})\s?(m)\b/i);
  if (m) return `${m[1]}${m[2].toLowerCase() === "m" ? "M" : " " + m[2].toUpperCase()}`.replace(/ C$/, " CH");
  if (/\b(cm)\b/i.test(name)) return "CM";
  if (/\bq\b|mother tincture/i.test(name)) return "Q";
  return null;
};
const FORMS: [RegExp, string][] = [
  [/mother tincture|\bq\b/i, "Mother Tincture"],
  [/bio ?combination/i, "Bio Combination"],
  [/biochemic/i, "Biochemic"],
  [/dilution|\b\d{1,4}\s?(ch|c|x)\b|\b\d{1,2}\s?m\b/i, "Dilution"],
  [/trituration/i, "Trituration"],
  [/syrup|tonic/i, "Syrup"],
  [/drops?\b/i, "Drops"],
  [/tablets?|tabs?\b/i, "Tablets"],
  [/capsules?/i, "Capsules"],
  [/ointment|cream|gel\b/i, "Ointment / Cream"],
  [/shampoo/i, "Shampoo"],
  [/\boil\b/i, "Oil"],
  [/soap|face ?wash/i, "Soap / Face Wash"],
  [/powder/i, "Powder"],
];
const formOf = (name: string) => FORMS.find(([re]) => re.test(name))?.[1] ?? null;

const ORDER_STATUS: [RegExp, OrderStatus][] = [
  [/deliver(ed)?$/i, "DELIVERED"],
  [/cancel/i, "CANCELLED"],
  [/refused|not available|undelivered|wrong address|lost/i, "UNDELIVERED"],
  [/out for delivery/i, "OUT_FOR_DELIVERY"],
  [/ship|dispatch/i, "SHIPPED"],
  [/pack/i, "PACKED"],
  [/process/i, "PROCESSING"],
  [/confirm/i, "CONFIRMED"],
  [/refund/i, "REFUNDED"],
  [/return/i, "RETURNED"],
];
const orderStatusOf = (text: string): OrderStatus => ORDER_STATUS.find(([re]) => re.test(text))?.[1] ?? "PENDING";

const to24h = (text: unknown) => {
  const m = String(text ?? "").trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return null;
  let hour = Number(m[1]);
  if (m[3]?.toLowerCase() === "pm" && hour < 12) hour += 12;
  if (m[3]?.toLowerCase() === "am" && hour === 12) hour = 0;
  return hour > 23 ? null : `${String(hour).padStart(2, "0")}:${m[2] ?? "00"}`;
};

export const loadFromLegacy = async (db: Db, read: (sql: string) => Promise<Row[]>, options: LoadOptions = {}) => {
  const log = options.log ?? ((line: string) => console.log(line));
  const shift = options.userIdShift ?? 0;
  const counts: Record<string, number> = {};
  const insert = async <T>(label: string, rows: T[], save: (chunk: T[]) => Promise<unknown>, size = 500) => {
    for (let i = 0; i < rows.length; i += size) await save(rows.slice(i, i + size));
    counts[label] = rows.length;
    log(`${String(rows.length).padStart(7)}  ${label}`);
  };

  // ---- customers (ids kept, so orders can point at them directly)
  const users = await read("SELECT * FROM users ORDER BY id");
  await insert("customers", users.map((u): Prisma.UserCreateManyInput => ({
    id: u.id + shift,
    role: "CUSTOMER",
    firstName: clean(u.first_name) ?? clean(u.username),
    lastName: clean(u.last_name),
    email: clean(u.email)?.toLowerCase() ?? null,
    phone: String(u.phone_number),
    gender: /^m/i.test(u.gender ?? "") ? "MALE" : /^f/i.test(u.gender ?? "") ? "FEMALE" : null,
    phoneVerifiedAt: u.is_verified ? (u.created_at ?? u.joined_at) : null,
    rewardPoints: u.reward_points ?? 0,
    legacyId: u.mongo_id,
    createdAt: u.created_at ?? u.joined_at ?? new Date(),
    updatedAt: u.updated_at ?? u.created_at ?? new Date(),
  })), (data) => db.user.createMany({ data }));

  await insert("customer addresses", users.filter((u) => clean(u.address) || clean(u.house_number)).map((u): Prisma.AddressCreateManyInput => ({
    userId: u.id + shift,
    label: "Home",
    fullName: [clean(u.first_name), clean(u.last_name)].filter(Boolean).join(" ") || null,
    phone: String(u.phone_number),
    line1: [clean(u.house_number), clean(u.address)].filter(Boolean).join(", "),
    city: clean(u.city) ?? clean(u.town),
    state: clean(u.state),
    pincode: clean(u.pincode),
    country: clean(u.country) ?? "India",
    isDefault: true,
  })), (data) => db.address.createMany({ data }));

  // ---- categories (ids kept)
  const categories = await read("SELECT * FROM categories ORDER BY level, id");
  const categorySlugs = new Set<string>();
  const slugByCategory = new Map<number, string>();
  await insert("categories", categories.map((c): Prisma.CategoryCreateManyInput => {
    const own = slugify(c.name);
    const parentSlug = c.parent_id ? slugByCategory.get(c.parent_id) : null;
    const slug = uniqueSlug(categorySlugs, categorySlugs.has(own) && parentSlug ? `${parentSlug}-${own}` : own);
    slugByCategory.set(c.id, slug);
    return {
      id: c.id, parentId: c.parent_id, name: c.name.trim(), slug, imageUrl: clean(c.image_url),
      legacyId: clean(c.mongo_id), createdAt: c.created_at ?? new Date(), updatedAt: c.updated_at ?? new Date(),
    };
  }), (data) => db.category.createMany({ data }));

  // ---- brands (ids kept)
  const brands = await read("SELECT * FROM brands ORDER BY id");
  const brandSlugs = new Set<string>();
  const brandName = new Map<number, string>(brands.map((b) => [b.id, b.name.trim()]));
  await insert("brands", brands.map((b): Prisma.BrandCreateManyInput => ({
    id: b.id, name: b.name.trim(), slug: uniqueSlug(brandSlugs, slugify(b.name)), logoUrl: clean(b.image_url),
    legacyId: clean(b.mongo_id), createdAt: b.created_at ?? new Date(), updatedAt: b.updated_at ?? new Date(),
  })), (data) => db.brand.createMany({ data }));

  // ---- products: old rows with the same brand and product code are pack sizes of one product
  const oldProducts = await read("SELECT * FROM products ORDER BY id");
  const groups = new Map<string, Row[]>();
  for (const p of oldProducts) {
    const key = clean(p.sku) && p.brand_id ? `${p.brand_id}|${norm(p.sku)}` : `single|${p.id}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }

  const productRows: Prisma.ProductCreateManyInput[] = [];
  const variantRows: Prisma.ProductVariantCreateManyInput[] = [];
  const productOfVariant = new Map<number, number>(); // old product id (= new variant id) -> new product id
  const variantIsShared = new Set<number>(); // variants of a product that has more than one
  const productSlugs = new Set<string>();
  let merged = 0;

  for (const members of groups.values()) {
    members.sort((a, b) => (a.sale_price || a.regular_price) - (b.sale_price || b.regular_price) || a.id - b.id);
    const first = members[0];
    const productId = productRows.length + 1;
    const isGroup = members.length > 1;
    if (isGroup) merged += members.length;
    // a product code that reads like a name ("SBL Arnica Montana Q") is the cleanest shared name
    const name = isGroup && /\s/.test(first.sku.trim()) ? first.sku.trim() : first.name.trim();
    const longest = (field: string) =>
      members.map((m) => clean(m[field])).filter(Boolean).sort((a, b) => b!.length - a!.length)[0] ?? null;

    productRows.push({
      id: productId,
      name,
      slug: uniqueSlug(productSlugs, slugify(name)),
      brandId: first.brand_id,
      categoryId: first.category_id,
      form: formOf(`${first.name} ${first.category_name ?? ""} ${first.subcategory_name ?? ""}`),
      shortDescription: htmlToText(longest("sub_description")),
      description: htmlToText(longest("description")),
      status: "ACTIVE",
      isNewArrival: members.some((m) => m.is_new_arrival),
      isTrending: members.some((m) => m.is_trending),
      legacyId: first.mongo_id,
      legacyCode: clean(first.code),
      createdAt: new Date(Math.min(...members.map((m) => +(m.created_at ?? new Date())))),
      updatedAt: new Date(Math.max(...members.map((m) => +(m.updated_at ?? new Date())))),
    });

    const titles = members.map((m) => [potencyOf(m.name), packSizeOf(m.name)].filter(Boolean).join(" · "));
    members.forEach((m, index) => {
      const selling = m.sale_price || m.regular_price || 0;
      // two old rows of the same size were duplicates of each other; number them so they stay distinct
      const copy = titles.slice(0, index).filter((t) => t === titles[index]).length + 1;
      const baseTitle = titles[index] || (isGroup ? m.name.trim() : "Standard");
      productOfVariant.set(m.id, productId);
      if (isGroup) variantIsShared.add(m.id);
      variantRows.push({
        id: m.id,
        productId,
        sku: `DH-${String(m.id).padStart(6, "0")}`,
        title: copy > 1 && titles[index] ? `${baseTitle} (${copy})` : baseTitle,
        packSize: packSizeOf(m.name),
        potency: potencyOf(m.name),
        mrp: Math.max(m.regular_price || 0, selling),
        sellingPrice: selling,
        stockQuantity: Math.max(0, m.stock_quantity ?? 0),
        minOrderQuantity: m.min_order_quantity > 0 ? m.min_order_quantity : 1,
        maxOrderQuantity: m.max_order_quantity > 0 ? m.max_order_quantity : null,
        isDefault: index === 0,
        sortOrder: index,
        legacyId: m.mongo_id,
        createdAt: m.created_at ?? new Date(),
        updatedAt: m.updated_at ?? new Date(),
      });
    });
  }
  await insert("products", productRows, (data) => db.product.createMany({ data }));
  await insert("product variants", variantRows, (data) => db.productVariant.createMany({ data }));

  const seenImages = new Set<string>();
  const images = (await read("SELECT * FROM product_images ORDER BY product_id, position"))
    .filter((i) => clean(i.image_url) && productOfVariant.has(i.product_id))
    .filter((i) => {
      const key = `${productOfVariant.get(i.product_id)}|${i.image_url}`;
      return seenImages.has(key) ? false : seenImages.add(key);
    });
  await insert("product images", images.map((i): Prisma.ProductImageCreateManyInput => ({
    productId: productOfVariant.get(i.product_id)!,
    variantId: variantIsShared.has(i.product_id) ? i.product_id : null,
    url: i.image_url,
    sortOrder: i.position ?? 0,
  })), (data) => db.productImage.createMany({ data }));

  const userIds = new Set(users.map((u) => u.id));
  const reviews = (await read("SELECT * FROM product_reviews ORDER BY id")).filter((r) => productOfVariant.has(r.product_id));
  await insert("product reviews", reviews.map((r): Prisma.ProductReviewCreateManyInput => {
    const when = new Date(r.reviewed_on ?? "");
    return {
      productId: productOfVariant.get(r.product_id)!,
      userId: userIds.has(r.user_id) ? r.user_id + shift : null,
      authorName: clean(r.username),
      rating: Math.min(5, Math.max(1, Math.round(r.rating || 5))),
      body: clean(r.body),
      status: "APPROVED",
      ...(Number.isNaN(+when) ? {} : { createdAt: when }),
    };
  }), (data) => db.productReview.createMany({ data }));

  await insert("opening stock entries", variantRows.filter((v) => (v.stockQuantity ?? 0) > 0).map((v): Prisma.InventoryMovementCreateManyInput => ({
    variantId: v.id!, type: "OPENING", quantity: v.stockQuantity!, balanceAfter: v.stockQuantity!, note: "Stock carried over from the old system",
  })), (data) => db.inventoryMovement.createMany({ data }));

  // ---- orders (ids kept)
  const orders = await read("SELECT *, estimated_delivery_date::text AS est_day FROM orders ORDER BY id");
  const items = await read("SELECT * FROM order_items ORDER BY id");
  const subtotalByOrder = new Map<number, number>();
  for (const i of items) {
    subtotalByOrder.set(i.order_id, (subtotalByOrder.get(i.order_id) ?? 0) + (i.unit_price ?? 0) * (i.quantity ?? 1));
  }
  const statusByOrder = new Map<number, OrderStatus>();

  await insert("orders", orders.map((o): Prisma.OrderCreateManyInput => {
    const status = orderStatusOf(o.status);
    const cod = o.payment_method === "cod";
    statusByOrder.set(o.id, status);
    return {
      id: o.id,
      orderNumber: o.order_code,
      channel: "D2C",
      userId: userIds.has(o.user_id) ? o.user_id + shift : null,
      status,
      paymentMethod: cod ? "COD" : "ONLINE",
      paymentStatus: !cod || status === "DELIVERED" ? "PAID" : "PENDING",
      subtotal: subtotalByOrder.get(o.id) ?? 0,
      shippingCharge: o.delivery_charges ?? 0,
      grandTotal: o.total_amount ?? 0,
      customerName: clean(o.customer_name),
      customerPhone: clean(o.customer_phone),
      customerEmail: clean(o.customer_email),
      shippingAddress: clean(o.shipping_address),
      shippingCity: clean(o.town),
      shippingState: clean(o.state),
      shippingPincode: clean(o.pincode),
      placedAt: o.created_at ?? new Date(),
      estimatedDelivery: o.est_day ? new Date(`${o.est_day}T00:00:00Z`) : null,
      legacyId: o.mongo_id,
      legacyStatus: o.status,
      createdAt: o.created_at ?? new Date(),
      updatedAt: o.updated_at ?? o.created_at ?? new Date(),
    };
  }), (data) => db.order.createMany({ data }));

  await insert("order items", items.map((i): Prisma.OrderItemCreateManyInput => {
    const known = productOfVariant.has(i.product_id);
    return {
      orderId: i.order_id,
      variantId: known ? i.product_id : null,
      productId: known ? productOfVariant.get(i.product_id)! : null,
      productName: clean(i.name) ?? "Unknown product",
      sku: known ? `DH-${String(i.product_id).padStart(6, "0")}` : clean(i.product_code),
      brandName: clean(i.brand) ?? (known ? null : null),
      imageUrl: clean(i.image_url),
      quantity: i.quantity ?? 1,
      mrp: i.regular_price,
      unitPrice: i.unit_price ?? 0,
      lineTotal: (i.unit_price ?? 0) * (i.quantity ?? 1),
    };
  }), (data) => db.orderItem.createMany({ data }));

  await insert("order status history", orders.map((o): Prisma.OrderStatusHistoryCreateManyInput => ({
    orderId: o.id, status: statusByOrder.get(o.id)!, note: `Imported from the old system ("${o.status}")`,
    createdAt: o.updated_at ?? o.created_at ?? new Date(),
  })), (data) => db.orderStatusHistory.createMany({ data }));

  await insert("order payments", orders.filter((o) => o.payment_method !== "cod").map((o): Prisma.PaymentCreateManyInput => ({
    orderId: o.id, userId: userIds.has(o.user_id) ? o.user_id + shift : null, provider: "PHONEPE",
    providerRef: clean(o.transaction_id), amount: o.total_amount ?? 0, status: "SUCCESS",
    paidAt: o.created_at, createdAt: o.created_at ?? new Date(), updatedAt: o.updated_at ?? new Date(),
  })), (data) => db.payment.createMany({ data }));

  await insert("older payment records", (await read("SELECT * FROM payment_history ORDER BY id")).map((p): Prisma.PaymentCreateManyInput => ({
    provider: "RAZORPAY", providerRef: clean(p.razorpay_payment_id), amount: p.amount ?? 0, status: "SUCCESS",
    rawResponse: { razorpayOrderId: p.razorpay_order_id, userRef: p.user_ref },
    paidAt: p.created_at, createdAt: p.created_at ?? new Date(), updatedAt: p.updated_at ?? new Date(),
  })), (data) => db.payment.createMany({ data }));

  // the rows above were inserted with their old ids; move the id counters past them
  for (const table of ["User", "Category", "Brand", "Product", "ProductVariant", "Order"]) {
    await db.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), GREATEST((SELECT coalesce(max(id), 0) FROM "${table}"), 1))`,
    );
  }

  // ---- staff from the old admin panel (they keep their passwords)
  await insert("staff accounts", (await read("SELECT * FROM admins ORDER BY id")).filter((a) => !options.skipStaffEmails?.has(String(a.email).toLowerCase())).map((a): Prisma.UserCreateManyInput => ({
    role: "ADMIN", firstName: a.name, email: a.email.toLowerCase(), passwordHash: a.password_hash,
    legacyId: a.mongo_id, createdAt: a.created_at ?? new Date(), updatedAt: a.updated_at ?? new Date(),
  })), (data) => db.user.createMany({ data }));

  // ---- coupons, delivery charge, banners
  await insert("coupons", (await read("SELECT * FROM coupons ORDER BY id")).map((c): Prisma.CouponCreateManyInput => ({
    code: c.code.trim().toUpperCase(), description: clean(c.description),
    type: /percent/i.test(c.discount_type ?? "") ? "PERCENT" : "FLAT", value: c.discount_value ?? 0,
    minOrderValue: c.has_order_cap ? c.order_cap : null, expiresAt: c.expires_at, legacyId: c.mongo_id,
  })), (data) => db.coupon.createMany({ data }));

  await insert("shipping rules", (await read("SELECT * FROM delivery_rules ORDER BY id")).flatMap((d): Prisma.ShippingRuleCreateManyInput[] => [
    { name: "Standard delivery", minOrderValue: 0, maxOrderValue: d.order_cap, charge: d.charge },
    { name: "Free delivery", minOrderValue: d.order_cap, charge: 0 },
  ]), (data) => db.shippingRule.createMany({ data }));

  await insert("banners", (await read("SELECT * FROM banners ORDER BY id")).map((b, index): Prisma.BannerCreateManyInput => ({
    imageUrl: b.image_url, platform: b.placement === "mobile" ? "MOBILE" : "DESKTOP", sortOrder: index,
    legacyId: b.mongo_id, createdAt: b.created_at ?? new Date(), updatedAt: b.updated_at ?? new Date(),
  })), (data) => db.banner.createMany({ data }));

  // ---- blog
  const blogCategoryId = new Map<number, number>();
  const blogCategorySlugs = new Set<string>();
  for (const c of await read("SELECT * FROM blog_categories ORDER BY id")) {
    const created = await db.blogCategory.create({ data: { name: c.name.trim(), slug: uniqueSlug(blogCategorySlugs, slugify(c.name)) } });
    blogCategoryId.set(c.id, created.id);
  }
  const sections = await read("SELECT * FROM blog_sections ORDER BY blog_id, position");
  const postSlugs = new Set<string>();
  await insert("blog posts", (await read("SELECT * FROM blogs ORDER BY id")).map((b): Prisma.BlogPostCreateManyInput => ({
    title: b.title.trim(),
    slug: uniqueSlug(postSlugs, slugify(b.slug || b.title)),
    categoryId: blogCategoryId.get(b.category_id) ?? null,
    excerpt: clean(b.meta_description),
    content: [clean(b.body), ...sections.filter((s) => s.blog_id === b.id).map((s) => `<h2>${s.title ?? ""}</h2>\n${s.body ?? ""}`)].filter(Boolean).join("\n\n"),
    coverImageUrl: clean(b.image_url),
    authorName: clean(b.author_name), authorBio: clean(b.author_bio), authorImageUrl: clean(b.author_image_url),
    status: "PUBLISHED", publishedAt: b.created_at,
    seoTitle: clean(b.meta_title), seoDescription: clean(b.meta_description),
    legacyId: b.mongo_id, createdAt: b.created_at ?? new Date(), updatedAt: b.updated_at ?? new Date(),
  })), (data) => db.blogPost.createMany({ data }));

  // ---- doctors already listed on the old site count as verified
  const doctors = await read("SELECT * FROM doctors ORDER BY id");
  const doctorSlugs = new Set<string>();
  for (const d of doctors) {
    const start = to24h(d.start_time);
    const end = to24h(d.end_time);
    await db.user.create({
      data: {
        role: "DOCTOR",
        firstName: d.name.trim(),
        createdAt: d.created_at ?? new Date(),
        doctorProfile: {
          create: {
            slug: uniqueSlug(doctorSlugs, slugify(d.name)),
            displayName: d.name.trim(),
            photoUrl: clean(d.image_url),
            stream: "Homeopathy",
            specialization: clean(d.specialization),
            experienceYears: d.experience_years,
            languages: String(d.languages ?? "").split(/,|\/|&|\band\b/i).map((l) => l.trim()).filter(Boolean),
            bio: htmlToText(clean(d.description)),
            verificationStatus: "APPROVED",
            verifiedAt: d.created_at,
            acceptsConsultations: d.is_available !== false,
            videoFee: d.video_fee,
            audioFee: d.call_fee,
            legacyId: d.mongo_id,
            createdAt: d.created_at ?? new Date(),
            availability:
              start && end && start < end
                ? { create: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, startTime: start, endTime: end })) }
                : undefined,
          },
        },
      },
    });
  }
  counts.doctors = doctors.length;
  log(`${String(doctors.length).padStart(7)}  doctors`);

  // ---- enquiries from the four old forms
  const enquiries: Prisma.EnquiryCreateManyInput[] = [
    ...(await read("SELECT * FROM contact_messages ORDER BY id")).map((c): Prisma.EnquiryCreateManyInput => ({
      type: "CONTACT", name: clean(c.name), email: clean(c.email), phone: clean(c.phone_number), message: clean(c.message),
      status: c.is_read ? "CLOSED" : "NEW", legacyId: c.mongo_id, createdAt: c.created_at ?? new Date(), updatedAt: c.updated_at ?? new Date(),
    })),
    ...(await read("SELECT * FROM wholesale_enquiries ORDER BY id")).map((w): Prisma.EnquiryCreateManyInput => ({
      type: "WHOLESALE", name: clean(w.name), email: clean(w.email), phone: clean(w.phone_number), message: clean(w.message),
      details: { productCode: w.product_code, productName: w.product_name, quantity: w.quantity, country: w.country },
      legacyId: w.mongo_id, createdAt: w.created_at ?? new Date(), updatedAt: w.updated_at ?? new Date(),
    })),
    ...(await read("SELECT * FROM doctor_enquiries ORDER BY id")).map((e): Prisma.EnquiryCreateManyInput => ({
      type: "DOCTOR_CONSULTATION", name: clean(e.patient_name), phone: clean(e.phone_number), message: clean(e.message),
      details: { doctorCode: e.doctor_code, doctorName: e.doctor_name, consultationType: e.consultation_type },
      legacyId: e.mongo_id, createdAt: e.created_at ?? new Date(), updatedAt: e.updated_at ?? new Date(),
    })),
    ...(await read("SELECT * FROM order_enquiries ORDER BY id")).map((e): Prisma.EnquiryCreateManyInput => ({
      type: "ORDER", name: clean(e.username), phone: clean(e.phone_number), message: clean(e.message),
      details: { orderRef: e.order_ref, userRef: e.user_ref },
      legacyId: e.mongo_id, createdAt: e.created_at ?? new Date(), updatedAt: e.updated_at ?? new Date(),
    })),
  ];
  await insert("enquiries", enquiries, (data) => db.enquiry.createMany({ data }));

  const multi = productRows.length - [...groups.values()].filter((g) => g.length === 1).length;
  const summary = `${oldProducts.length} old products became ${productRows.length} products; ${multi} of them now have more than one variant (${merged} old products merged).`;
  return { counts, summary };
};
