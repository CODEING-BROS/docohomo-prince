import { Router } from "express";
import { prisma } from "../lib/prisma";

export const notificationRoutes = Router();

type Notice = { key: string; title: string; detail: string; count: number; href: string | null };

// What is waiting for staff right now. Shown under the bell in the admin header.
notificationRoutes.get("/", async (_req, res) => {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [newOrders, openOrders, outOfStock, lowStock, doctors, b2b, returns, enquiries] = await Promise.all([
    prisma.order.count({ where: { placedAt: { gte: since } } }),
    prisma.order.count({ where: { status: { in: ["PENDING", "CONFIRMED", "PROCESSING", "PACKED"] } } }),
    prisma.productVariant.count({ where: { isActive: true, stockQuantity: { lte: 0 } } }),
    prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM "ProductVariant"
      WHERE "isActive" AND "stockQuantity" > 0 AND "stockQuantity" <= "lowStockThreshold"`,
    prisma.doctorProfile.count({ where: { verificationStatus: { in: ["PENDING", "UNDER_REVIEW"] } } }),
    prisma.b2BAccount.count({ where: { status: { in: ["PENDING", "UNDER_REVIEW"] } } }),
    prisma.returnRequest.count({ where: { status: "REQUESTED" } }),
    prisma.enquiry.count({ where: { status: "NEW" } }),
  ]);

  const all: Notice[] = [
    { key: "new-orders", title: "New orders", detail: "Placed in the last 24 hours", count: newOrders, href: "/admin/orders" },
    { key: "open-orders", title: "Orders to process", detail: "Not shipped yet", count: openOrders, href: "/admin/orders?open=1" },
    { key: "returns", title: "Return requests", detail: "Waiting for a decision", count: returns, href: "/admin/returns?status=REQUESTED" },
    { key: "doctors", title: "Doctor registrations", detail: "Waiting for verification", count: doctors, href: "/admin/doctors?status=PENDING" },
    { key: "b2b", title: "B2B applications", detail: "Doctors waiting for wholesale approval", count: b2b, href: "/admin/b2b?status=PENDING" },
    { key: "out-of-stock", title: "Out of stock", detail: "Variants with nothing left", count: outOfStock, href: "/admin/products?stock=out" },
    { key: "low-stock", title: "Running low", detail: "Variants at or below their limit", count: lowStock[0]?.n ?? 0, href: "/admin/products?stock=low" },
    { key: "enquiries", title: "New enquiries", detail: "Contact, wholesale and consultation forms", count: enquiries, href: "/admin/enquiries?status=NEW" },
  ];

  res.json({ items: all.filter((notice) => notice.count > 0) });
});
