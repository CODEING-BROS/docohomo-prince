import * as events from "../lib/events";
import { Router } from "express";
import { z } from "zod";
import { HttpError, num, optionalString } from "../lib/http";
import { autoInvoice } from "../lib/invoice";
import { buildQuote } from "./shop.routes";
import { priceB2BCart, shippingFor } from "../lib/pricing";
import { prisma } from "../lib/prisma";

// Placing an order from the admin panel: find packs to add, price the cart, create the order.
// Two kinds: a wholesale (B2B) order for a doctor, and a retail order for a customer who phoned,
// wrote in or is standing at the counter (the routes whose address starts with /retail).
// Mounted at /api/admin/orders before the list and detail routes.
export const orderCreateRoutes = Router();

// Packs to add to an order or a discount rule, found by product name or SKU.
orderCreateRoutes.get("/variant-search", async (req, res) => {
  const { q } = z.object({ q: optionalString }).parse(req.query);
  const variants = await prisma.productVariant.findMany({
    where: {
      isActive: true,
      product: { status: "ACTIVE" },
      ...(q ? { OR: [{ sku: { contains: q, mode: "insensitive" } }, { product: { name: { contains: q, mode: "insensitive" } } }] } : {}),
    },
    orderBy: [{ product: { name: "asc" } }, { sortOrder: "asc" }],
    take: 25,
    select: {
      id: true, title: true, sku: true, sellingPrice: true, b2bPrice: true, stockQuantity: true, b2bMinQuantity: true,
      product: { select: { id: true, name: true, brand: { select: { name: true } } } },
    },
  });
  res.json({
    items: variants.map((v) => ({
      variantId: v.id, productId: v.product.id, productName: v.product.name, brandName: v.product.brand?.name ?? null,
      title: v.title, sku: v.sku, sellingPrice: num(v.sellingPrice), b2bPrice: v.b2bPrice === null ? null : num(v.b2bPrice),
      stock: v.stockQuantity, minimumQuantity: v.b2bMinQuantity,
    })),
  });
});

const cartInput = z.object({
  b2bAccountId: z.number().int().positive(),
  lines: z.array(z.object({ variantId: z.number().int().positive(), quantity: z.coerce.number().int().min(1).max(100_000) })).min(1, "Add at least one product").max(200),
});

/** Prices a cart and adds delivery. Used for the live preview and again, unchanged, when the order is created. */
const quote = async (input: z.infer<typeof cartInput>) => {
  // the same pack added twice counts as one line
  const merged = new Map<number, number>();
  for (const line of input.lines) merged.set(line.variantId, (merged.get(line.variantId) ?? 0) + line.quantity);
  const cart = await priceB2BCart(input.b2bAccountId, [...merged].map(([variantId, quantity]) => ({ variantId, quantity })));
  const shipping = await shippingFor("B2B", cart.subtotal);
  return { ...cart, shippingCharge: shipping.charge, shippingRule: shipping.ruleName, grandTotal: Math.round((cart.subtotal + shipping.charge) * 100) / 100 };
};

orderCreateRoutes.post("/quote", async (req, res) => {
  res.json(await quote(cartInput.parse(req.body)));
});

const orderInput = cartInput.extend({
  paymentMethod: z.enum(["ONLINE", "BANK_TRANSFER", "CREDIT", "COD"]),
  paid: z.boolean().default(false),
  shippingAddress: z.string().trim().min(3, "Enter the delivery address").max(400),
  shippingCity: z.string().trim().min(2, "Enter the city").max(80),
  shippingState: z.string().trim().min(2, "Choose the state").max(80),
  shippingPincode: z.string().trim().regex(/^\d{6}$/, "A pincode has 6 digits"),
  adminNote: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(1000).nullable().optional()),
});

const newOrderNumber = async () => {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()).replace(/-/g, "").slice(2);
  for (;;) {
    const orderNumber = `DH${day}-${Math.floor(10000 + Math.random() * 90000)}`;
    if (!(await prisma.order.findUnique({ where: { orderNumber }, select: { id: true } }))) return orderNumber;
  }
};

orderCreateRoutes.post("/", async (req, res) => {
  const input = orderInput.parse(req.body);
  const priced = await quote(input);

  const account = await prisma.b2BAccount.findUnique({
    where: { id: input.b2bAccountId },
    include: { user: { select: { id: true, phone: true, email: true } } },
  });
  if (!account) throw new HttpError(400, "That B2B customer does not exist");
  if (account.status !== "APPROVED") throw new HttpError(400, "This B2B customer is not approved yet");

  const blocked = priced.lines.find((line) => line.problem);
  if (blocked) throw new HttpError(400, `${blocked.productName} (${blocked.variantTitle}): ${blocked.problem}`);

  if (input.paymentMethod === "CREDIT") {
    const owed = await prisma.order.aggregate({
      where: { b2bAccountId: account.id, paymentMethod: "CREDIT", paymentStatus: { in: ["PENDING", "PARTIALLY_PAID"] }, status: { notIn: ["CANCELLED", "RETURNED", "REFUNDED"] } },
      _sum: { grandTotal: true },
    });
    const limit = num(account.creditLimit);
    const afterThis = num(owed._sum.grandTotal) + priced.grandTotal;
    if (afterThis > limit) {
      throw new HttpError(400, limit === 0 ? "This customer has no credit limit. Choose another way to pay." : `This would take what they owe to ₹${afterThis.toFixed(2)}, above their ₹${limit.toFixed(2)} credit limit.`);
    }
  }

  const orderNumber = await newOrderNumber();
  const paid = input.paid && input.paymentMethod !== "CREDIT";
  const now = new Date();

  const order = await prisma.$transaction(async (tx) => {
    // take the stock first; if another order got there before us, stop
    for (const line of priced.lines) {
      const taken = await tx.productVariant.updateMany({
        where: { id: line.variantId, stockQuantity: { gte: line.quantity } },
        data: { stockQuantity: { decrement: line.quantity } },
      });
      if (taken.count === 0) throw new HttpError(409, `${line.productName} (${line.variantTitle}) just went out of stock`);
    }

    const created = await tx.order.create({
      data: {
        orderNumber,
        channel: "B2B",
        userId: account.user.id,
        b2bAccountId: account.id,
        status: "CONFIRMED",
        confirmedAt: now,
        paymentMethod: input.paymentMethod,
        paymentStatus: paid ? "PAID" : "PENDING",
        subtotal: priced.subtotal,
        discountTotal: priced.savings, // saved against retail prices, shown for information
        shippingCharge: priced.shippingCharge,
        grandTotal: priced.grandTotal,
        customerName: account.contactName ?? account.businessName,
        customerPhone: account.contactPhone ?? account.user.phone,
        customerEmail: account.contactEmail ?? account.user.email,
        shippingAddress: input.shippingAddress,
        shippingCity: input.shippingCity,
        shippingState: input.shippingState,
        shippingPincode: input.shippingPincode,
        billingName: account.businessName,
        billingGstNumber: account.gstNumber,
        adminNote: input.adminNote,
        items: {
          create: priced.lines.map((line) => ({
            productId: line.productId, variantId: line.variantId, productName: line.productName, variantTitle: line.variantTitle,
            sku: line.sku, brandName: line.brandName, imageUrl: line.imageUrl, quantity: line.quantity, mrp: line.mrp,
            unitPrice: line.unitPrice, discount: Math.round((line.retailPrice - line.unitPrice) * line.quantity * 100) / 100,
            gstPercent: line.gstPercent, lineTotal: line.lineTotal,
          })),
        },
        history: { create: { status: "CONFIRMED", note: "Placed from the admin panel", changedById: req.user!.id } },
        payments: paid ? { create: { userId: account.user.id, provider: "MANUAL", method: input.paymentMethod, amount: priced.grandTotal, status: "SUCCESS", paidAt: now } } : undefined,
      },
    });

    for (const line of priced.lines) {
      const after = await tx.productVariant.findUnique({ where: { id: line.variantId }, select: { stockQuantity: true } });
      await tx.inventoryMovement.create({
        data: { variantId: line.variantId, type: "SALE", quantity: -line.quantity, balanceAfter: after?.stockQuantity ?? 0, orderId: created.id, note: `Order ${orderNumber}`, createdById: req.user!.id },
      });
    }
    await tx.auditLog.create({ data: { actorId: req.user!.id, action: "order.create", entity: "Order", entityId: String(created.id) } });
    return created;
  });

  events.orderPlaced(order.id, { tellStaff: false }); // staff placed it themselves
  res.status(201).json({ id: order.id, orderNumber: order.orderNumber });
});

// ───────────────────────────────────────────── a retail order for a customer

/** Customers found by name, mobile number or email, with the addresses they have used. */
orderCreateRoutes.get("/customer-search", async (req, res) => {
  const { q } = z.object({ q: optionalString }).parse(req.query);
  if (!q || q.length < 3) return res.json({ items: [] });
  const digits = q.replace(/[^0-9]/g, "");
  const users = await prisma.user.findMany({
    where: {
      role: { in: ["CUSTOMER", "DOCTOR"] }, isActive: true,
      OR: [
        ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : []),
        { firstName: { contains: q, mode: "insensitive" as const } }, { lastName: { contains: q, mode: "insensitive" as const } }, { email: { contains: q, mode: "insensitive" as const } },
      ],
    },
    orderBy: { id: "desc" }, take: 8,
    select: {
      id: true, firstName: true, lastName: true, phone: true, email: true, _count: { select: { orders: true } },
      addresses: { orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }], take: 3, select: { id: true, line1: true, landmark: true, city: true, state: true, pincode: true } },
    },
  });
  res.json({
    items: users.map((u) => ({ id: u.id, name: [u.firstName, u.lastName].filter(Boolean).join(" "), phone: u.phone, email: u.email, orders: u._count.orders, addresses: u.addresses })),
  });
});

const retailCart = z.object({
  userId: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.number().int().positive().optional()),
  lines: z.array(z.object({ variantId: z.coerce.number().int().positive(), quantity: z.coerce.number().int().min(1).max(9999) })).min(1, "Add at least one product").max(100),
  couponCode: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(40).optional()),
  payment: z.enum(["COD", "UPI", "BANK", "CASH"]).default("COD"),
  counter: z.boolean().default(false), // handed over at the counter: nothing to deliver
});

const retailQuote = async (input: z.infer<typeof retailCart>) => {
  const merged = new Map<number, number>();
  for (const line of input.lines) merged.set(line.variantId, (merged.get(line.variantId) ?? 0) + line.quantity);
  const lines = [...merged].map(([variantId, quantity]) => ({ variantId, quantity }));
  // "pay on delivery" is the only way that adds the cash-on-delivery fee
  return buildQuote(input.userId, { lines, couponCode: input.couponCode, paymentMethod: input.payment === "COD" ? "COD" : "ONLINE" }, { retail: true, noDelivery: input.counter });
};

orderCreateRoutes.post("/retail-quote", async (req, res) => {
  const { accountId: _account, wholesale: _wholesale, onlinePayment: _online, onlineTest: _test, ...quote } = await retailQuote(retailCart.parse(req.body));
  res.json(quote);
});

const emptyToNull = (v: unknown) => (v === "" ? null : v);
const retailOrder = retailCart.extend({
  customer: z.object({
    name: z.string().trim().min(2, "Enter the customer's name").max(120),
    phone: z.string().trim().regex(/^[6-9][0-9]{9}$/, "Enter the customer's 10-digit mobile number"),
    email: z.preprocess(emptyToNull, z.string().trim().toLowerCase().email("That email address does not look right").max(160).nullable().optional()),
  }),
  address: z.object({
    line1: z.preprocess(emptyToNull, z.string().trim().max(300).nullable().optional()),
    landmark: z.preprocess(emptyToNull, z.string().trim().max(120).nullable().optional()),
    city: z.preprocess(emptyToNull, z.string().trim().max(80).nullable().optional()),
    state: z.preprocess(emptyToNull, z.string().trim().max(80).nullable().optional()),
    pincode: z.preprocess(emptyToNull, z.string().trim().regex(/^[0-9]{6}$/, "A pincode has 6 digits").nullable().optional()),
  }),
  paid: z.boolean().default(false),
  reference: z.preprocess(emptyToNull, z.string().trim().max(120).nullable().optional()),
  adminNote: z.preprocess(emptyToNull, z.string().trim().max(1000).nullable().optional()),
  expectedTotal: z.coerce.number().optional(),
});

const STAFF_ROLES = ["SUPER_ADMIN", "ADMIN", "STAFF"];

orderCreateRoutes.post("/retail", async (req, res) => {
  const input = retailOrder.parse(req.body);
  const { address, customer } = input;

  // how the money comes in
  const paid = input.payment === "COD" ? false : input.payment === "BANK" ? input.paid : true;
  if (input.counter && !paid) throw new HttpError(400, "Goods handed over at the counter are paid for there. Choose UPI, cash or a bank transfer already received.");
  if (paid && input.payment !== "CASH" && !input.reference) throw new HttpError(400, "Enter the UPI or bank reference for the payment");
  if (!input.counter) {
    if (!address.line1 || address.line1.length < 5) throw new HttpError(400, "Enter the delivery address");
    if (!address.city) throw new HttpError(400, "Enter the city");
    if (!address.state) throw new HttpError(400, "Choose the state");
    if (!address.pincode) throw new HttpError(400, "Enter the 6-digit pincode");
  }

  // who the order is for: someone we know by this number, or a new customer
  let user = input.userId
    ? await prisma.user.findUnique({ where: { id: input.userId }, select: { id: true, role: true, firstName: true, email: true } })
    : await prisma.user.findUnique({ where: { phone: customer.phone }, select: { id: true, role: true, firstName: true, email: true } });
  if (input.userId && !user) throw new HttpError(400, "That customer does not exist any more");
  if (user && STAFF_ROLES.includes(user.role)) throw new HttpError(400, "This mobile number belongs to a staff account. Use the customer's own number.");

  const quote = await retailQuote({ ...input, userId: user?.id });
  const blocked = quote.lines.find((line) => line.problem);
  if (blocked) throw new HttpError(409, `${blocked.productName} (${blocked.variantTitle}): ${blocked.problem}`);
  if (input.couponCode && quote.couponError) throw new HttpError(400, quote.couponError);
  if (input.expectedTotal !== undefined && Math.abs(input.expectedTotal - quote.grandTotal) > 0.5) throw new HttpError(409, "Prices changed while you were filling this in. Check the total and place the order again.");
  if (!input.counter && address.pincode) {
    const known = await prisma.pincodeServiceability.findUnique({ where: { pincode: address.pincode } });
    if (known && !known.isServiceable) throw new HttpError(400, "We do not deliver to this pincode");
    if (input.payment === "COD" && (!quote.codAvailable || (known && !known.codAvailable))) throw new HttpError(400, "Pay on delivery is not available for this order. Take the payment first.");
  }

  const orderNumber = await newOrderNumber();
  const now = new Date();
  const method = input.payment === "UPI" ? "ONLINE" : input.payment === "BANK" ? "BANK_TRANSFER" : "COD"; // cash is "pay on delivery", already paid
  const addressText = [address.line1, address.landmark ? `Near ${address.landmark}` : null].filter(Boolean).join(", ") || null;
  const status = input.counter ? "DELIVERED" : "CONFIRMED";

  const order = await prisma.$transaction(async (tx) => {
    if (!user) {
      const emailFree = customer.email ? !(await tx.user.findFirst({ where: { email: customer.email }, select: { id: true } })) : false;
      user = await tx.user.create({ data: { role: "CUSTOMER", firstName: customer.name, phone: customer.phone, email: emailFree ? customer.email : null }, select: { id: true, role: true, firstName: true, email: true } });
      await tx.auditLog.create({ data: { actorId: req.user!.id, action: "customer.create", entity: "User", entityId: String(user.id) } });
    }
    const buyer = user;

    for (const line of quote.lines) {
      const taken = await tx.productVariant.updateMany({ where: { id: line.variantId, stockQuantity: { gte: line.quantity } }, data: { stockQuantity: { decrement: line.quantity } } });
      if (taken.count === 0) throw new HttpError(409, `${line.productName} (${line.variantTitle}) just went out of stock`);
    }

    const created = await tx.order.create({
      data: {
        orderNumber, channel: "D2C", userId: buyer.id, status, confirmedAt: now, ...(input.counter ? { shippedAt: now, deliveredAt: now } : {}),
        paymentMethod: method, paymentStatus: paid ? "PAID" : "PENDING",
        subtotal: quote.subtotal, discountTotal: quote.savings, couponCode: quote.coupon?.code ?? null, couponDiscount: quote.coupon?.discount ?? 0,
        shippingCharge: quote.shippingCharge, codCharge: quote.codCharge, grandTotal: quote.grandTotal,
        customerName: customer.name, customerPhone: customer.phone, customerEmail: customer.email ?? buyer.email ?? null,
        shippingAddress: addressText, shippingCity: address.city ?? null, shippingState: address.state ?? null, shippingPincode: address.pincode ?? null,
        adminNote: input.adminNote ?? null,
        items: {
          create: quote.lines.map((line) => ({
            productId: line.productId, variantId: line.variantId, productName: line.productName, variantTitle: line.variantTitle, sku: line.sku,
            brandName: line.brandName, imageUrl: line.imageUrl, quantity: line.quantity, mrp: line.mrp, unitPrice: line.unitPrice,
            discount: Math.round((line.mrp - line.unitPrice) * line.quantity * 100) / 100, gstPercent: line.gstPercent, lineTotal: line.lineTotal,
          })),
        },
        history: { create: { status, note: input.counter ? "Sold at the counter by staff" : "Placed by staff for the customer", changedById: req.user!.id } },
        payments: paid
          ? { create: { userId: buyer.id, provider: "MANUAL", method: input.payment, providerRef: input.reference ?? null, amount: quote.grandTotal, status: "SUCCESS", paidAt: now } }
          : undefined,
      },
    });

    for (const line of quote.lines) {
      const after = await tx.productVariant.findUnique({ where: { id: line.variantId }, select: { stockQuantity: true } });
      await tx.inventoryMovement.create({ data: { variantId: line.variantId, type: "SALE", quantity: -line.quantity, balanceAfter: after?.stockQuantity ?? 0, orderId: created.id, note: `Order ${orderNumber}`, createdById: req.user!.id } });
    }
    if (quote.coupon) {
      await tx.coupon.update({ where: { id: quote.coupon.id }, data: { usedCount: { increment: 1 } } });
      await tx.couponRedemption.create({ data: { couponId: quote.coupon.id, userId: buyer.id, orderId: created.id } });
    }
    // keep the address for next time, unless we already have it
    if (!input.counter && address.line1 && address.pincode) {
      const same = await tx.address.findFirst({ where: { userId: buyer.id, line1: address.line1, pincode: address.pincode }, select: { id: true } });
      if (!same) {
        const first = (await tx.address.count({ where: { userId: buyer.id } })) === 0;
        await tx.address.create({ data: { userId: buyer.id, label: "Home", fullName: customer.name, phone: customer.phone, line1: address.line1, landmark: address.landmark ?? null, city: address.city, state: address.state, pincode: address.pincode, isDefault: first } });
      }
    }
    if (!buyer.firstName) await tx.user.update({ where: { id: buyer.id }, data: { firstName: customer.name } });
    await tx.auditLog.create({ data: { actorId: req.user!.id, action: "order.create", entity: "Order", entityId: String(created.id), changes: { channel: "D2C", counter: input.counter, payment: input.payment } } });
    return created;
  });

  // a counter sale is finished: it only needs its invoice. Anything else goes the usual way (message, invoice, courier).
  if (input.counter) void autoInvoice(order.id, "dispatch");
  else events.orderPlaced(order.id, { tellStaff: false });
  res.status(201).json({ id: order.id, orderNumber: order.orderNumber, total: quote.grandTotal });
});
