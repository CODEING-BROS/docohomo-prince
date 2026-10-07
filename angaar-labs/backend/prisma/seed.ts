// Creates what a fresh database needs: the first admin and the default B2B price tiers.
// Safe to run again; it only adds what is missing.   npm run db:seed
import "dotenv/config";
import bcrypt from "bcryptjs";
import { pathToFileURL } from "node:url";
import { prisma } from "../src/lib/prisma";

const PRICE_TIERS = [
  { name: "Doctor", description: "Verified doctors buying for their practice", defaultDiscountPercent: 15 },
  { name: "Retailer", description: "Pharmacies and medical stores", defaultDiscountPercent: 20 },
  { name: "Distributor", description: "Wholesalers and distributors", defaultDiscountPercent: 28 },
];

const STREAMS = [
  { name: "Homeopathy", status: "OPEN" as const },
  { name: "Ayurveda", status: "COMING_SOON" as const },
  { name: "Allopathy", status: "COMING_SOON" as const },
  { name: "Unani", status: "COMING_SOON" as const },
  { name: "Siddha", status: "COMING_SOON" as const },
  { name: "Naturopathy", status: "COMING_SOON" as const },
  { name: "Yoga", status: "COMING_SOON" as const },
  { name: "Diet and Nutrition", status: "COMING_SOON" as const },
  { name: "Physiotherapy", status: "COMING_SOON" as const },
  { name: "Psychology and Counselling", status: "COMING_SOON" as const },
  { name: "Veterinary", status: "COMING_SOON" as const },
];
const DOCTOR_TIERS = [
  { name: "Bronze", minPatientsPerDay: 10, maxPatientsPerDay: 12, commissionPercent: 30, description: "Starting level for newly verified doctors" },
  { name: "Silver", minPatientsPerDay: 15, maxPatientsPerDay: 25, commissionPercent: 25, description: "For doctors with a steady record and good reviews" },
  { name: "Gold", minPatientsPerDay: 30, maxPatientsPerDay: 50, commissionPercent: 20, description: "Top level: the most patients and the best share" },
];

export const seedBase = async () => {
  const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) throw new Error("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env");

  const existing = await prisma.user.findFirst({ where: { email, role: "SUPER_ADMIN" } });
  if (!existing) {
    await prisma.user.create({
      data: {
        role: "SUPER_ADMIN",
        firstName: "Admin",
        email,
        passwordHash: await bcrypt.hash(password, 12),
        emailVerifiedAt: new Date(),
      },
    });
    console.log(`created admin ${email}`);
  }

  for (const tier of PRICE_TIERS) {
    await prisma.priceTier.upsert({ where: { name: tier.name }, update: {}, create: tier });
  }
  for (const [index, stream] of STREAMS.entries()) {
    await prisma.consultingStream.upsert({ where: { name: stream.name }, update: {}, create: { ...stream, sortOrder: index } });
  }
  for (const [index, tier] of DOCTOR_TIERS.entries()) {
    await prisma.doctorTier.upsert({ where: { name: tier.name }, update: {}, create: { ...tier, sortOrder: index } });
  }
};

// run directly, not when imported by the legacy import
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  seedBase()
    .then(() => console.log("seed done"))
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
