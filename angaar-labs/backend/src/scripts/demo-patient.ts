import "dotenv/config";
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";

// Creates one demo patient for trying out the patient dashboard while developing:
//   npm run db:demo-patient
// The sign-in details are written to frontend/.env.local (never printed), where the patient
// sign-in page picks them up and fills them in. The demo patient comes with made-up consultations
// (all with the demo doctor, never a real one), a prescription, and a few orders.
// The made-up orders do not take anything out of stock.
// Run with --remove to delete the demo patient and all of that again.
// Needs the demo doctor: run `npm run db:demo-doctor` first.

const PHONE = "9000000002"; // not a real subscriber number
const DOCTOR_PHONE = "9000000001";
const FRONTEND_ENV = path.resolve(process.cwd(), "../frontend/.env.local");

const remove = async () => {
  const user = await prisma.user.findUnique({ where: { phone: PHONE }, select: { id: true } });
  if (!user) return console.log("no demo patient to remove");
  const orders = await prisma.order.findMany({ where: { userId: user.id }, select: { id: true } });
  await prisma.payment.deleteMany({ where: { OR: [{ userId: user.id }, { orderId: { in: orders.map((o) => o.id) } }] } });
  await prisma.order.deleteMany({ where: { userId: user.id } });
  await prisma.prescription.deleteMany({ where: { patientId: user.id } });
  await prisma.appointment.deleteMany({ where: { patientId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
  console.log("demo patient removed");
};

const create = async () => {
  const doctorUser = await prisma.user.findUnique({ where: { phone: DOCTOR_PHONE }, select: { doctorProfile: { select: { id: true, commissionPercent: true } } } });
  const doctor = doctorUser?.doctorProfile;
  if (!doctor) throw new Error("The demo doctor does not exist yet. Run `npm run db:demo-doctor` first.");

  const env = existsSync(FRONTEND_ENV) ? readFileSync(FRONTEND_ENV, "utf8") : "";
  let password = env.match(/^NEXT_PUBLIC_DEV_PATIENT_PASSWORD=(.+)$/m)?.[1]?.trim();
  if (!password) {
    password = `Demo-${randomBytes(6).toString("hex")}`;
    appendFileSync(FRONTEND_ENV, `\n# Demo patient for the patient dashboard (made by: npm run db:demo-patient in backend)\nNEXT_PUBLIC_DEV_PATIENT_LOGIN=${PHONE}\nNEXT_PUBLIC_DEV_PATIENT_PASSWORD=${password}\n`);
  }
  const now = new Date();
  const user = await prisma.user.upsert({
    where: { phone: PHONE },
    update: { passwordHash: await bcrypt.hash(password, 12), isActive: true },
    create: {
      phone: PHONE, role: "CUSTOMER", firstName: "Demo", lastName: "Patient", email: "demo.patient@example.com", gender: "MALE",
      dateOfBirth: new Date("1990-04-12T00:00:00Z"), passwordHash: await bcrypt.hash(password, 12), phoneVerifiedAt: now,
    },
  });
  if (await prisma.appointment.count({ where: { patientId: user.id } })) return console.log(`demo patient ready (mobile ${PHONE}); its made-up history is already there`);

  if (!(await prisma.address.count({ where: { userId: user.id } }))) {
    await prisma.address.createMany({
      data: [
        { userId: user.id, label: "Home", fullName: "Demo Patient", phone: PHONE, line1: "14 Lake View Apartments, MG Road", landmark: "City Mall", city: "Pune", state: "Maharashtra", pincode: "411001", isDefault: true },
        { userId: user.id, label: "Office", fullName: "Demo Patient", phone: PHONE, line1: "3rd Floor, Orbit Towers, FC Road", city: "Pune", state: "Maharashtra", pincode: "411004" },
      ],
    });
  }

  // consultations: three finished, one cancelled, one this evening and one in two days
  const days = (n: number) => new Date(now.getTime() + n * 86_400_000);
  const share = (fee: number) => Math.round(fee * (1 - Number(doctor.commissionPercent) / 100) * 100) / 100;
  const base = { doctorId: doctor.id, patientId: user.id, patientPhone: PHONE, durationMinutes: 15 };
  const consult = (number: string, at: Date, status: "COMPLETED" | "CANCELLED" | "CONFIRMED", extra: { name?: string; age?: number; gender?: "MALE" | "FEMALE"; mode?: "VIDEO" | "AUDIO"; symptoms: string }) => {
    const mode = extra.mode ?? "VIDEO";
    const fee = mode === "VIDEO" ? 500 : 400;
    return prisma.appointment.create({
      data: {
        ...base, appointmentNumber: number, scheduledAt: at, status, mode, fee, patientName: extra.name ?? "Demo Patient", patientAge: extra.age ?? 36, patientGender: extra.gender ?? "MALE",
        symptoms: extra.symptoms, doctorEarning: status === "COMPLETED" ? share(fee) : 0, completedAt: status === "COMPLETED" ? new Date(at.getTime() + 15 * 60_000) : null,
        cancelledBy: status === "CANCELLED" ? "PATIENT" : null, cancelReason: status === "CANCELLED" ? "Cancelled by the patient" : null,
        meetingUrl: status === "CONFIRMED" ? `https://meet.jit.si/dochomoeo-demo-${number.toLowerCase()}` : null,
      },
    });
  };
  const first = await consult("DEMO-P001", days(-40), "COMPLETED", { symptoms: "Sneezing and a blocked nose every morning for a month" });
  const second = await consult("DEMO-P002", days(-9), "COMPLETED", { symptoms: "Hair fall and an itchy scalp for three months" });
  await consult("DEMO-P003", days(-3), "COMPLETED", { name: "Riya Patient", age: 8, gender: "FEMALE", mode: "AUDIO", symptoms: "Frequent colds and a cough at night" });
  await consult("DEMO-P004", days(-20), "CANCELLED", { symptoms: "Acidity after meals" });
  const evening = new Date(Math.ceil((now.getTime() + 3 * 60 * 60_000) / 900_000) * 900_000);
  await consult("DEMO-P005", evening, "CONFIRMED", { symptoms: "Follow-up: hair fall is better, the scalp still itches" });
  await consult("DEMO-P006", days(2), "CONFIRMED", { name: "Riya Patient", age: 8, gender: "FEMALE", symptoms: "Follow-up for the night cough" });
  await prisma.doctorReview.create({ data: { doctorId: doctor.id, patientId: user.id, appointmentId: first.id, rating: 5, comment: "Explained everything patiently. The sneezing stopped within two weeks.", createdAt: days(-39) } });

  // medicines we really sell, so "order these" works; plus one the shop does not stock
  const stocked = await prisma.productVariant.findMany({
    where: { isActive: true, stockQuantity: { gt: 20 }, sellingPrice: { gte: 80, lte: 300 }, product: { status: "ACTIVE" } },
    orderBy: { id: "asc" }, take: 4,
    select: { id: true, title: true, sku: true, mrp: true, sellingPrice: true, product: { select: { id: true, name: true, brand: { select: { name: true } }, images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } } } } },
  });
  if (stocked.length < 4) throw new Error("Not enough products in stock to build the demo prescription and orders");
  const line = (v: (typeof stocked)[number], quantity: number) => ({
    productId: v.product.id, variantId: v.id, productName: v.product.name, variantTitle: v.title, sku: v.sku, brandName: v.product.brand?.name ?? null,
    imageUrl: v.product.images[0]?.url ?? null, quantity, mrp: v.mrp, unitPrice: v.sellingPrice, lineTotal: Number(v.sellingPrice) * quantity,
  });

  const older = await prisma.prescription.create({
    data: {
      prescriptionNumber: "RX-DEMO-P001", appointmentId: first.id, doctorId: doctor.id, patientId: user.id, patientName: "Demo Patient", status: "ISSUED", issuedAt: days(-40),
      diagnosis: "Allergic rhinitis", advice: "Steam inhalation at night.\nAvoid cold drinks for two weeks.",
      items: { create: [{ variantId: stocked[2].id, medicineName: stocked[2].product.name, potency: null, dosage: "10 drops in half a cup of water", frequency: "3 times a day", duration: "15 days", quantity: 1 }] },
    },
  });
  await prisma.prescription.create({
    data: {
      prescriptionNumber: "RX-DEMO-P002", appointmentId: second.id, doctorId: doctor.id, patientId: user.id, patientName: "Demo Patient", status: "ISSUED", issuedAt: days(-9),
      diagnosis: "Hair fall with seborrhoeic dermatitis", advice: "Wash the hair twice a week with a mild shampoo.\nEat more protein and green vegetables.", followUpDate: days(5),
      items: {
        create: [
          { variantId: stocked[0].id, medicineName: stocked[0].product.name, dosage: "10 drops in water", frequency: "Twice a day", duration: "30 days", instructions: "Half an hour before food", quantity: 2 },
          { variantId: stocked[1].id, medicineName: stocked[1].product.name, dosage: "10 drops in water", frequency: "Once at night", duration: "30 days", quantity: 1 },
          { medicineName: "Thuja occidentalis", potency: "200C", dosage: "4 pills", frequency: "Once a week", duration: "4 weeks", instructions: "Not stocked by us; any homeopathic pharmacy has it", quantity: 1 },
        ],
      },
    },
  });

  // orders: one delivered (from the first prescription), one on its way
  const address = { customerName: "Demo Patient", customerPhone: PHONE, customerEmail: "demo.patient@example.com", shippingAddress: "14 Lake View Apartments, MG Road, Near City Mall", shippingCity: "Pune", shippingState: "Maharashtra", shippingPincode: "411001" };
  const order = async (number: string, lines: ReturnType<typeof line>[], placed: Date, data: object) => {
    const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
    const shippingCharge = subtotal >= 399 ? 0 : 55;
    return prisma.order.create({ data: { orderNumber: number, channel: "D2C", userId: user.id, subtotal, shippingCharge, grandTotal: subtotal + shippingCharge, placedAt: placed, confirmedAt: placed, ...address, items: { create: lines }, ...data } });
  };
  await order("DH-DEMO-P001", [line(stocked[2], 1), line(stocked[3], 1)], days(-39), {
    status: "DELIVERED", paymentMethod: "COD", paymentStatus: "PAID", prescriptionId: older.id, shippedAt: days(-38), deliveredAt: days(-35),
    history: { create: [{ status: "PENDING", note: "Placed from prescription RX-DEMO-P001", createdAt: days(-39) }, { status: "SHIPPED", note: "Picked up by Delhivery", createdAt: days(-38) }, { status: "DELIVERED", note: "Delivered by the courier", createdAt: days(-35) }] },
    shipments: { create: { carrier: "Delhivery", trackingNumber: "DEMO1234567890", status: "DELIVERED", shippedAt: days(-38), deliveredAt: days(-35) } },
  });
  await order("DH-DEMO-P002", [line(stocked[3], 2)], days(-2), {
    status: "SHIPPED", paymentMethod: "COD", paymentStatus: "PENDING", shippedAt: days(-1), estimatedDelivery: days(2),
    history: { create: [{ status: "CONFIRMED", note: "Placed on the website", createdAt: days(-2) }, { status: "SHIPPED", note: "Picked up by Blue Dart", createdAt: days(-1) }] },
    shipments: { create: { carrier: "Blue Dart", trackingNumber: "DEMO9876543210", status: "IN_TRANSIT", shippedAt: days(-1), estimatedDelivery: days(2) } },
  });
  console.log(`demo patient ready (mobile ${PHONE}); the password is in frontend/.env.local`);
};

(process.argv.includes("--remove") ? remove() : create())
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
