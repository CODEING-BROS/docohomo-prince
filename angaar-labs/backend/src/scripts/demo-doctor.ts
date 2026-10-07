import "dotenv/config";
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";

// Creates one demo doctor for trying out the doctor dashboard while developing:
//   npm run db:demo-doctor
// The sign-in details are written to frontend/.env.local (never printed), where the doctor
// sign-in page picks them up and fills them in. The demo doctor comes with six months of made-up
// consultations, payouts and reviews, and is never shown to patients.
// Run with --remove to delete the demo doctor and all of that again.

const PHONE = "9000000001"; // not a real subscriber number
const FRONTEND_ENV = path.resolve(process.cwd(), "../frontend/.env.local");

const remove = async () => {
  const user = await prisma.user.findUnique({ where: { phone: PHONE }, select: { id: true, doctorProfile: { select: { id: true } } } });
  if (!user) return console.log("no demo doctor to remove");
  if (user.doctorProfile) {
    const doctorId = user.doctorProfile.id;
    await prisma.appointment.deleteMany({ where: { doctorId } });
    await prisma.doctorPayout.deleteMany({ where: { doctorId } });
  }
  await prisma.order.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
  console.log("demo doctor removed");
};

// A believable six months of practice for the demo doctor, so the dashboard has something to show:
// finished consultations with earnings, a few missed ones, payouts, reviews, and bookings for today and tomorrow.
const PATIENTS = ["Aarav Mehta", "Priya Nair", "Rohit Verma", "Sneha Kulkarni", "Imran Sheikh", "Kavita Joshi", "Manish Gupta", "Anjali Rao", "Vikram Singh", "Neha Bansal", "Suresh Pillai", "Divya Menon"];
const PROBLEMS = ["Hair fall for three months", "Seasonal allergy with sneezing", "Acidity after meals", "Recurring migraine", "Skin rash on both arms", "Joint pain in the mornings", "Trouble sleeping", "Child with frequent colds"];
const COMMENTS = ["Listened patiently and explained everything clearly.", "The medicines worked within a week. Thank you doctor.", "Very helpful consultation.", "Good advice, would consult again.", null, "Call started a few minutes late but the doctor was thorough."];

const addHistory = async (doctorId: number, patientId: number, commissionPercent: number) => {
  if (await prisma.appointment.count({ where: { doctorId } })) return console.log("demo history already there");

  // the same "random" numbers every run, so the demo looks the same each time
  let seed = 20261005;
  const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = <T,>(list: T[]) => list[Math.floor(random() * list.length)];
  const share = (fee: number) => Math.round(fee * (1 - commissionPercent / 100) * 100) / 100;
  const IST = 5.5 * 60 * 60 * 1000;
  const startOfToday = new Date(Math.floor((Date.now() + IST) / 86_400_000) * 86_400_000 - IST); // midnight in India
  let number = 0;
  const row = (at: Date, status: "COMPLETED" | "NO_SHOW" | "CANCELLED" | "CONFIRMED") => {
    const mode = random() < 0.65 ? ("VIDEO" as const) : ("AUDIO" as const);
    const fee = mode === "VIDEO" ? 500 : 400;
    return {
      appointmentNumber: `DEMO-${String(++number).padStart(4, "0")}`, doctorId, patientId, patientName: pick(PATIENTS), patientAge: 18 + Math.floor(random() * 50),
      patientGender: random() < 0.5 ? ("FEMALE" as const) : ("MALE" as const), mode, scheduledAt: at, durationMinutes: 15, status, fee,
      doctorEarning: status === "COMPLETED" ? share(fee) : 0, symptoms: pick(PROBLEMS),
      completedAt: status === "COMPLETED" ? new Date(at.getTime() + 15 * 60 * 1000) : null,
      cancelledBy: status === "CANCELLED" ? "PATIENT" : null,
      meetingUrl: status === "CONFIRMED" ? `https://meet.jit.si/dochomoeo-demo-${number}` : null,
    };
  };

  const rows: ReturnType<typeof row>[] = [];
  for (let back = 180; back >= 1; back--) {
    const day = new Date(startOfToday.getTime() - back * 86_400_000);
    if (new Date(day.getTime() + IST).getUTCDay() === 0) continue; // closed on Sundays
    // the practice grows over the six months
    const busy = 0.6 + (180 - back) / 110;
    const count = Math.floor(random() * busy * 2.4);
    for (let n = 0; n < count; n++) {
      const at = new Date(day.getTime() + (10 * 60 + n * 30 + Math.floor(random() * 2) * 15) * 60 * 1000);
      const chance = random();
      rows.push(row(at, chance < 0.86 ? "COMPLETED" : chance < 0.93 ? "NO_SHOW" : "CANCELLED"));
    }
  }
  // today: one done this morning, two still to come; and three tomorrow
  const now = Date.now();
  rows.push(row(new Date(Math.min(now - 2 * 60 * 60 * 1000, startOfToday.getTime() + 10 * 60 * 60 * 1000)), "COMPLETED"));
  for (const minutes of [45, 120]) rows.push(row(new Date(Math.ceil((now + minutes * 60 * 1000) / 900_000) * 900_000), "CONFIRMED"));
  for (const hour of [10, 10.5, 17]) rows.push(row(new Date(startOfToday.getTime() + 86_400_000 + hour * 60 * 60 * 1000), "CONFIRMED"));
  await prisma.appointment.createMany({ data: rows });

  // everything finished more than two weeks ago has been paid out, month by month
  const done = await prisma.appointment.findMany({ where: { doctorId, status: "COMPLETED" }, orderBy: { completedAt: "asc" }, select: { id: true, completedAt: true, doctorEarning: true } });
  const cutoff = new Date(startOfToday.getTime() - 14 * 86_400_000);
  const byMonth = new Map<string, typeof done>();
  for (const a of done.filter((d) => d.completedAt! < cutoff)) {
    const month = new Date(a.completedAt!.getTime() + IST).toISOString().slice(0, 7);
    byMonth.set(month, [...(byMonth.get(month) ?? []), a]);
  }
  for (const [month, list] of byMonth) {
    const first = new Date(`${month}-01T00:00:00Z`);
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
    const payout = await prisma.doctorPayout.create({
      data: { doctorId, periodStart: first, periodEnd: last, amount: list.reduce((sum, a) => sum + Number(a.doctorEarning), 0), status: "PAID", reference: `DEMO${month.replace("-", "")}`, paidAt: new Date(last.getTime() + 5 * 86_400_000), createdAt: new Date(last.getTime() + 3 * 86_400_000) },
    });
    await prisma.appointment.updateMany({ where: { id: { in: list.map((a) => a.id) } }, data: { payoutId: payout.id } });
  }

  // about one patient in three leaves a review
  const reviewed = done.filter(() => random() < 0.33);
  await prisma.doctorReview.createMany({
    data: reviewed.map((a) => ({ doctorId, patientId, appointmentId: a.id, rating: random() < 0.7 ? 5 : random() < 0.75 ? 4 : 3, comment: pick(COMMENTS), createdAt: new Date(a.completedAt!.getTime() + 3 * 60 * 60 * 1000) })),
  });
  const summary = await prisma.doctorReview.aggregate({ where: { doctorId, status: "APPROVED" }, _avg: { rating: true }, _count: true });
  await prisma.doctorProfile.update({ where: { id: doctorId }, data: { ratingAverage: Math.round((summary._avg.rating ?? 0) * 100) / 100, ratingCount: summary._count } });

  // open Monday to Saturday, mornings and evenings
  if (!(await prisma.doctorAvailability.count({ where: { doctorId } }))) {
    await prisma.doctorAvailability.createMany({
      data: [1, 2, 3, 4, 5, 6].flatMap((dayOfWeek) => [{ doctorId, dayOfWeek, startTime: "10:00", endTime: "13:00" }, { doctorId, dayOfWeek, startTime: "17:00", endTime: "20:00" }]),
    });
  }
  console.log(`demo history added: ${rows.length} appointments, ${byMonth.size} payouts, ${reviewed.length} reviews`);
};

const create = async () => {
  const env = existsSync(FRONTEND_ENV) ? readFileSync(FRONTEND_ENV, "utf8") : "";
  let password = env.match(/^NEXT_PUBLIC_DEV_DOCTOR_PASSWORD=(.+)$/m)?.[1]?.trim();
  if (!password) {
    password = `Demo-${randomBytes(6).toString("hex")}`;
    appendFileSync(FRONTEND_ENV, `\n# Demo doctor for the doctor dashboard (made by: npm run db:demo-doctor in backend)\nNEXT_PUBLIC_DEV_DOCTOR_LOGIN=${PHONE}\nNEXT_PUBLIC_DEV_DOCTOR_PASSWORD=${password}\n`);
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const now = new Date();
  const tier = await prisma.doctorTier.findFirst({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });
  const priceTier = await prisma.priceTier.findUnique({ where: { name: "Doctor" } });

  const user = await prisma.user.upsert({
    where: { phone: PHONE },
    update: { passwordHash, role: "DOCTOR", isActive: true },
    create: { phone: PHONE, role: "DOCTOR", firstName: "Demo Doctor", email: "demo.doctor@example.com", gender: "FEMALE", passwordHash, phoneVerifiedAt: now },
  });
  const doctor = await prisma.doctorProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id, slug: "dr-demo-doctor", displayName: "Dr. Demo Doctor", stream: "Homeopathy", qualification: "BHMS", specialization: "Skin, hair and allergies",
      experienceYears: 8, languages: ["Hindi", "English"], bio: "A demo account for trying out the doctor dashboard.",
      registrationNumber: "DEMO-0001", registrationCouncil: "Demo council", clinicName: "Demo Clinic", clinicCity: "Delhi", clinicState: "Delhi", clinicPincode: "110001",
      verificationStatus: "APPROVED", submittedAt: now, verifiedAt: now, testPassedAt: now, tierId: tier?.id ?? null,
      commissionPercent: tier?.commissionPercent ?? 20, acceptsConsultations: true, isListed: false, // not shown to patients
      videoFee: 500, audioFee: 400, slotMinutes: 15,
    },
  });
  await prisma.b2BAccount.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id, type: "DOCTOR", businessName: "Demo Clinic", contactName: doctor.displayName, contactPhone: PHONE, city: "Delhi", state: "Delhi", pincode: "110001", status: "APPROVED", approvedAt: now, priceTierId: priceTier?.id ?? null },
  });
  await addHistory(doctor.id, user.id, Number(doctor.commissionPercent));
  console.log(`demo doctor ready (mobile ${PHONE}); the password is in frontend/.env.local`);
};

(process.argv.includes("--remove") ? remove() : create())
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
