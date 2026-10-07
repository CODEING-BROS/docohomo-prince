import PDFDocument from "pdfkit";
import { HttpError, num } from "./http";
import { prisma } from "./prisma";
import { pickupPlaceDetails, pickupPlaces, shiprocketReady } from "./shiprocket";

// Invoices, made by the system for every order without anyone asking.
//   - numbered without gaps within each financial year (April to March): DH/26-27/000001
//   - made automatically the moment the order is confirmed (or when it is sent out, if staff choose that)
//   - a GST "tax invoice" when the business has a GSTIN, a plain invoice until then
//   - the business address is taken from the Shiprocket pickup address when nobody has typed one
//   - drawn as a PDF whenever someone downloads it, from what was saved on the order, so an old
//     invoice never changes even if prices or the business address change later
// Prices on the store include GST, so each line's tax is worked out from inside the price.

export type Seller = {
  legalName: string; tradeName: string; gstin: string; pan: string; drugLicence: string;
  address: string; city: string; state: string; pincode: string; phone: string; email: string;
  prefix: string; // the start of every invoice number, e.g. DH
  issueOn: "dispatch" | "placed"; // when invoices are made by themselves
  footer: string; // e.g. terms, or a thank-you line
  autoFilled?: boolean; // the address came from the Shiprocket pickup address and nobody has checked it yet
};

const KEY = "invoice.seller";
const EMPTY: Seller = { legalName: "", tradeName: "DocHomoeo", gstin: "", pan: "", drugLicence: "", address: "", city: "", state: "", pincode: "", phone: "", email: "", prefix: "DH", issueOn: "placed", footer: "" };

let lookedUpAt = 0;

/**
 * With no business address typed in, the one the couriers already collect from is used: it is
 * the shop's own address in its own Shiprocket account. Staff can correct it in Invoice settings.
 */
const addressFromCourier = async (seller: Seller): Promise<Seller> => {
  if (seller.address || !shiprocketReady || Date.now() - lookedUpAt < 10 * 60_000) return seller;
  lookedUpAt = Date.now();
  try {
    const chosen = ((await prisma.setting.findUnique({ where: { key: "shipping.shiprocket" } }))?.value ?? {}) as { pickupPlace?: string };
    const places = await pickupPlaces();
    const name = chosen.pickupPlace || (places.find((p) => p.verified) ?? places[0])?.name;
    const place = name ? await pickupPlaceDetails(name) : null;
    if (!place?.address || !place.state) return seller;
    return saveSellerDetails({ ...seller, address: place.address, city: place.city, state: place.state, pincode: place.pincode, phone: seller.phone || place.phone, email: seller.email || (place.email ?? ""), autoFilled: true });
  } catch {
    return seller; // Shiprocket is not reachable just now: try again later
  }
};

export const sellerDetails = async (): Promise<Seller> => {
  const saved = await prisma.setting.findUnique({ where: { key: KEY } });
  return addressFromCourier({ ...EMPTY, ...((saved?.value ?? {}) as Partial<Seller>) });
};
export const saveSellerDetails = async (value: Seller) => {
  await prisma.setting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } });
  return value;
};
/** What is still missing before any invoice can be made. */
export const missingSellerDetails = (s: Seller) =>
  [!(s.legalName || s.tradeName) && "the business name", !s.address && "the address", !s.state && "the state"].filter(Boolean) as string[];

/** Things that work but that the owner should look at. */
export const sellerAdvice = (s: Seller) =>
  [
    !s.gstin && "No GSTIN is filled in, so invoices are plain invoices, not GST tax invoices. Add the GSTIN if the business is registered for GST.",
    s.autoFilled && "The address was taken from your Shiprocket pickup address. Check that it is the address you want printed on invoices, then save.",
    !s.legalName && "The registered business name is empty, so invoices carry only the shop name.",
  ].filter(Boolean) as string[];

/** "2026-27" for any date from April 2026 to March 2027, in India time. */
const financialYear = (at: Date) => {
  const [year, month] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" }).format(at).split("-").map(Number);
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String(start + 1).slice(2)}`;
};

/**
 * Gives an order its invoice number, once. Returns the number, or null when an invoice cannot be
 * made yet (seller details missing, order cancelled, online payment not in).
 */
export const issueInvoice = async (orderId: number, { strict = false } = {}) => {
  const seller = await sellerDetails();
  const missing = missingSellerDetails(seller);
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { invoiceNumber: true, status: true, paymentMethod: true, paymentStatus: true } });
  const refuse = (reason: string) => { if (strict) throw new HttpError(400, reason); return null; };
  if (!order) return refuse("Order not found");
  if (order.invoiceNumber) return order.invoiceNumber;
  if (missing.length) return refuse(`Fill in ${missing.join(", ")} in Invoice settings first`);
  if (order.status === "CANCELLED") return refuse("A cancelled order gets no invoice");
  if (order.paymentMethod === "ONLINE" && order.paymentStatus !== "PAID") return refuse("This order is waiting for its online payment");

  const now = new Date();
  const year = financialYear(now);
  return prisma.$transaction(async (tx) => {
    // the counter goes up by exactly one per invoice, even when two are made at the same moment
    const counter = await tx.invoiceCounter.upsert({ where: { financialYear: year }, update: { last: { increment: 1 } }, create: { financialYear: year, last: 1 } });
    const number = `${seller.prefix || "INV"}/${year.slice(2)}/${String(counter.last).padStart(6, "0")}`;
    const claimed = await tx.order.updateMany({ where: { id: orderId, invoiceNumber: null }, data: { invoiceNumber: number, invoicedAt: now, invoiceSeller: seller } });
    if (claimed.count === 0) throw new HttpError(409, "This order was given an invoice just now"); // undoes the counter step too
    await tx.orderStatusHistory.create({ data: { orderId, status: order.status, note: `Invoice ${number} made` } });
    return number;
  }).catch(async (error) => {
    if (error instanceof HttpError && error.status === 409) return (await prisma.order.findUnique({ where: { id: orderId }, select: { invoiceNumber: true } }))?.invoiceNumber ?? null;
    throw error;
  });
};

/** Makes the invoice now if the shop is set to invoice at this point. Never throws. */
export const autoInvoice = async (orderId: number, moment: "placed" | "dispatch") => {
  try {
    const seller = await sellerDetails();
    if (seller.issueOn === moment || moment === "dispatch") await issueInvoice(orderId); // anything sent out always gets one
  } catch (error) {
    console.error("[invoice]", orderId, error);
  }
};

// ───────────────────────────────────────────── the PDF

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const belowHundred = (n: number) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`);
const belowThousand = (n: number) => [n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred` : "", belowHundred(n % 100)].filter(Boolean).join(" ");
/** 1,23,456 → "One Lakh Twenty Three Thousand Four Hundred Fifty Six", the Indian way. */
const inWords = (value: number) => {
  let n = Math.floor(value);
  if (n === 0) return "Zero";
  const parts: string[] = [];
  for (const [size, name] of [[10_000_000, "Crore"], [100_000, "Lakh"], [1000, "Thousand"]] as const) {
    if (n >= size) {
      parts.push(`${belowThousand(Math.floor(n / size))} ${name}`);
      n %= size;
    }
  }
  if (n) parts.push(belowThousand(n));
  return parts.join(" ");
};
const titleCase = (value: string) => value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
const rupees = (value: number) => `Rs. ${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
const round2 = (v: number) => Math.round(v * 100) / 100;

export const invoicePdf = async (orderId: number): Promise<{ number: string; pdf: Buffer }> => {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: { include: { product: { select: { hsnCode: true } } } } } });
  if (!order?.invoiceNumber) throw new HttpError(404, "This order has no invoice yet");
  const seller = { ...EMPTY, ...((order.invoiceSeller ?? {}) as Partial<Seller>) };
  const sameState = Boolean(order.shippingState && seller.state && order.shippingState.trim().toLowerCase() === seller.state.trim().toLowerCase());

  // tax worked out from inside each GST-inclusive line
  const lines = order.items.map((item) => {
    const total = num(item.lineTotal);
    const rate = num(item.gstPercent);
    const taxable = round2(total / (1 + rate / 100));
    return { name: titleCase(item.productName) + (item.variantTitle ? ` (${item.variantTitle})` : ""), hsn: item.product?.hsnCode ?? "", qty: item.quantity, rate, taxable, tax: round2(total - taxable), total };
  });
  const charges = num(order.shippingCharge) + num(order.codCharge);
  const discount = num(order.couponDiscount);
  const taxable = round2(lines.reduce((s, l) => s + l.taxable, 0));
  const tax = round2(lines.reduce((s, l) => s + l.tax, 0));

  const doc = new PDFDocument({ size: "A4", margin: 40, info: { Title: `Invoice ${order.invoiceNumber}`, Author: seller.tradeName || seller.legalName } });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
  const left = 40;
  const width = 515;
  const green = "#0d7a4f";
  const muted = "#5b6b63";

  // seller
  doc.fillColor(green).font("Helvetica-Bold").fontSize(18).text(seller.tradeName || seller.legalName, left, 40);
  doc.fillColor("#1f2a25").font("Helvetica").fontSize(9);
  if (seller.tradeName && seller.legalName && seller.tradeName !== seller.legalName) doc.text(seller.legalName);
  doc.text([seller.address, [seller.city, seller.state, seller.pincode].filter(Boolean).join(", ")].filter(Boolean).join("\n"));
  doc.text([seller.gstin && `GSTIN: ${seller.gstin}`, seller.pan && `PAN: ${seller.pan}`].filter(Boolean).join("   "));
  if (seller.drugLicence) doc.text(`Drug licence: ${seller.drugLicence}`);
  if (seller.phone || seller.email) doc.text([seller.phone, seller.email].filter(Boolean).join("   "));
  doc.font("Helvetica-Bold").fontSize(14).fillColor("#1f2a25").text(seller.gstin ? "TAX INVOICE" : "INVOICE", left, 40, { width, align: "right" });
  doc.font("Helvetica").fontSize(9).fillColor(muted).text("Original for recipient", left, 58, { width, align: "right" });

  // invoice facts and the two parties
  let y = Math.max(doc.y, 120) + 12;
  doc.moveTo(left, y).lineTo(left + width, y).strokeColor("#d9e2dd").stroke();
  y += 10;
  const day = (d: Date) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
  const facts: [string, string][] = [
    ["Invoice number", order.invoiceNumber], ["Invoice date", day(order.invoicedAt ?? new Date())], ["Order number", order.orderNumber], ["Order date", day(order.placedAt)],
    ["Payment", { COD: "Pay on delivery", ONLINE: "Paid online", CREDIT: "On credit", BANK_TRANSFER: "Bank transfer" }[order.paymentMethod] ?? order.paymentMethod],
    ["Place of supply", order.shippingState ?? ""],
  ];
  facts.forEach(([label, value], index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    doc.font("Helvetica").fontSize(8).fillColor(muted).text(label, left + col * 260, y + row * 26);
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#1f2a25").text(value, left + col * 260, y + row * 26 + 10);
  });
  y += 3 * 26 + 8;
  const party = (title: string, x: number, body: string[]) => {
    doc.font("Helvetica").fontSize(8).fillColor(muted).text(title, x, y);
    doc.font("Helvetica").fontSize(9.5).fillColor("#1f2a25").text(body.filter(Boolean).join("\n"), x, y + 11, { width: 245 });
  };
  const address = [order.shippingAddress, [order.shippingCity, order.shippingState, order.shippingPincode].filter(Boolean).join(", ")].filter(Boolean).join("\n");
  party("Billed to", left, [order.billingName ?? order.customerName ?? "", order.billingGstNumber ? `GSTIN: ${order.billingGstNumber}` : "", address, order.customerPhone ?? ""]);
  party("Shipped to", left + 260, [order.customerName ?? "", address]);
  y = doc.y + 18;

  // the items
  const cols = sameState
    ? [["#", 18], ["Item", 172], ["HSN", 48], ["Qty", 28], ["Taxable value", 70], ["CGST", 55], ["SGST", 55], ["Total", 69]] as const
    : [["#", 18], ["Item", 197], ["HSN", 48], ["Qty", 28], ["Taxable value", 75], ["IGST", 75], ["Total", 74]] as const;
  const drawRow = (cells: string[], bold = false, fill?: string) => {
    const height = Math.max(...cells.map((cell, i) => doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(8.5).heightOfString(cell, { width: cols[i][1] - 6 }))) + 8;
    if (y + height > 770) { doc.addPage(); y = 40; }
    if (fill) doc.rect(left, y, width, height).fill(fill);
    let x = left;
    cells.forEach((cell, i) => {
      doc.fillColor("#1f2a25").font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(8.5).text(cell, x + 3, y + 4, { width: cols[i][1] - 6, align: i >= 3 ? "right" : "left" });
      x += cols[i][1];
    });
    y += height;
    doc.moveTo(left, y).lineTo(left + width, y).strokeColor("#e3e8e5").stroke();
  };
  drawRow(cols.map((c) => c[0]), true, "#eef5f1");
  lines.forEach((line, index) => {
    const taxText = (part: number) => `${rupees(part)}\n${sameState ? line.rate / 2 : line.rate}%`;
    drawRow(sameState
      ? [String(index + 1), line.name, line.hsn, String(line.qty), rupees(line.taxable), taxText(round2(line.tax / 2)), taxText(round2(line.tax - round2(line.tax / 2))), rupees(line.total)]
      : [String(index + 1), line.name, line.hsn, String(line.qty), rupees(line.taxable), taxText(line.tax), rupees(line.total)]);
  });

  // totals
  y += 10;
  const total = (label: string, value: string, bold = false) => {
    if (y > 760) { doc.addPage(); y = 40; }
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 11 : 9.5).fillColor("#1f2a25");
    doc.text(label, left + 270, y, { width: 140 });
    doc.text(value, left + 410, y, { width: 105, align: "right" });
    y += bold ? 18 : 14;
  };
  total("Taxable value", rupees(taxable));
  if (sameState) { total("CGST", rupees(round2(tax / 2))); total("SGST", rupees(round2(tax - round2(tax / 2)))); } else total("IGST", rupees(tax));
  if (discount > 0) total(`Coupon ${order.couponCode ?? ""}`.trim(), `- ${rupees(discount)}`);
  if (charges > 0) total("Delivery charges", rupees(charges));
  y += 2;
  doc.moveTo(left + 270, y).lineTo(left + width, y).strokeColor("#1f2a25").stroke();
  y += 6;
  total("Invoice total", rupees(num(order.grandTotal)), true);
  doc.font("Helvetica").fontSize(9).fillColor(muted).text(`Amount in words: Rupees ${inWords(num(order.grandTotal))}${Math.round((num(order.grandTotal) % 1) * 100) ? ` and ${inWords(Math.round((num(order.grandTotal) % 1) * 100))} Paise` : ""} Only`, left, y + 6, { width });

  // footer
  y = doc.y + 24;
  if (seller.footer) doc.fontSize(9).fillColor("#1f2a25").text(seller.footer, left, y, { width });
  doc.fontSize(8).fillColor(muted).text("Prices include GST. This is a computer-generated invoice and needs no signature.", left, doc.y + 10, { width });
  doc.fontSize(9).fillColor("#1f2a25").text(`For ${seller.legalName || seller.tradeName}`, left, doc.y + 18, { width, align: "right" });
  doc.end();
  return { number: order.invoiceNumber, pdf: await done };
};
