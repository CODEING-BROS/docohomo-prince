import { prisma } from "../lib/prisma";

// Starter specializations for the Homeopathy stream, each with the symptoms that point patients at it.
// Safe to run again: a specialization that already exists is left exactly as staff have it.
//   npm run db:specializations
// It also (1) gives each doctor who has none the specialization their own description points at, and
// (2) switches off the other starter streams, which have no doctors, so only Homeopathy is offered.
// Staff can switch a stream back on, or add new ones, under Admin → Consulting streams.

const STARTERS: { name: string; description: string; isGeneral?: boolean; match: RegExp | null; symptoms: string[] }[] = [
  { name: "General physician", description: "Fever, cold, weakness and everyday complaints", isGeneral: true, match: null,
    symptoms: ["Fever", "Cold", "Cough", "Headache", "Body pain", "Weakness", "Tiredness", "Viral infection", "Weight management"] },
  { name: "Skin and hair", description: "Acne, eczema, psoriasis, hair fall and dandruff", match: /skin|hair|cosmet|derma/i,
    symptoms: ["Hair fall", "Dandruff", "Acne", "Pimples", "Dark patches on skin", "Eczema", "Psoriasis", "Itching", "Warts", "Fungal infection", "Vitiligo"] },
  { name: "Women's health", description: "Periods, PCOS, pregnancy care and menopause", match: /gyn|gyen|obstet|women/i,
    symptoms: ["Missed period", "Irregular periods", "Heavy menstrual bleeding", "Period pain", "PCOS", "White discharge", "Menopause", "Fertility"] },
  { name: "Child health", description: "Growth, immunity, tonsils and bedwetting in children", match: /paed|pedia|child/i,
    symptoms: ["Child not eating", "Frequent cold in child", "Tonsils", "Bedwetting", "Teething trouble", "Low immunity in child", "Growth concerns"] },
  { name: "Digestion and stomach", description: "Acidity, gas, constipation, piles and IBS", match: /digest|gastro|stomach|liver/i,
    symptoms: ["Stomach pain", "Acidity", "Gas", "Constipation", "Loose motions", "Piles", "IBS", "Indigestion", "Loss of appetite"] },
  { name: "Allergy and breathing", description: "Asthma, sinus, allergic cold and breathlessness", match: /allerg|asthma|respir|sinus|ent\b/i,
    symptoms: ["Sneezing", "Allergic cold", "Sinus", "Asthma", "Breathlessness", "Wheezing", "Dust allergy", "Chronic cough"] },
  { name: "Bones and joints", description: "Arthritis, back pain, knee pain and spondylosis", match: /ortho|joint|arthr|bone|spine/i,
    symptoms: ["Joint pain", "Knee pain", "Back pain", "Neck pain", "Arthritis", "Sciatica", "Stiffness", "Gout"] },
  { name: "Mind and sleep", description: "Anxiety, low mood, stress and poor sleep", match: /mind|psych|mental|emotion|bach|sleep/i,
    symptoms: ["Anxiety", "Low mood", "Stress", "Insomnia", "Panic", "Lack of focus", "Anger", "Migraine"] },
  { name: "Kidney and urinary", description: "Kidney stones, urine infection and prostate trouble", match: /kidney|renal|urin|stone|prostat/i,
    symptoms: ["Kidney stone", "Burning urination", "Frequent urination", "Urine infection", "Prostate trouble"] },
  { name: "Heart, sugar and thyroid", description: "Blood pressure, diabetes, thyroid and cholesterol", match: /cardio|heart|diabet|thyroid|sugar|pressure|dnhe|nutrition/i,
    symptoms: ["High blood pressure", "Diabetes", "Thyroid", "Cholesterol", "Obesity", "Palpitations"] },
];

const stream = await prisma.consultingStream.findUnique({ where: { name: "Homeopathy" } });
if (!stream) {
  console.log("There is no Homeopathy stream. Add it under Admin → Consulting streams first.");
} else {
  let added = 0;
  for (const [index, s] of STARTERS.entries()) {
    const existing = await prisma.streamSpecialization.findFirst({ where: { streamId: stream.id, name: s.name } });
    if (existing) continue;
    await prisma.streamSpecialization.create({ data: { streamId: stream.id, name: s.name, description: s.description, symptoms: s.symptoms, isGeneral: s.isGeneral ?? false, sortOrder: index } });
    added++;
  }
  const saved = await prisma.streamSpecialization.findMany({ where: { streamId: stream.id } });
  const idOf = new Map(saved.map((s) => [s.name, s.id]));
  const general = saved.find((s) => s.isGeneral);

  // doctors without one: the first specialization their own words mention, otherwise general physician
  const doctors = await prisma.doctorProfile.findMany({ where: { stream: "Homeopathy", specializationId: null }, select: { id: true, specialization: true, bio: true } });
  let placed = 0;
  for (const doctor of doctors) {
    const text = `${doctor.specialization ?? ""} ${doctor.bio ?? ""}`;
    const found = STARTERS.find((s) => s.match?.test(text));
    const specializationId = (found ? idOf.get(found.name) : undefined) ?? general?.id;
    if (!specializationId) continue;
    // their own description is kept: it is what patients read
    await prisma.doctorProfile.update({ where: { id: doctor.id }, data: { specializationId } });
    placed++;
  }

  const others = await prisma.consultingStream.findMany({ where: { name: { not: "Homeopathy" }, isActive: true }, select: { id: true, name: true } });
  const off: string[] = [];
  for (const other of others) {
    if ((await prisma.doctorProfile.count({ where: { stream: other.name } })) > 0) continue; // a stream with doctors is left alone
    await prisma.consultingStream.update({ where: { id: other.id }, data: { isActive: false } });
    off.push(other.name);
  }
  console.log(`Specializations added: ${added} (now ${saved.length}). Doctors given one: ${placed}. Streams switched off: ${off.length ? off.join(", ") : "none"}.`);
}
await prisma.$disconnect();
