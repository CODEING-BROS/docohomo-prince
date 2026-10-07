import { type Request, type Response, Router } from "express";
import multer from "multer";
import type { Prisma, ProductStatus } from "../generated/prisma/client";
import { type Column, sendCsv } from "../lib/bulk";
import { HttpError } from "../lib/http";
import { prisma } from "../lib/prisma";
import { htmlToText } from "../lib/text";

// Bulk upload: add and update products from the same spreadsheet the product export produces
// (one row per variant). Mounted at /api/admin/product-import.
//   GET  /template   an empty sheet with two example rows
//   POST /preview    reads the file and says what would happen; changes nothing
//   POST /apply      the same file again; saves everything that is valid
//   GET  /jobs       the last uploads
//
// A row whose SKU is already in the catalog updates that variant; any other row adds a variant.
// An empty cell always means "leave it as it is".
export const productImportRoutes = Router();

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 50_000;
const MAX_MONEY = 10_000_000;
const MAX_STOCK = 10_000_000;
const STATUSES: ProductStatus[] = ["ACTIVE", "DRAFT", "ARCHIVED"];
const STORED_PROBLEMS = 500; // problem rows kept with the job for the history list
const PRODUCTS_AT_ONCE = 4; // products saved in parallel while applying

// ─────────────────────────────────────────────── the spreadsheet columns

const COLUMNS = [
  { key: "product", header: "Product", aliases: ["product name"] },
  { key: "brand", header: "Brand", aliases: ["brand name"] },
  { key: "parentCategory", header: "Parent category", aliases: ["main category"] },
  { key: "category", header: "Category", aliases: [] },
  { key: "form", header: "Form", aliases: [] },
  { key: "variant", header: "Variant", aliases: ["variant name"] },
  { key: "packSize", header: "Pack size", aliases: ["packsize"] },
  { key: "potency", header: "Potency", aliases: [] },
  { key: "sku", header: "SKU", aliases: ["sku code"] },
  { key: "mrp", header: "MRP", aliases: [] },
  { key: "sellingPrice", header: "Selling price", aliases: ["price", "sale price"] },
  { key: "b2bPrice", header: "B2B price", aliases: ["wholesale price"] },
  { key: "stock", header: "Stock", aliases: ["stock quantity", "quantity"] },
  { key: "status", header: "Status", aliases: [] },
] as const;

type ColumnKey = (typeof COLUMNS)[number]["key"];
type Cells = Record<ColumnKey, string>;

const headerKey = (text: string) => text.trim().toLowerCase().replace(/[\s_]+/g, " ");
const COLUMN_BY_HEADER = new Map<string, ColumnKey>(
  COLUMNS.flatMap((column) => [column.header, ...column.aliases].map((name) => [headerKey(name), column.key] as [string, ColumnKey])),
);

// ─────────────────────────────────────────────── reading the file

const SAVE_AS_CSV = "This is an Excel file. In Excel choose File > Save As > CSV (Comma delimited), then upload that file.";

/** Turns the uploaded bytes into text. Excel saves CSV as UTF-8 (with a marker), plain Windows text or UTF-16. */
const decode = (bytes: Buffer): string => {
  if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) throw new HttpError(400, SAVE_AS_CSV); // .xlsx
  if (bytes.length >= 2 && bytes[0] === 0xd0 && bytes[1] === 0xcf) throw new HttpError(400, SAVE_AS_CSV); // .xls
  let text: string;
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    text = new TextDecoder("utf-16le").decode(bytes);
  } else {
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      text = new TextDecoder("windows-1252").decode(bytes);
    }
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (text.includes("\u0000")) throw new HttpError(400, "This does not look like a CSV file. Save the sheet as CSV and upload that.");
  return text;
};

/** Comma is the norm; some Excel setups write semicolons or tabs instead. Judged from the header line. */
const delimiterOf = (text: string) => {
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === "\n" || ch === "\r")) break;
    else if (!quoted && ch in counts) counts[ch]++;
  }
  return counts[";"] > counts[","] && counts[";"] >= counts["\t"] ? ";" : counts["\t"] > counts[","] ? "\t" : ",";
};

/**
 * A small CSV reader: quoted cells, separators and line breaks inside quotes, doubled quotes,
 * and CRLF, LF or CR line ends. Returns one array of cells per line of the sheet.
 */
const parseCsv = (text: string, delimiter: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let started = false; // the current line has at least one character or separator
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch !== '"') cell += ch;
      else if (text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = false;
      continue;
    }
    if (ch === '"' && cell === "") {
      quoted = true;
      started = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
      started = true;
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      started = false;
    } else {
      cell += ch;
      started = true;
    }
  }
  if (started) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
};

/** Tidies one cell: spacing, and the apostrophe an Excel-safe export puts before = + - @. */
const tidy = (raw: string | undefined) => (raw ?? "").replace(/\s+/g, " ").trim().replace(/^'(?=[=+\-@])/, "").trim();

/** Like the product form: text copied from a web page loses its HTML. */
const plainText = (value: string) => (htmlToText(value) ?? "").replace(/\s+/g, " ").trim();

const GROUPED_NUMBER = /^\d{1,3}(,\d{2,3})*,\d{3}(\.\d+)?$/; // 1,250.00 and 1,25,000
const PLAIN_NUMBER = /^-?(\d+\.?\d*|\.\d+)$/;

/** "₹ 1,250.50" -> 1250.5. Null when it is not a number. */
const readNumber = (raw: string): number | null => {
  let text = raw.replace(/^(₹|rs\.?|inr)\s*/i, "").replace(/\s+/g, "");
  if (GROUPED_NUMBER.test(text)) text = text.replace(/,/g, "");
  return PLAIN_NUMBER.test(text) ? Number(text) : null;
};

const readMoney = (raw: string, label: string, problems: string[]): number | undefined => {
  if (!raw) return undefined;
  const value = readNumber(raw);
  if (value === null) problems.push(`${label} "${raw}" is not a number`);
  else if (value < 0) problems.push(`${label} cannot be less than 0`);
  else if (value > MAX_MONEY) problems.push(`${label} is too large`);
  else return Math.round(value * 100) / 100;
  return undefined;
};

const readStock = (raw: string, problems: string[]): number | undefined => {
  if (!raw) return undefined;
  const value = readNumber(raw);
  if (value === null || !Number.isInteger(value) || value < 0) problems.push(`Stock "${raw}" must be a whole number, 0 or more`);
  else if (value > MAX_STOCK) problems.push("Stock is too large");
  else return value;
  return undefined;
};

const show = (value: number) => String(value);
const nameKey = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();
const list = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

const slugify = (value: string) =>
  value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 110) || "product";

// ─────────────────────────────────────────────── the plan

type Action = "create" | "update" | "skip";
type Change = { field: string; from: string | null; to: string | null };
type RowResult = {
  row: number; // the line in the spreadsheet; the header is line 1
  action: Action;
  problem: boolean;
  message: string;
  product: string;
  variant: string;
  sku: string;
  changes: Change[];
};

type ProductFields = { status?: ProductStatus; form?: string; brandId?: number; categoryId?: number };
const PRODUCT_FIELDS = ["status", "form", "brandId", "categoryId"] as const;
const FIELD_LABEL: Record<keyof ProductFields, string> = { status: "Status", form: "Form", brandId: "Brand", categoryId: "Category" };

type VariantData = { title?: string; packSize?: string; potency?: string; mrp?: number; sellingPrice?: number; b2bPrice?: number };
type PlannedUpdate = { result: RowResult; variantId: number; data: VariantData; stock?: number };
type PlannedCreate = {
  result: RowResult; signature: string; title: string; packSize: string | null; potency: string | null; sku: string | null;
  mrp: number; sellingPrice: number; b2bPrice: number | null; stock: number;
};

/** Everything the file does to one product; saved together or not at all. */
type Unit = {
  productId: number | null; // null: the product itself is new
  create: { name: string; brandId: number | null; slug: string } | null;
  fields: ProductFields; // what the rows say about the product
  saidOnRow: Partial<Record<keyof ProductFields, number>>;
  patch: ProductFields; // the part of `fields` that differs from what is saved
  creates: PlannedCreate[];
  updates: PlannedUpdate[];
  nextSortOrder: number;
  needsDefault: boolean; // the product has no variant yet, so the first new one becomes the default
  failed: boolean;
};

type Summary = { rowsRead: number; newProducts: number; newVariants: number; updatedVariants: number; unchanged: number; problems: number };

const summarise = (rows: RowResult[], units: Unit[]): Summary => ({
  rowsRead: rows.length,
  newProducts: units.filter((unit) => unit.create && !unit.failed && unit.creates.length > 0).length,
  newVariants: rows.filter((r) => !r.problem && r.action === "create").length,
  updatedVariants: rows.filter((r) => !r.problem && r.action === "update").length,
  unchanged: rows.filter((r) => !r.problem && r.action === "skip").length,
  problems: rows.filter((r) => r.problem).length,
});

/** Reads the file against the current catalog and works out what each row would do. Changes nothing. */
const plan = async (bytes: Buffer) => {
  const text = decode(bytes);
  const records = parseCsv(text, delimiterOf(text));
  const headerIndex = records.findIndex((record) => record.some((value) => value.trim() !== ""));
  if (headerIndex === -1) throw new HttpError(400, "The file is empty");

  // which position each known column is at; headers can be in any order and any letter case
  const position = new Map<ColumnKey, number>();
  const ignoredColumns: string[] = [];
  records[headerIndex].forEach((raw, index) => {
    const header = tidy(raw);
    const key = COLUMN_BY_HEADER.get(headerKey(header));
    if (key && !position.has(key)) position.set(key, index);
    else if (header) ignoredColumns.push(header);
  });
  if (!position.has("sku") && !position.has("product")) {
    throw new HttpError(400, "This file does not have the columns we expect, such as Product and SKU. Download the template to see them.");
  }
  const missingColumns = COLUMNS.filter((column) => !position.has(column.key)).map((column) => column.header);

  const lines: { row: number; cells: Cells }[] = [];
  for (let index = headerIndex + 1; index < records.length; index++) {
    const record = records[index];
    if (record.every((value) => value.trim() === "")) continue; // blank lines are not rows
    const cells = {} as Cells;
    for (const column of COLUMNS) cells[column.key] = tidy(record[position.get(column.key) ?? -1]);
    for (const key of ["form", "packSize", "potency", "sku"] as const) if (cells[key]) cells[key] = plainText(cells[key]);
    lines.push({ row: index + 1, cells });
  }
  if (lines.length === 0) throw new HttpError(400, "The file has a header row but no products under it");
  if (lines.length > MAX_ROWS) throw new HttpError(400, `The file has more than ${MAX_ROWS.toLocaleString("en-IN")} rows. Split it into smaller files.`);

  // the catalog, loaded once and looked up from memory for every row
  const [brands, categories, products, variantRows] = await Promise.all([
    prisma.brand.findMany({ select: { id: true, name: true }, orderBy: { id: "asc" } }),
    prisma.category.findMany({ select: { id: true, name: true, parentId: true }, orderBy: { id: "asc" } }),
    prisma.product.findMany({
      select: { id: true, name: true, slug: true, brandId: true, categoryId: true, form: true, status: true },
      orderBy: { id: "asc" },
    }),
    prisma.productVariant.findMany({
      select: {
        id: true, productId: true, sku: true, title: true, packSize: true, potency: true,
        mrp: true, sellingPrice: true, b2bPrice: true, stockQuantity: true, sortOrder: true,
      },
      orderBy: { id: "asc" },
    }),
  ]);
  const variants = variantRows.map((v) => ({
    ...v, mrp: Number(v.mrp), sellingPrice: Number(v.sellingPrice), b2bPrice: v.b2bPrice === null ? null : Number(v.b2bPrice),
  }));
  type DbProduct = (typeof products)[number];
  type DbVariant = (typeof variants)[number];

  const brandById = new Map(brands.map((b) => [b.id, b]));
  const brandByName = new Map<string, (typeof brands)[number]>();
  for (const brand of brands) if (!brandByName.has(nameKey(brand.name))) brandByName.set(nameKey(brand.name), brand);

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const categoriesByName = new Map<string, typeof categories>();
  for (const category of categories) {
    const key = nameKey(category.name);
    categoriesByName.set(key, [...(categoriesByName.get(key) ?? []), category]);
  }
  const categoryPath = (id: number | null) => {
    const category = id === null ? undefined : categoryById.get(id);
    if (!category) return null;
    const parent = category.parentId === null ? undefined : categoryById.get(category.parentId);
    return parent ? `${parent.name} › ${category.name}` : category.name;
  };

  const productById = new Map(products.map((p) => [p.id, p]));
  const productKey = (name: string, brandId: number | null) => `${nameKey(name)}|${brandId ?? 0}`;
  const productsByKey = new Map<string, DbProduct[]>();
  for (const product of products) {
    const key = productKey(product.name, product.brandId);
    const same = productsByKey.get(key);
    if (same) same.push(product);
    else productsByKey.set(key, [product]);
  }
  const slugs = new Set(products.map((p) => p.slug));

  const variantBySku = new Map<string, DbVariant>();
  const variantsByProduct = new Map<number, DbVariant[]>();
  for (const variant of variants) {
    if (!variantBySku.has(variant.sku.toLowerCase())) variantBySku.set(variant.sku.toLowerCase(), variant);
    const siblings = variantsByProduct.get(variant.productId);
    if (siblings) siblings.push(variant);
    else variantsByProduct.set(variant.productId, [variant]);
  }
  const signatureOf = (title: string, packSize: string | null, potency: string | null) =>
    [title, packSize ?? "", potency ?? ""].map(nameKey).join("|");

  const rowsBySku = new Map<string, number[]>();
  for (const line of lines) {
    if (!line.cells.sku) continue;
    const key = line.cells.sku.toLowerCase();
    rowsBySku.set(key, [...(rowsBySku.get(key) ?? []), line.row]);
  }

  const findCategory = (name: string, parentName: string, currentId: number | null, problems: string[]): number | undefined => {
    let matches = categoriesByName.get(nameKey(name)) ?? [];
    if (parentName) {
      matches = matches.filter((c) => c.parentId !== null && nameKey(categoryById.get(c.parentId)?.name ?? "") === nameKey(parentName));
    }
    if (matches.length === 1) return matches[0].id;
    if (matches.length === 0) {
      problems.push(
        parentName
          ? `Category "${name}" was not found inside "${parentName}". Add it on the Categories page first, or check the spelling`
          : `Category "${name}" was not found. Add it on the Categories page first, or check the spelling`,
      );
      return undefined;
    }
    // several categories share the name: keep the product's own, or take the main one when no parent is given
    const own = matches.find((c) => c.id === currentId);
    if (own) return own.id;
    const main = parentName ? [] : matches.filter((c) => c.parentId === null);
    if (main.length === 1) return main[0].id;
    problems.push(`More than one category is called "${name}". Fill in the Parent category column to say which one`);
    return undefined;
  };

  /** The product-level cells of a row (status, form, brand, category), checked. Empty cells are left out. */
  const readProductFields = (cells: Cells, current: DbProduct | null, problems: string[]): ProductFields => {
    const fields: ProductFields = {};
    if (cells.status) {
      const status = cells.status.toUpperCase() as ProductStatus;
      if (STATUSES.includes(status)) fields.status = status;
      else problems.push(`Status "${cells.status}" must be ACTIVE, DRAFT or ARCHIVED`);
    }
    if (cells.form) {
      if (cells.form.length > 60) problems.push("Form is too long (60 letters at most)");
      else fields.form = cells.form;
    }
    if (cells.brand) {
      const own = current?.brandId ? brandById.get(current.brandId) : undefined;
      const brand = own && nameKey(own.name) === nameKey(cells.brand) ? own : brandByName.get(nameKey(cells.brand));
      if (brand) fields.brandId = brand.id;
      else problems.push(`Brand "${cells.brand}" was not found. Add it on the Brands page first, or check the spelling`);
    }
    if (cells.category) {
      const categoryId = findCategory(cells.category, cells.parentCategory, current?.categoryId ?? null, problems);
      if (categoryId !== undefined) fields.categoryId = categoryId;
    } else if (cells.parentCategory) {
      problems.push("Parent category is filled in but Category is empty");
    }
    return fields;
  };

  const display = (field: keyof ProductFields, value: string | number | null | undefined): string | null => {
    if (value === null || value === undefined) return null;
    if (field === "brandId") return brandById.get(Number(value))?.name ?? null;
    if (field === "categoryId") return categoryPath(Number(value));
    return String(value);
  };

  const units = new Map<string, Unit>();
  const unitFor = (key: string, make: () => Unit) => {
    let unit = units.get(key);
    if (!unit) {
      unit = make();
      units.set(key, unit);
    }
    return unit;
  };
  const unitOfProduct = (product: DbProduct): Unit => {
    const siblings = variantsByProduct.get(product.id) ?? [];
    return {
      productId: product.id, create: null, fields: {}, saidOnRow: {}, patch: {}, creates: [], updates: [],
      nextSortOrder: siblings.reduce((max, v) => Math.max(max, v.sortOrder + 1), 0), needsDefault: siblings.length === 0, failed: false,
    };
  };

  /** Two rows of one product must not disagree about the product itself. */
  const checkAgreement = (unit: Unit | undefined, fields: ProductFields, problems: string[]) => {
    if (!unit) return;
    for (const field of PRODUCT_FIELDS) {
      if (fields[field] !== undefined && unit.fields[field] !== undefined && unit.fields[field] !== fields[field]) {
        problems.push(`${FIELD_LABEL[field]} is different on row ${unit.saidOnRow[field]}, which is the same product. Use one value for the whole product`);
      }
    }
  };

  /** Records what a valid row says about its product and lists what that changes. */
  const recordProductFields = (unit: Unit, fields: ProductFields, row: number, current: DbProduct | null, changes: Change[]) => {
    for (const field of PRODUCT_FIELDS) {
      const value = fields[field];
      if (value === undefined) continue;
      if (unit.fields[field] === undefined) {
        Object.assign(unit.fields, { [field]: value });
        unit.saidOnRow[field] = row;
      }
      if (current && current[field] !== value) {
        Object.assign(unit.patch, { [field]: value });
        changes.push({ field: FIELD_LABEL[field], from: display(field, current[field]), to: display(field, value) });
      }
    }
  };

  const results: RowResult[] = [];

  for (const { row, cells } of lines) {
    const problems: string[] = [];
    const result: RowResult = { row, action: "skip", problem: false, message: "", product: cells.product, variant: cells.variant, sku: cells.sku, changes: [] };
    results.push(result);
    const fail = () => {
      result.action = "skip";
      result.problem = true;
      result.changes = [];
      result.message = problems.join(". ");
    };

    if (cells.sku.length > 60) problems.push("SKU is too long (60 letters at most)");
    const sameSku = cells.sku ? (rowsBySku.get(cells.sku.toLowerCase()) ?? []) : [];
    if (sameSku.length > 1) problems.push(`SKU ${cells.sku} is used more than once in this file (rows ${list(sameSku.map(String))})`);
    if (cells.variant.length > 120) problems.push("Variant is too long (120 letters at most)");
    if (cells.packSize.length > 40) problems.push("Pack size is too long (40 letters at most)");
    if (cells.potency.length > 40) problems.push("Potency is too long (40 letters at most)");
    const mrp = readMoney(cells.mrp, "MRP", problems);
    const sellingPrice = readMoney(cells.sellingPrice, "Selling price", problems);
    const b2bPrice = readMoney(cells.b2bPrice, "B2B price", problems);
    const stock = readStock(cells.stock, problems);

    const existing = cells.sku ? variantBySku.get(cells.sku.toLowerCase()) : undefined;

    // ── the SKU is in the catalog: update that variant
    if (existing) {
      const product = productById.get(existing.productId)!;
      result.product = product.name;
      result.variant = cells.variant || existing.title;
      result.sku = existing.sku;

      const data: VariantData = {};
      const changes: Change[] = [];
      if (cells.variant && cells.variant !== existing.title) {
        data.title = cells.variant;
        changes.push({ field: "Variant", from: existing.title, to: cells.variant });
      }
      if (cells.packSize && cells.packSize !== (existing.packSize ?? "")) {
        data.packSize = cells.packSize;
        changes.push({ field: "Pack size", from: existing.packSize, to: cells.packSize });
      }
      if (cells.potency && cells.potency !== (existing.potency ?? "")) {
        data.potency = cells.potency;
        changes.push({ field: "Potency", from: existing.potency, to: cells.potency });
      }
      if (mrp !== undefined && mrp !== existing.mrp) {
        data.mrp = mrp;
        changes.push({ field: "MRP", from: show(existing.mrp), to: show(mrp) });
      }
      if (sellingPrice !== undefined && sellingPrice !== existing.sellingPrice) {
        data.sellingPrice = sellingPrice;
        changes.push({ field: "Selling price", from: show(existing.sellingPrice), to: show(sellingPrice) });
      }
      if (b2bPrice !== undefined && b2bPrice !== existing.b2bPrice) {
        data.b2bPrice = b2bPrice;
        changes.push({ field: "B2B price", from: existing.b2bPrice === null ? null : show(existing.b2bPrice), to: show(b2bPrice) });
      }
      // prices are only checked against each other when the row changes one of them
      if (data.mrp !== undefined || data.sellingPrice !== undefined || data.b2bPrice !== undefined) {
        const nextMrp = data.mrp ?? existing.mrp;
        const nextSelling = data.sellingPrice ?? existing.sellingPrice;
        const nextB2b = data.b2bPrice ?? existing.b2bPrice;
        if (nextSelling > nextMrp) problems.push(`Selling price (${show(nextSelling)}) cannot be higher than the MRP (${show(nextMrp)})`);
        if (nextB2b !== null && nextB2b > nextMrp) problems.push(`B2B price (${show(nextB2b)}) cannot be higher than the MRP (${show(nextMrp)})`);
      }
      const stockChanged = stock !== undefined && stock !== existing.stockQuantity;
      if (stockChanged) changes.push({ field: "Stock", from: show(existing.stockQuantity), to: show(stock) });

      const fields = readProductFields(cells, product, problems);
      const key = `p${product.id}`;
      checkAgreement(units.get(key), fields, problems);
      if (problems.length) {
        fail();
        continue;
      }

      const unit = unitFor(key, () => unitOfProduct(product));
      recordProductFields(unit, fields, row, product, changes);
      const renamed = cells.product && nameKey(cells.product) !== nameKey(product.name) ? " The product name is not changed by an upload." : "";
      if (changes.length === 0) {
        result.message = `No changes.${renamed}`;
        continue;
      }
      result.action = "update";
      result.changes = changes;
      result.message = `Changes ${list(changes.map((c) => c.field))}.${renamed}`;
      unit.updates.push({ result, variantId: existing.id, data, stock: stockChanged ? stock : undefined });
      continue;
    }

    // ── no SKU, or one we have not seen: add a variant
    if (!cells.product) {
      problems.push(cells.sku ? `SKU ${cells.sku} is not in the catalog, and there is no Product name to add it as a new one` : "Product name is missing");
    } else if (cells.product.length < 2 || cells.product.length > 300) {
      problems.push("Product name must be between 2 and 300 letters");
    }
    if (mrp === undefined && !cells.mrp) problems.push("MRP is missing");
    if (sellingPrice === undefined && !cells.sellingPrice) problems.push("Selling price is missing");
    if (mrp !== undefined && sellingPrice !== undefined && sellingPrice > mrp) {
      problems.push(`Selling price (${show(sellingPrice)}) cannot be higher than the MRP (${show(mrp)})`);
    }
    if (mrp !== undefined && b2bPrice !== undefined && b2bPrice > mrp) problems.push(`B2B price (${show(b2bPrice)}) cannot be higher than the MRP (${show(mrp)})`);

    const title = cells.variant || [cells.potency, cells.packSize].filter(Boolean).join(" · ") || "Standard";
    const signature = signatureOf(title, cells.packSize || null, cells.potency || null);

    // rows with the same product name and brand are one product; it may already be in the catalog
    const brand = cells.brand ? brandByName.get(nameKey(cells.brand)) : undefined;
    const brandId = brand?.id ?? null;
    let product: DbProduct | null = null;
    let key = "";
    if (cells.product && (brand || !cells.brand)) {
      const same = productsByKey.get(productKey(cells.product, brandId)) ?? [];
      if (same.length > 1) {
        problems.push(`${same.length} products are already called "${cells.product}" with this brand, so we cannot tell which one this variant belongs to. Add it on the product page instead`);
      } else if (same.length === 1) {
        product = same[0];
        key = `p${product.id}`;
        const twin = (variantsByProduct.get(product.id) ?? []).find((v) => signatureOf(v.title, v.packSize, v.potency) === signature);
        if (twin) {
          problems.push(`"${product.name}" already has a variant called "${twin.title}". To change it, put its SKU (${twin.sku}) in the SKU column`);
        }
      } else {
        key = `n${productKey(cells.product, brandId)}`;
      }
    }
    const fields = readProductFields(cells, product, problems);
    if (key) {
      const pending = units.get(key)?.creates.find((c) => c.signature === signature);
      if (pending) problems.push(`This is the same variant as row ${pending.result.row}. Give each variant its own name, pack size or potency`);
      checkAgreement(units.get(key), fields, problems);
    }
    if (problems.length || !key || mrp === undefined || sellingPrice === undefined) {
      fail();
      continue;
    }

    const name = cells.product;
    const unit = unitFor(key, () =>
      product
        ? unitOfProduct(product)
        : { productId: null, create: { name, brandId, slug: "" }, fields: {}, saidOnRow: {}, patch: {}, creates: [], updates: [], nextSortOrder: 0, needsDefault: true, failed: false },
    );
    const changes: Change[] = [];
    recordProductFields(unit, fields, row, product, changes);
    result.action = "create";
    result.variant = title;
    result.changes = changes;
    if (product) {
      result.product = product.name;
      result.message = `New variant for the existing product.${changes.length ? ` Also changes ${list(changes.map((c) => c.field))}.` : ""}`;
    } else {
      result.message = unit.creates.length === 0 ? "New product." : `New product: another variant of row ${unit.creates[0].result.row}.`;
    }
    unit.creates.push({
      result, signature, title, packSize: cells.packSize || null, potency: cells.potency || null, sku: cells.sku || null,
      mrp, sellingPrice, b2bPrice: b2bPrice ?? null, stock: stock ?? 0,
    });
  }

  // web addresses for the new products
  const work = [...units.values()].filter((unit) => unit.creates.length > 0 || unit.updates.length > 0);
  for (const unit of work) {
    if (!unit.create) continue;
    const base = slugify(unit.create.name);
    let slug = base;
    for (let n = 2; slugs.has(slug); n++) slug = `${base}-${n}`;
    slugs.add(slug);
    unit.create.slug = slug;
  }

  return { rows: results, units: work, ignoredColumns, missingColumns };
};

// ─────────────────────────────────────────────── saving

type Tx = Prisma.TransactionClient;

/** Saves everything the file does to one product in a single transaction. Returns the SKU each new variant got. */
const saveUnit = async (unit: Unit, staffId: number, jobId: number) => {
  const skus: string[] = [];
  await prisma.$transaction(
    async (tx: Tx) => {
      let productId = unit.productId;
      if (unit.create) {
        const created = await tx.product.create({
          data: {
            name: unit.create.name, slug: unit.create.slug, brandId: unit.create.brandId,
            categoryId: unit.fields.categoryId ?? null, form: unit.fields.form ?? null, status: unit.fields.status ?? "ACTIVE",
          },
        });
        productId = created.id;
      } else if (Object.keys(unit.patch).length > 0) {
        await tx.product.update({ where: { id: productId! }, data: unit.patch });
      }

      // stock is compared with what is saved right now, so the movement is exact even if an order came in meanwhile
      const stockIds = unit.updates.filter((u) => u.stock !== undefined).map((u) => u.variantId);
      const saved = stockIds.length
        ? await tx.productVariant.findMany({ where: { id: { in: stockIds } }, select: { id: true, stockQuantity: true } })
        : [];
      const stockNow = new Map(saved.map((v) => [v.id, v.stockQuantity]));

      for (const update of unit.updates) {
        const data = { ...update.data, ...(update.stock !== undefined ? { stockQuantity: update.stock } : {}) };
        if (Object.keys(data).length > 0) await tx.productVariant.update({ where: { id: update.variantId }, data });
        const change = update.stock === undefined ? 0 : update.stock - (stockNow.get(update.variantId) ?? 0);
        if (update.stock !== undefined && change !== 0) {
          await tx.inventoryMovement.create({
            data: { variantId: update.variantId, type: "ADJUSTMENT", quantity: change, balanceAfter: update.stock, note: "Bulk upload", createdById: staffId },
          });
        }
      }

      for (const [index, variant] of unit.creates.entries()) {
        const sortOrder = unit.nextSortOrder + index;
        const created = await tx.productVariant.create({
          data: {
            productId: productId!, title: variant.title, packSize: variant.packSize, potency: variant.potency,
            mrp: variant.mrp, sellingPrice: variant.sellingPrice, b2bPrice: variant.b2bPrice, stockQuantity: variant.stock,
            isDefault: unit.needsDefault && index === 0, sortOrder,
            sku: variant.sku ?? `pending-${productId}-${sortOrder}-${Date.now()}`,
          },
        });
        // without a SKU in the file the variant gets a generated one, like on the product page
        const sku = variant.sku ?? `DH-${String(created.id).padStart(6, "0")}`;
        if (!variant.sku) await tx.productVariant.update({ where: { id: created.id }, data: { sku } });
        skus[index] = sku;
        if (variant.stock > 0) {
          await tx.inventoryMovement.create({
            data: { variantId: created.id, type: "OPENING", quantity: variant.stock, balanceAfter: variant.stock, note: "Bulk upload", createdById: staffId },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          actorId: staffId, action: unit.create ? "product.create" : "product.update", entity: "Product", entityId: String(productId),
          changes: { source: "bulk-upload", jobId, variantsAdded: unit.creates.length, variantsUpdated: unit.updates.length },
        },
      });
    },
    { maxWait: 20_000, timeout: 60_000 },
  );
  return skus;
};

const whyNotSaved = (error: unknown) => {
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "";
  if (code === "P2002") return "Could not be saved: the SKU is already used by another product. Nothing was changed for this product";
  if (code === "P2025") return "Could not be saved: the product was changed or deleted by someone else just now. Upload the file again";
  return "Could not be saved because of an unexpected error. Nothing was changed for this product; try again";
};

// ─────────────────────────────────────────────── routes

const receive = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1 } }).single("file");

/** Takes the uploaded spreadsheet off the request. */
const readUpload = (req: Request, res: Response) =>
  new Promise<{ fileName: string; bytes: Buffer }>((resolve, reject) => {
    receive(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        return reject(new HttpError(400, err.code === "LIMIT_FILE_SIZE" ? "The file is larger than 10 MB. Split it into smaller files." : "Could not read the upload"));
      }
      if (err) return reject(err);
      if (!req.file) return reject(new HttpError(400, "Choose a CSV file to upload"));
      // browsers send the name as UTF-8; multer reads it as Latin-1
      const fileName = Buffer.from(req.file.originalname, "latin1").toString("utf8").replace(/[\r\n]+/g, " ").trim().slice(0, 200) || "upload.csv";
      resolve({ fileName, bytes: req.file.buffer });
    });
  });

productImportRoutes.get("/template", async (_req, res) => {
  // a real brand and category, so the example rows show names the upload will recognise
  const [brand, subcategory, anyCategory] = await Promise.all([
    prisma.brand.findFirst({ where: { isActive: true }, orderBy: { name: "asc" }, select: { name: true } }),
    prisma.category.findFirst({ where: { parentId: { not: null } }, orderBy: { id: "asc" }, select: { name: true, parent: { select: { name: true } } } }),
    prisma.category.findFirst({ orderBy: { id: "asc" }, select: { name: true } }),
  ]);
  const shared = {
    product: "Example Medicine (replace these rows)", brand: brand?.name ?? "", parentCategory: subcategory?.parent?.name ?? "",
    category: subcategory?.name ?? anyCategory?.name ?? "", form: "Drops", potency: "", sku: "", status: "DRAFT",
  };
  const examples: Record<ColumnKey, string | number>[] = [
    { ...shared, variant: "30 ml", packSize: "30 ml", mrp: 120, sellingPrice: 110, b2bPrice: 95, stock: 25 },
    { ...shared, variant: "100 ml", packSize: "100 ml", mrp: 320, sellingPrice: 295, b2bPrice: 260, stock: 10 },
  ];
  const columns: Column<(typeof examples)[number]>[] = COLUMNS.map((column) => ({ header: column.header, value: (row) => row[column.key] }));
  sendCsv(res, "product-upload-template", columns, examples);
});

productImportRoutes.post("/preview", async (req, res) => {
  const { fileName, bytes } = await readUpload(req, res);
  const { rows, units, ignoredColumns, missingColumns } = await plan(bytes);
  res.json({ fileName, applied: false, summary: summarise(rows, units), rows, ignoredColumns, missingColumns });
});

let applying = false; // one upload is applied at a time, so two clicks cannot add the same products twice

productImportRoutes.post("/apply", async (req, res) => {
  const { fileName, bytes } = await readUpload(req, res);
  if (applying) throw new HttpError(409, "Another upload is being applied right now. Wait for it to finish, then try again.");
  applying = true;
  try {
    const { rows, units, ignoredColumns, missingColumns } = await plan(bytes);
    if (units.length === 0) throw new HttpError(400, "There is nothing to change in this file");

    const staffId = req.user!.id;
    const job = await prisma.bulkImportJob.create({
      data: { kind: "PRODUCTS", fileName, status: "RUNNING", totalRows: rows.length, createdById: staffId, startedAt: new Date() },
    });

    try {
      let next = 0;
      const worker = async () => {
        while (next < units.length) {
          const unit = units[next++];
          try {
            const skus = await saveUnit(unit, staffId, job.id);
            for (const [index, { result }] of unit.creates.entries()) {
              result.sku = skus[index] ?? result.sku;
              result.message = unit.create ? "Added as a new product." : "Added to the existing product.";
            }
            for (const { result } of unit.updates) result.message = `Updated ${list(result.changes.map((c) => c.field))}.`;
          } catch (error) {
            console.error(`Bulk upload ${job.id}: could not save product ${unit.productId ?? unit.create?.name}`, error);
            unit.failed = true;
            for (const { result } of [...unit.creates, ...unit.updates]) {
              result.problem = true;
              result.message = whyNotSaved(error);
            }
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(PRODUCTS_AT_ONCE, units.length) }, worker));

      const summary = summarise(rows, units);
      const problemRows = rows.filter((r) => r.problem);
      await prisma.bulkImportJob.update({
        where: { id: job.id },
        data: {
          status: "COMPLETED",
          successRows: summary.newVariants + summary.updatedVariants,
          failedRows: summary.problems,
          finishedAt: new Date(),
          errors: {
            counts: { newProducts: summary.newProducts, newVariants: summary.newVariants, updatedVariants: summary.updatedVariants, unchanged: summary.unchanged },
            rows: problemRows.slice(0, STORED_PROBLEMS).map((r) => ({ row: r.row, product: r.product, sku: r.sku, message: r.message })),
            moreRows: Math.max(0, problemRows.length - STORED_PROBLEMS),
          },
        },
      });
      res.json({ fileName, applied: true, jobId: job.id, summary, rows, ignoredColumns, missingColumns });
    } catch (error) {
      await prisma.bulkImportJob
        .update({ where: { id: job.id }, data: { status: "FAILED", finishedAt: new Date(), errors: { message: "The upload stopped before it finished" } } })
        .catch(() => undefined);
      throw error;
    }
  } finally {
    applying = false;
  }
});

productImportRoutes.get("/jobs", async (_req, res) => {
  const jobs = await prisma.bulkImportJob.findMany({
    where: { kind: "PRODUCTS" },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { createdBy: { select: { firstName: true, lastName: true, email: true } } },
  });
  const STALE_MS = 30 * 60 * 1000; // a job still "running" after this long was cut off, for example by a restart
  res.json({
    items: jobs.map((job) => {
      const details = (job.errors ?? {}) as { counts?: Record<string, number>; rows?: unknown[]; moreRows?: number };
      const stale = job.status === "RUNNING" && Date.now() - (job.startedAt ?? job.createdAt).getTime() > STALE_MS;
      return {
        id: job.id,
        fileName: job.fileName,
        status: stale ? "FAILED" : job.status,
        totalRows: job.totalRows,
        successRows: job.successRows,
        failedRows: job.failedRows,
        counts: details.counts ?? null,
        problems: Array.isArray(details.rows) ? details.rows : [],
        moreProblems: details.moreRows ?? 0,
        createdBy: job.createdBy ? [job.createdBy.firstName, job.createdBy.lastName].filter(Boolean).join(" ") || job.createdBy.email : null,
        createdAt: job.createdAt,
        finishedAt: job.finishedAt,
      };
    }),
  });
});
