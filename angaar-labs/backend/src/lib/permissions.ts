import type { NextFunction, Request, Response } from "express";
import { HttpError } from "./http";
import { prisma } from "./prisma";

// Who may see and change what in the admin panel.
//
// The panel is cut into areas (orders, catalog, doctors…). A staff role says, for each area,
// "cannot see it", "can see it" or "can see and change it". Every staff member has one role.
//   - the owner (SUPER_ADMIN) can always do everything, and nobody can take that away
//   - an old admin account that has not been given a role yet keeps full access, so nobody is
//     locked out the day this is switched on
//   - any other staff member without a role can sign in but sees nothing
// The check is done here, on the server, for every request; hiding menu items is only a courtesy.

export const AREAS = [
  { key: "dashboard", label: "Dashboard", detail: "Sales numbers and what needs attention" },
  { key: "orders", label: "Orders", detail: "Orders, placing orders for customers, invoices for an order" },
  { key: "returns", label: "Returns", detail: "Return requests, receiving parcels back" },
  { key: "payments", label: "Payments and refunds", detail: "Payments received, sending refunds" },
  { key: "shipping", label: "Shipping", detail: "Delivery charges, courier settings, parcels" },
  { key: "customers", label: "Customers", detail: "Customer accounts" },
  { key: "b2b", label: "B2B customers", detail: "Wholesale accounts and their approval" },
  { key: "catalog", label: "Catalog", detail: "Brands, categories, products, stock" },
  { key: "discounts", label: "Discounts and coupons", detail: "Wholesale price rules and coupon codes" },
  { key: "doctors", label: "Doctors", detail: "Doctors, verification, streams and tests, levels, reviews" },
  { key: "consultations", label: "Consultations", detail: "Appointments and prescriptions" },
  { key: "payouts", label: "Doctor payouts", detail: "What doctors are owed and paying them" },
  { key: "content", label: "Content", detail: "Banners, blog, enquiries" },
  { key: "reports", label: "Reports", detail: "Sales reports and the report emails" },
  { key: "settings", label: "Settings", detail: "Automatic messages, invoice details and tax rates" },
  { key: "staff", label: "Staff and roles", detail: "Who can sign in to this panel and what they can do" },
] as const;
export type Area = (typeof AREAS)[number]["key"];
export type Level = "view" | "manage";
const AREA_KEYS = AREAS.map((a) => a.key) as readonly string[];
const LABEL = new Map(AREAS.map((a) => [a.key as string, a.label]));

/** Every permission there is: what the owner has. */
export const EVERYTHING = AREAS.flatMap((a) => [`${a.key}.view`, `${a.key}.manage`]);
export const validPermission = (key: string) => EVERYTHING.includes(key);

/**
 * Which area each part of the admin API belongs to, by the start of its address (after /api/admin/).
 * The longest match wins. A second area listed means "its staff may read this too": for example the
 * order screen needs to read the courier's status, and the appointment screen the list of doctors.
 */
const ROUTES: [prefix: string, area: Area, alsoReadableBy?: Area[]][] = [
  ["dashboard", "dashboard"],
  ["reports", "reports"],
  ["orders", "orders"],
  ["invoices/orders", "orders"],
  ["invoices", "settings"],
  ["messages", "settings"],
  ["returns", "returns"],
  ["refunds", "payments", ["returns"]],
  ["payments", "payments"],
  ["shipping", "shipping"],
  ["shiprocket", "shipping", ["orders", "returns"]],
  ["customers", "customers"],
  ["b2b", "b2b", ["orders", "discounts"]],
  ["products", "catalog", ["discounts", "consultations"]],
  ["product-import", "catalog"],
  ["brands", "catalog", ["discounts"]],
  ["categories", "catalog", ["discounts"]],
  ["inventory", "catalog"],
  ["discounts", "discounts"],
  ["coupons", "discounts"],
  ["doctors", "doctors", ["consultations", "payouts"]],
  ["streams", "doctors"],
  ["doctor-tiers", "doctors"],
  ["doctor-reviews", "doctors"],
  ["appointments", "consultations"],
  ["prescriptions", "consultations"],
  ["payouts", "payouts"],
  ["enquiries", "content"],
  ["banners", "content"],
  ["blog", "content"],
  ["staff", "staff"],
  ["data-import", "staff"], // and the owner only, checked in the route itself
  // "notifications" (the bell) and "uploads" are open to every staff member
];
const SORTED = [...ROUTES].sort((a, b) => b[0].length - a[0].length);
const routeOf = (path: string) => {
  const clean = path.replace(/^\/+/, "");
  return SORTED.find(([prefix]) => clean === prefix || clean.startsWith(`${prefix}/`)) ?? null;
};

// ───────────────────────────────────────────── what one person may do

type Access = { active: boolean; role: string; roleName: string; permissions: Set<string> };
const cache = new Map<number, { at: number; access: Access }>();
const CACHE_MS = 15_000; // a change of role reaches a signed-in person within this long

/** Call after changing a role or a staff member, so the change is felt at once. */
export const forgetAccess = (userId?: number) => (userId === undefined ? cache.clear() : cache.delete(userId));

export const accessOf = async (userId: number): Promise<Access> => {
  const kept = cache.get(userId);
  if (kept && Date.now() - kept.at < CACHE_MS) return kept.access;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, isActive: true, staffRole: { select: { name: true, permissions: true } } } });
  const access: Access = !user
    ? { active: false, role: "", roleName: "", permissions: new Set() }
    : user.role === "SUPER_ADMIN" ? { active: user.isActive, role: user.role, roleName: "Owner", permissions: new Set(EVERYTHING) }
    : user.staffRole ? { active: user.isActive, role: user.role, roleName: user.staffRole.name, permissions: new Set(user.staffRole.permissions.filter(validPermission)) }
    : user.role === "ADMIN" ? { active: user.isActive, role: user.role, roleName: "Administrator (no role chosen yet)", permissions: new Set(EVERYTHING) }
    : { active: user.isActive, role: user.role, roleName: "No role", permissions: new Set() };
  cache.set(userId, { at: Date.now(), access });
  return access;
};

/** "manage" includes "view": someone who can change orders can also see them. */
export const allows = (permissions: Set<string>, area: Area, level: Level) =>
  permissions.has(`${area}.manage`) || (level === "view" && permissions.has(`${area}.view`));

/** The list sent to the browser, so it can hide what the person cannot use. */
export const permissionList = (permissions: Set<string>) => EVERYTHING.filter((key) => {
  const [area, level] = key.split(".") as [Area, Level];
  return allows(permissions, area, level);
});

/** Runs on every admin request, after the sign-in check: is this person allowed to do this here? */
export const requirePermission = async (req: Request, _res: Response, next: NextFunction) => {
  const access = await accessOf(req.user!.id);
  if (!access.active) throw new HttpError(401, "This account is switched off. Ask the owner.");
  const route = routeOf(req.path);
  if (!route) return next();
  const [, area, alsoReadableBy = []] = route;
  const reading = req.method === "GET" || req.method === "HEAD";
  if (allows(access.permissions, area, reading ? "view" : "manage")) return next();
  if (reading && alsoReadableBy.some((other) => allows(access.permissions, other, "view"))) return next();
  const what = LABEL.get(area)?.toLowerCase() ?? area;
  throw new HttpError(403, reading ? `Your role (${access.roleName}) does not include ${what}.` : `Your role (${access.roleName}) can look at ${what} but not change it.`);
};

// ───────────────────────────────────────────── starting roles

const all = (...areas: Area[]) => areas.flatMap((a) => [`${a}.view`, `${a}.manage`]);
const see = (...areas: Area[]) => areas.map((a) => `${a}.view`);

/** Ready-made roles, added once when there are none. The owner can change or delete any of them. */
const STARTERS: { name: string; description: string; permissions: string[] }[] = [
  { name: "Manager", description: "Runs the shop day to day: everything except staff and roles.", permissions: all(...(AREA_KEYS.filter((k) => k !== "staff") as Area[])) },
  { name: "Order desk", description: "Takes and packs orders, handles returns and delivery.", permissions: [...all("orders", "returns", "shipping", "customers"), ...see("dashboard", "catalog", "payments", "b2b")] },
  { name: "Catalog manager", description: "Keeps products, prices, stock and offers up to date.", permissions: [...all("catalog", "discounts", "content"), ...see("dashboard", "orders")] },
  { name: "Doctor desk", description: "Verifies doctors and looks after consultations.", permissions: [...all("doctors", "consultations"), ...see("dashboard", "payouts")] },
  { name: "Accounts", description: "Payments, refunds, doctor payouts, invoices and reports.", permissions: [...all("payments", "payouts", "reports", "settings"), ...see("dashboard", "orders", "returns", "customers", "b2b", "doctors")] },
  { name: "Viewer", description: "Can look at everything except staff, and change nothing.", permissions: see(...(AREA_KEYS.filter((k) => k !== "staff") as Area[])) },
];

export const ensureStaffRoles = async () => {
  if (await prisma.staffRole.count()) return;
  await prisma.staffRole.createMany({ data: STARTERS, skipDuplicates: true });
};
