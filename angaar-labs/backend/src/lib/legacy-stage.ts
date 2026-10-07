import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Db as MongoDb } from "mongodb";
import type pg from "pg";

// Step one of bringing the old site over: copies its MongoDB collections into plain staging tables
// (schema "legacy_import", definitions in prisma/legacy-schema.sql). It only READS the old site
// (find, nothing else) and writes nowhere but the staging schema, so the live tables of this
// database are not touched here. lib/legacy-load.ts then turns the staging tables into the new ones.

/* eslint-disable @typescript-eslint/no-explicit-any */
export const STAGING_SCHEMA = "legacy_import";

// ---- value helpers
const str = (v: any) => (v === undefined || v === null || v === "" ? null : String(v));
const num = (v: any) => {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const int = (v: any) => { const n = num(v); return n === null ? null : Math.round(n); };
const bool = (v: any) => v === true || v === "true";
const date = (v: any) => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const isoDay = (v: any) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && date(v) ? v : null);
const oid = (v: any) => (v && /^[0-9a-f]{24}$/i.test(String(v)) ? String(v) : null);
const norm = (v: any) => String(v || "").trim().toLowerCase();
const isLocalTest = (email: any) => /@local\.test$/i.test(email || "");

/**
 * Rebuilds the staging tables from the old site. `client` must be a connection of its own: the
 * work runs in one transaction on it, so a failure leaves the previous staging tables as they were.
 * Returns how many rows each staging table got, and anything worth telling the person.
 */
export const stageFromMongo = async (db: MongoDb, client: pg.Client, log: (line: string) => void = () => undefined) => {
  const sql = await readFile(path.resolve(process.cwd(), "prisma", "legacy-schema.sql"), "utf8");
  // the definitions only create tables; anything that could drop a schema must never run against this database
  if (/drop\s+schema|create\s+schema|truncate/i.test(sql)) throw new Error("prisma/legacy-schema.sql must only create tables");

  const pg = client;
  // multi-row insert, returns the new ids in row order
  const insert = async (table: string, columns: string[], rows: any[][]): Promise<number[]> => {
    const ids: number[] = [];
    const perChunk = Math.max(1, Math.floor(30000 / columns.length));
    for (let i = 0; i < rows.length; i += perChunk) {
      const chunk = rows.slice(i, i + perChunk);
      const values = chunk.map((_, r) => `(${columns.map((__, c) => `$${r * columns.length + c + 1}`).join(",")})`).join(",");
      const res = await pg.query(`INSERT INTO ${table} (${columns.join(",")}) VALUES ${values} RETURNING id`, chunk.flat());
      ids.push(...res.rows.map((x: any) => Number(x.id)));
    }
    return ids;
  };
  const all = (name: string): Promise<any[]> => db.collection(name).find({}).sort({ _id: 1 }).toArray();
  const notes: string[] = [];

  await pg.query("BEGIN");
  try {
    await pg.query(`DROP SCHEMA IF EXISTS ${STAGING_SCHEMA} CASCADE`);
    await pg.query(`CREATE SCHEMA ${STAGING_SCHEMA}`);
    // only for this transaction, and only the staging schema: nothing below can reach the live tables
    await pg.query(`SET LOCAL search_path TO ${STAGING_SCHEMA}`);
    await pg.query(sql);

    // ---- admins
    const admins = (await all("admins")).filter((a) => !isLocalTest(a.email));
    await insert("admins", ["mongo_id", "name", "email", "password_hash", "role", "created_at", "updated_at"],
      admins.map((a) => [oid(a._id), a.name, a.email, a.password, a.user_type, date(a.createdAt), date(a.updatedAt)]));

    // ---- users
    const users = (await all("users")).filter((u) => !isLocalTest(u.email));
    const userIds = await insert("users",
      ["mongo_id", "user_code", "username", "first_name", "last_name", "email", "phone_number", "alternate_phone", "is_verified",
        "gender", "house_number", "address", "town", "city", "state", "country", "pincode", "business_name", "transport_detail",
        "reward_points", "orders_count", "joined_at", "created_at", "updated_at"],
      users.map((u) => [oid(u._id), str(u.user_id), str(u.username), str(u.firstName), str(u.lastName), str(u.email),
        String(u.phone_number), str(u.alternateMobileNumber), bool(u.veifyedUser), str(u.gender), str(u.houseNumber),
        str(u.address), str(u.town), str(u.city), str(u.state), str(u.country), str(u.pincode), str(u.user_business),
        str(u.transport_detail), int(u.rewords_points) || 0, int(u.orders) || 0, date(u.joining_date), date(u.createdAt), date(u.updatedAt)]));
    const userByMongo = new Map(users.map((u, i) => [String(u._id), userIds[i]]));

    // ---- categories: the "brands" collection holds rows of (main category, category, subcategory[])
    const nodeIds = new Map<string, number>(); // "parentId|name" -> id
    const byNorm = new Map<string, number>(); // "parentId|normalised name" -> id, for matching products
    const node = async (parentId: number | null, level: number, name: string, slug: any, image: any, mongoId: any, doc: any): Promise<number> => {
      const key = `${parentId || 0}|${name}`;
      if (nodeIds.has(key)) return nodeIds.get(key)!;
      const [id] = await insert("categories",
        ["parent_id", "level", "name", "slug", "image_name", "image_url", "image_path", "mongo_id", "created_at", "updated_at"],
        [[parentId, level, name, str(slug) || name, str(image?.image_name), str(image?.image_url), str(image?.path), oid(mongoId), date(doc?.createdAt), date(doc?.updatedAt)]]);
      nodeIds.set(key, id);
      byNorm.set(`${parentId || 0}|${norm(name)}`, id);
      return id;
    };
    for (const row of await all("brands")) {
      if (!row.main_category_name) continue;
      const hasCategory = Boolean(row.category_name);
      const mainId = await node(null, 1, row.main_category_name, row.main_category_slug, row.main_category_image, hasCategory ? null : row._id, row);
      const parentId = hasCategory
        ? await node(mainId, 2, row.category_name, row.category_slug, row.category_image, row._id, row)
        : mainId;
      for (const sub of row.subcategory || []) {
        if (sub?.name) await node(parentId, 3, sub.name, sub.slug, sub.image, sub._id, row);
      }
    }

    // ---- brands: the "categories" collection holds the brands
    const brandByNorm = new Map<string, number>();
    for (const b of await all("categories")) {
      if (!b.main_category_name || brandByNorm.has(norm(b.main_category_name))) continue;
      const img = b.main_category_image;
      const [id] = await insert("brands", ["mongo_id", "name", "slug", "image_name", "image_url", "image_path", "created_at", "updated_at"],
        [[oid(b._id), b.main_category_name, str(b.main_category_slug) || b.main_category_name, str(img?.image_name), str(img?.image_url), str(img?.path), date(b.createdAt), date(b.updatedAt)]]);
      brandByNorm.set(norm(b.main_category_name), id);
    }

    // ---- products
    const categoryFor = (p: any) => {
      const main = byNorm.get(`0|${norm(p.product_main_category)}`);
      if (!main) return null;
      const cat = byNorm.get(`${main}|${norm(p.product_category)}`);
      const sub = byNorm.get(`${cat || main}|${norm(p.product_subcategory)}`);
      return sub || cat || main;
    };
    const products = await all("products");
    let noBrand = 0;
    let noCategory = 0;
    const productIds = await insert("products",
      ["mongo_id", "code", "sku", "name", "slug", "variant", "regular_price", "sale_price", "stock_quantity", "original_quantity",
        "min_order_quantity", "max_order_quantity", "reward_points", "is_new_arrival", "is_trending", "color", "size",
        "brand_id", "category_id", "brand_name", "main_category_name", "category_name", "subcategory_name",
        "description", "sub_description", "created_at", "updated_at"],
      products.map((p) => {
        const brandId = brandByNorm.get(norm(p.product_brand)) || null;
        const categoryId = categoryFor(p);
        if (!brandId) noBrand++;
        if (!categoryId) noCategory++;
        return [oid(p._id), str(p.product_id), str(p.product_code), p.product_name, p.product_slug || p.product_name, str(p.product_variant),
          num(p.product_regular_price) || 0, num(p.product_sale_price) || 0, int(p.quantity) || 0, int(p.original_quantity) || 0,
          int(p.min_order_quantity), int(p.max_order_quantity), int(p.product_reword_point) || 0, bool(p.new_arrival), bool(p.trending_product),
          str(p.color), str(p.size), brandId, categoryId, str(p.product_brand), str(p.product_main_category), str(p.product_category),
          str(p.product_subcategory), str(p.product_description), str(p.product_sub_description), date(p.createdAt), date(p.updatedAt)];
      }));
    const productByMongo = new Map(products.map((p, i) => [String(p._id), productIds[i]]));
    if (noBrand) notes.push(`${noBrand} products have a brand name that matches no brand (brand_id is NULL, brand_name kept)`);
    if (noCategory) notes.push(`${noCategory} products have a main category that matches no category (category_id is NULL, names kept)`);

    await insert("product_images", ["product_id", "position", "image_name", "image_url", "image_path", "mongo_id"],
      products.flatMap((p, i) => (p.product_images || []).map((img: any, pos: number) =>
        [productIds[i], pos, str(img.image_name), str(img.image_url), str(img.path), oid(img._id)])));

    await insert("product_reviews", ["product_id", "user_id", "user_ref", "username", "body", "rating", "reviewed_on", "mongo_id"],
      products.flatMap((p, i) => (p.review || []).map((r: any) =>
        [productIds[i], userByMongo.get(String(r.userID)) || null, str(r.userID), str(r.username), str(r.desc), num(r.rating), str(r.createdAt), oid(r._id)])));

    // ---- orders
    const orders = await all("orders");
    const orderIds = await insert("orders",
      ["mongo_id", "order_code", "user_id", "customer_name", "customer_phone", "customer_email", "status", "payment_method",
        "transaction_id", "payment_type", "razorpay_payment_id", "total_amount", "total_amount_raw", "delivery_charges",
        "shipping_address", "town", "state", "pincode", "estimated_delivery_date", "created_at", "updated_at"],
      orders.map((o) => {
        const cod = o.tid === "COD";
        return [oid(o._id), o.order_id, userByMongo.get(String(o.customer_id)) || null, str(o.customer_name), str(o.customer_phone_number),
          str(o.customer_email), o.order_status || "pending", cod ? "cod" : "prepaid", cod ? null : str(o.tid), str(o.paymentType),
          str(o.razorpay_payment_id), num(o.total_amount), str(o.total_amount), num(o.delivery_charges), str(o.shipping_address),
          str(o.town), str(o.state), str(o.pincode), isoDay(o.estimated_delivery_date), date(o.createdAt), date(o.updatedAt)];
      }));

    await insert("order_items",
      ["order_id", "product_id", "product_mongo_id", "product_code", "sku", "name", "brand", "category", "unit_price",
        "regular_price", "quantity", "rating", "image_url", "is_delivered", "mongo_id"],
      orders.flatMap((o, i) => (o.products || []).map((it: any) =>
        [orderIds[i], productByMongo.get(String(it.productID)) || null, str(it.productID), str(it.id), str(it.code), str(it.name),
          str(it.brand), str(it.category), num(it.price), num(it.regular_price), int(it.cartQuantity) || 1, num(it.rate),
          str((it.images || it.product_images || [])[0]?.image_url), it.product_delivery_status ?? null, oid(it._id)])));

    // ---- coupons, delivery rule, payment history
    await insert("coupons", ["mongo_id", "code", "description", "has_order_cap", "order_cap", "discount_type", "discount_value", "expires_at"],
      (await all("coupons")).map((c) => [oid(c._id), c.title, str(c.description), bool(c.isOrderCap), num(c.OrderCap), str(c.discountType), num(c.discountValue), date(c.expiryDate)]));
    await insert("delivery_rules", ["mongo_id", "order_cap", "charge"],
      (await all("discounts")).map((d) => [oid(d._id), num(d.cap) || 0, num(d.amount) || 0]));
    await insert("payment_history", ["mongo_id", "razorpay_order_id", "razorpay_payment_id", "amount", "user_ref", "created_at", "updated_at"],
      (await all("payment_histories")).map((p) => [oid(p._id), str(p.razorpayOrderId), str(p.razorpayPaymentId), num(p.amount), str(p.user), date(p.createdAt), date(p.updatedAt)]));

    // ---- banners
    const banner = (placement: string) => (b: any) => [oid(b._id), placement, str(b.image_name), str(b.image_url), str(b.path), date(b.createdAt), date(b.updatedAt)];
    await insert("banners", ["mongo_id", "placement", "image_name", "image_url", "image_path", "created_at", "updated_at"],
      [...(await all("banners")).map(banner("desktop")), ...(await all("mobilebanners")).map(banner("mobile"))]);

    // ---- blogs
    const blogCategoryByNorm = new Map<string, number>();
    for (const c of await all("blogscategories")) {
      if (!c.main_category_name || blogCategoryByNorm.has(norm(c.main_category_name))) continue;
      const [id] = await insert("blog_categories", ["mongo_id", "name", "slug", "created_at", "updated_at"],
        [[oid(c._id), c.main_category_name, str(c.main_category_slug) || c.main_category_name, date(c.createdAt), date(c.updatedAt)]]);
      blogCategoryByNorm.set(norm(c.main_category_name), id);
    }
    const blogs = await all("blogs");
    const blogIds = await insert("blogs",
      ["mongo_id", "title", "slug", "meta_title", "meta_description", "category_id", "category_name", "author_name", "author_bio",
        "author_social_link", "author_image_url", "body", "image_name", "image_url", "image_path", "selected_products", "created_at", "updated_at"],
      blogs.map((b) => [oid(b._id), b.blog_title, b.blog_slug || b.blog_title, str(b.meta_title), str(b.meta_description),
        blogCategoryByNorm.get(norm(b.blog_category)) || null, str(b.blog_category), str(b.blog_author), str(b.author_bio),
        str(b.author_social_link), str(b.author_profile?.image_url), str(b.about_blog), str(b.blog_image?.image_name),
        str(b.blog_image?.image_url), str(b.blog_image?.path), JSON.stringify(b.blog_selected_products || []), date(b.createdAt), date(b.updatedAt)]));
    await insert("blog_sections", ["blog_id", "position", "title", "body", "mongo_id"],
      blogs.flatMap((b, i) => (b.blog_sub_headings || []).map((s: any, pos: number) =>
        [blogIds[i], pos, str(s.sub_head_title), str(s.sub_head_description), oid(s._id)])));

    // ---- doctors
    const doctors = await all("doctors");
    const doctorIds = await insert("doctors",
      ["mongo_id", "doctor_code", "name", "experience_years", "specialization", "languages", "description", "image_name", "image_url",
        "image_path", "start_time", "end_time", "is_available", "video_fee", "call_fee", "appointments", "created_at", "updated_at"],
      doctors.map((d) => [oid(d._id), str(d.doctor_id), d.name, num(d.experience), str(d.Specialization), str(d.languages), str(d.description),
        str(d.image?.image_name), str(d.image?.image_url), str(d.image?.path), str(d.time?.startTime), str(d.time?.endTime),
        d.availability !== false, num(d.price?.video), num(d.price?.call), JSON.stringify(d.appointments || []), date(d.createdAt), date(d.updatedAt)]));
    const doctorByCode = new Map(doctors.map((d, i) => [norm(d.doctor_id), doctorIds[i]]));
    await insert("doctor_enquiries",
      ["mongo_id", "doctor_id", "doctor_code", "doctor_name", "patient_name", "phone_number", "consultation_type", "message", "created_at", "updated_at"],
      (await all("doctorenquiries")).map((e) => [oid(e._id), doctorByCode.get(norm(e.doctorCode)) || null, str(e.doctorCode), str(e.doctorName),
        str(e.patientName), str(e.phoneNumber), str(e.consultationType), str(e.message), date(e.createdAt), date(e.updatedAt)]));

    // ---- enquiries
    await insert("wholesale_enquiries",
      ["mongo_id", "product_code", "product_name", "name", "phone_number", "email", "country", "quantity", "message", "created_at", "updated_at"],
      (await all("wholesaleenquiries")).map((e) => [oid(e._id), str(e.productCode), str(e.productName), str(e.name), str(e.phoneNumber),
        str(e.email), str(e.country), int(e.quantity), str(e.message), date(e.createdAt), date(e.updatedAt)]));
    await insert("contact_messages", ["mongo_id", "name", "email", "phone_number", "message", "is_read", "created_at", "updated_at"],
      (await all("contacts")).map((c) => [oid(c._id), str(c.name), str(c.email), str(c.phoneNumber), str(c.message), bool(c.isRead), date(c.createdAt), date(c.updatedAt)]));
    await insert("order_enquiries", ["mongo_id", "order_ref", "user_ref", "username", "phone_number", "message", "created_at", "updated_at"],
      (await all("enquiries")).map((e) => [oid(e._id), str(e.order_id), str(e.user_id), str(e.username), str(e.phone_number), str(e.message), date(e.createdAt), date(e.updatedAt)]));

    const tables = (await pg.query(`SELECT tablename FROM pg_tables WHERE schemaname = '${STAGING_SCHEMA}' ORDER BY tablename`)).rows.map((r: any) => String(r.tablename));
    const counts: Record<string, number> = {};
    for (const t of tables) counts[t] = (await pg.query(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n;
    await pg.query("COMMIT");
    log(`Read from the old site: ${counts.users ?? 0} customers, ${counts.products ?? 0} products, ${counts.orders ?? 0} orders, ${counts.doctors ?? 0} doctors.`);
    return { counts, notes };
  } catch (error) {
    await pg.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
};
