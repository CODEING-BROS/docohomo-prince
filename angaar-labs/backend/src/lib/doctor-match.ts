import { z } from "zod";
import { prisma } from "./prisma";
import { slotsForDay } from "./slots";

// Guided booking: from what a patient tells us to the two or three doctors worth showing.
//
//   Final score = medical fit + doctor quality + availability + price fit + reliability
//               + patient–doctor history + marketplace balance + patient preferences
//
// Rules that hold whatever the weights are:
//   - Medical fit comes first. A doctor of another specialization is only shown when nobody of the
//     right one has a free slot.
//   - Price is judged against the usual fee for that specialization, never as a bare number, and
//     against what THIS patient is comfortable with: what they said, else what they have paid before.
//     A first-time patient who said nothing is not shown anyone above the usual fee.
//   - A higher fee never ranks a doctor up by itself, and the platform's share plays no part.
//   - A doctor the patient rated 1 or 2 stars is not suggested to them again while anyone else is free.
//   - A new doctor gets a small, fixed lift so they can earn reviews; it cannot carry them past a
//     better-fitting doctor.
// Every number can be changed in Admin → Consulting streams → Matching.

const weight = z.coerce.number().min(0).max(100);
export const matchSettingsInput = z.object({
  maxResults: z.coerce.number().int().min(1).max(5),
  daysAhead: z.coerce.number().int().min(1).max(14),
  /** how far above the usual fee a first-time patient may be shown, in percent */
  newPatientAboveTypical: z.coerce.number().min(0).max(100),
  /** the same for a returning patient who has not asked for a premium doctor */
  returningPatientAboveTypical: z.coerce.number().min(0).max(200),
  /** reviews every doctor is assumed to have at the average rating, so one 5-star review does not win */
  ratingPriorReviews: z.coerce.number().int().min(0).max(100),
  weights: z.object({ fit: weight, quality: weight, availability: weight, price: weight, reliability: weight, history: weight, balance: weight, preference: weight }),
});
export type MatchSettings = z.infer<typeof matchSettingsInput>;

export const DEFAULT_MATCH: MatchSettings = {
  maxResults: 3,
  daysAhead: 7,
  newPatientAboveTypical: 0,
  returningPatientAboveTypical: 25,
  ratingPriorReviews: 8,
  weights: { fit: 30, quality: 15, availability: 12, price: 15, reliability: 8, history: 10, balance: 5, preference: 5 },
};
const KEY = "care.matching";

export const matchSettings = async (): Promise<MatchSettings> => {
  const saved = (await prisma.setting.findUnique({ where: { key: KEY } }))?.value as Partial<MatchSettings> | undefined;
  const parsed = matchSettingsInput.safeParse({ ...DEFAULT_MATCH, ...saved, weights: { ...DEFAULT_MATCH.weights, ...saved?.weights } });
  return parsed.success ? parsed.data : DEFAULT_MATCH;
};
export const saveMatchSettings = async (value: MatchSettings) => {
  await prisma.setting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
  return value;
};

// ───────────────────────────────────────────── which specialization do these symptoms point at?

/** Ranks a stream's specializations by how many of the patient's symptoms and words they cover. */
export const suggestSpecializations = async (symptoms: string[], text = "") => {
  const all = await prisma.streamSpecialization.findMany({
    where: { isActive: true, stream: { isActive: true, status: "OPEN" } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, description: true, symptoms: true, isGeneral: true },
  });
  const chosen = symptoms.map((s) => s.toLowerCase().trim()).filter(Boolean);
  const said = text.toLowerCase();
  const ranked = all.map((s) => {
    const own = s.symptoms.map((x) => x.toLowerCase().trim());
    const picked = chosen.filter((c) => own.includes(c)).length;
    const mentioned = own.filter((o) => o.length > 2 && said.includes(o)).length + (said.includes(s.name.toLowerCase()) ? 1 : 0);
    return { id: s.id, name: s.name, description: s.description, isGeneral: s.isGeneral, hits: picked * 2 + mentioned };
  }).sort((a, b) => b.hits - a.hits);
  const best = ranked[0]?.hits ? ranked[0] : ranked.find((s) => s.isGeneral) ?? null;
  return { best, all: ranked };
};

// ───────────────────────────────────────────── the match

export const matchInput = z.object({
  specializationId: z.coerce.number().int().positive().optional(),
  symptoms: z.array(z.string().trim().max(80)).max(20).default([]),
  problem: z.string().trim().max(2000).default(""),
  severity: z.enum(["MILD", "MODERATE", "SEVERE"]).default("MODERATE"),
  mode: z.enum(["VIDEO", "AUDIO", "ANY"]).default("ANY"),
  when: z.enum(["TODAY", "ANY"]).default("ANY"),
  price: z.enum(["BUDGET", "BALANCED", "PREMIUM", "ANY"]).default("ANY"),
  languages: z.array(z.string().trim().max(40)).max(6).default([]),
  city: z.string().trim().max(80).default(""),
});
export type MatchInput = z.infer<typeof matchInput>;

export type MatchReason = "BEST_MATCH" | "BEST_VALUE" | "EXPERIENCED";

const BOOKABLE = { verificationStatus: "APPROVED", acceptsConsultations: true, isListed: true } as const;
const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const clamp = (v: number) => Math.min(1, Math.max(0, v));
const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const indiaDay = (offset: number) => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};
const DAY = 864e5;
// holds that were never paid for are not real bookings. Written out because NOT on a column that can be empty also drops the empty rows.
const REAL = { OR: [{ cancelledBy: null }, { cancelledBy: { not: "SYSTEM" } }] };

export const matchDoctors = async (input: MatchInput, userId?: number) => {
  const settings = await matchSettings();
  const specialization = input.specializationId
    ? await prisma.streamSpecialization.findFirst({ where: { id: input.specializationId, isActive: true }, select: { id: true, name: true, isGeneral: true, stream: { select: { name: true } } } })
    : null;

  const since = new Date(Date.now() - 180 * DAY);
  const [doctors, mine] = await Promise.all([
    prisma.doctorProfile.findMany({
      where: { ...BOOKABLE, availability: { some: { isActive: true } }, ...(specialization ? { stream: specialization.stream.name } : {}) },
      select: {
        id: true, slug: true, displayName: true, photoUrl: true, qualification: true, specialization: true, specializationId: true, experienceYears: true, languages: true, bio: true,
        clinicCity: true, clinicState: true, videoFee: true, audioFee: true, slotMinutes: true, ratingAverage: true, ratingCount: true, verifiedAt: true,
        tier: { select: { name: true, maxPatientsPerDay: true } }, specializationRef: { select: { isGeneral: true } },
      },
    }),
    userId
      ? prisma.appointment.findMany({
          where: { patientId: userId, ...REAL }, orderBy: { scheduledAt: "desc" }, take: 60,
          select: { doctorId: true, status: true, cancelledBy: true, fee: true, scheduledAt: true, review: { select: { rating: true } } },
        })
      : Promise.resolve([]),
  ]);

  // ── the patient: what they have paid, who they have seen, how often they do not turn up
  const completed = mine.filter((a) => a.status === "COMPLETED");
  const newPatient = completed.length === 0;
  const paidBefore = completed.map((a) => Number(a.fee)).filter((fee) => fee > 0);
  const recent = mine.filter((a) => a.scheduledAt >= since);
  const dropped = recent.filter((a) => a.status === "NO_SHOW" || (a.status === "CANCELLED" && a.cancelledBy === "PATIENT")).length;
  const unreliablePatient = recent.length >= 3 && dropped / recent.length > 0.4;
  const seen = new Map<number, { visits: number; lastRating: number | null }>();
  for (const a of completed) {
    const entry = seen.get(a.doctorId) ?? { visits: 0, lastRating: null };
    entry.visits += 1;
    if (entry.lastRating === null && a.review) entry.lastRating = a.review.rating;
    seen.set(a.doctorId, entry);
  }

  // ── what the patient would pay each doctor for the kind of call they want
  const feeOf = (d: (typeof doctors)[number]) => {
    const video = n(d.videoFee), audio = n(d.audioFee);
    if (input.mode === "VIDEO") return video;
    if (input.mode === "AUDIO") return audio;
    const both = [video, audio].filter((f): f is number => f !== null);
    return both.length ? Math.min(...both) : null;
  };
  const priced = doctors.map((d) => ({ d, fee: feeOf(d) })).filter((row): row is { d: (typeof doctors)[number]; fee: number } => row.fee !== null);
  const empty = { specialization: specialization ? { id: specialization.id, name: specialization.name } : null, typicalFee: null as number | null, comfortFee: null as number | null, newPatient, priceGuardRelaxed: false, fitRelaxed: false, considered: 0, items: [] as never[] };
  if (!priced.length) return empty;

  // the usual fee: among doctors of this specialization when there are enough of them, otherwise the stream
  const sameSpecialization = specialization ? priced.filter((row) => row.d.specializationId === specialization.id) : [];
  const typicalFee = median((sameSpecialization.length >= 3 ? sameSpecialization : priced).map((row) => row.fee)) || 1;

  // what this patient is comfortable paying: what they said, else what they have paid, else the usual fee
  const history = paidBefore.length >= 2 ? median(paidBefore) : null;
  const comfortFee =
    input.price === "BUDGET" ? typicalFee * 0.8
    : input.price === "BALANCED" ? typicalFee
    : input.price === "PREMIUM" ? Math.max(typicalFee * 1.5, history ?? 0)
    : history ?? typicalFee;
  // the most they are shown without asking for it
  const cap =
    input.price === "PREMIUM" ? Infinity
    : input.price === "BUDGET" ? typicalFee
    // someone who has always paid less than the usual fee gets no allowance above it; someone who has paid more is shown up to that
    : history !== null && history < typicalFee ? typicalFee
    : Math.max(typicalFee * (1 + (newPatient ? settings.newPatientAboveTypical : settings.returningPatientAboveTypical) / 100), history ?? 0);

  // ── how each doctor has behaved over the last six months
  const ids = priced.map((row) => row.d.id);
  const dayStart = new Date(`${indiaDay(0)}T00:00:00+05:30`);
  const [byOutcome, visits, today] = await Promise.all([
    prisma.appointment.groupBy({ by: ["doctorId", "status", "cancelledBy"], where: { doctorId: { in: ids }, scheduledAt: { gte: since }, ...REAL }, _count: true }),
    prisma.appointment.groupBy({ by: ["doctorId", "patientId"], where: { doctorId: { in: ids }, status: "COMPLETED" }, _count: true }),
    prisma.appointment.groupBy({ by: ["doctorId"], where: { doctorId: { in: ids }, scheduledAt: { gte: dayStart, lt: new Date(dayStart.getTime() + DAY) }, status: { notIn: ["CANCELLED", "NO_SHOW"] } }, _count: true }),
  ]);
  const stats = new Map<number, { total: number; byDoctor: number; patients: number; returning: number; doneAll: number }>();
  const stat = (id: number) => stats.get(id) ?? stats.set(id, { total: 0, byDoctor: 0, patients: 0, returning: 0, doneAll: 0 }).get(id)!;
  for (const row of byOutcome) {
    const s = stat(row.doctorId);
    s.total += row._count;
    if (row.status === "CANCELLED" && row.cancelledBy === "DOCTOR") s.byDoctor += row._count;
  }
  for (const row of visits) {
    const s = stat(row.doctorId);
    s.patients += 1;
    s.doneAll += row._count;
    if (row._count > 1) s.returning += 1;
  }
  const bookedToday = new Map(today.map((row) => [row.doctorId, row._count]));

  const rated = priced.filter((row) => row.d.ratingCount > 0);
  const averageRating = rated.length ? rated.reduce((sum, row) => sum + Number(row.d.ratingAverage), 0) / rated.length : 4;
  const words = [...input.symptoms, ...input.problem.split(/[^a-zA-Z]+/).filter((w) => w.length > 4)].map((w) => w.toLowerCase());
  const languages = input.languages.map((l) => l.toLowerCase()).filter(Boolean);
  const city = input.city.toLowerCase();
  const urgent = input.severity === "SEVERE" || input.when === "TODAY";

  // urgency makes "how soon" matter more; a patient who often drops out is steered away from scarce slots
  const w = { ...settings.weights };
  if (urgent) w.availability *= 2;
  if (unreliablePatient) w.balance *= 2;
  const totalWeight = Object.values(w).reduce((sum, v) => sum + v, 0) || 1;

  type Candidate = {
    d: (typeof doctors)[number]; fee: number; nextSlot: { startsAt: string; time: string; day: string };
    exactFit: boolean; fit: number; quality: number; trusted: number; years: number; hoursAway: number; isToday: boolean; speaks: boolean; spoken: string | null; isNew: boolean;
    score: number; seenBefore: boolean; disliked: boolean; done: number; withinCap: boolean; parts: Record<string, number>;
  };
  const candidates: Candidate[] = [];
  for (const { d, fee } of priced) {
    // the next free slot; a doctor with nothing in the window is not a match at all
    let nextSlot: { startsAt: string; time: string; day: string } | null = null;
    for (let i = 0; i < settings.daysAhead && !nextSlot; i++) {
      const day = indiaDay(i);
      const free = (await slotsForDay(d.id, day)).find((s) => s.available);
      if (free) nextSlot = { startsAt: free.startsAt, time: free.time, day };
    }
    if (!nextSlot) continue;
    const s = stat(d.id);
    const text = `${d.specialization ?? ""} ${d.bio ?? ""}`.toLowerCase();

    // medical fit: the right specialization, then the patient's own words in what the doctor treats
    const exactFit = Boolean(specialization && d.specializationId === specialization.id);
    const base = !specialization ? 0.6 : exactFit ? 1 : text.includes(specialization.name.toLowerCase()) ? 0.6 : d.specializationRef?.isGeneral ? 0.45 : 0.2;
    const hits = words.length ? words.filter((word) => text.includes(word)).length / words.length : 0;
    const fit = clamp(base * 0.85 + hits * 0.15);

    // quality: a rating pulled towards a little under the average until there are reviews enough to trust it (so an
    // unrated doctor never outranks a proven one on rating alone), experience, patients who come back
    const trusted = (Number(d.ratingAverage) * d.ratingCount + (averageRating - 0.3) * settings.ratingPriorReviews) / (d.ratingCount + settings.ratingPriorReviews || 1);
    const years = n(d.experienceYears) ?? 0;
    const comeBack = s.patients >= 5 ? s.returning / s.patients : 0.2;
    const quality = clamp(((trusted - 3) / 2) * 0.55 + (Math.min(years, 20) / 20) * 0.25 + Math.min(comeBack, 0.6) / 0.6 * 0.2);

    const hoursAway = Math.max(0, (new Date(nextSlot.startsAt).getTime() - Date.now()) / 36e5);
    const isToday = nextSlot.day === indiaDay(0);
    const availability = input.when === "TODAY" ? (isToday ? 1 : 0.15) : 1 / (1 + hoursAway / 12);

    // price fit: closest to what this patient is comfortable with. Dearer than that costs more than cheaper does,
    // and someone who asked for a premium doctor is not handed the cheapest one
    const gap = (fee - comfortFee) / comfortFee;
    const price = clamp(gap > 0 ? 1 - gap * 1.5 : 1 + gap * (input.price === "PREMIUM" ? 0.8 : 0.3));

    // reliability: doctors who cancel on patients or do not start the call lose here
    const reliability = s.total >= 5 ? clamp(1 - (s.byDoctor / s.total) * 3) : 0.85;

    const before = seen.get(d.id);
    const historyScore = before ? (before.lastRating !== null && before.lastRating <= 2 ? 0 : clamp(0.7 + Math.min(before.visits, 3) * 0.1)) : 0;

    // marketplace balance: room left today, and a fixed small lift for a newly verified doctor
    const room = 1 - Math.min(1, (bookedToday.get(d.id) ?? 0) / (d.tier?.maxPatientsPerDay ?? 20));
    const isNew = d.ratingCount < 5 && d.verifiedAt !== null && Date.now() - d.verifiedAt.getTime() < 45 * DAY;
    const balance = clamp(room * 0.8 + (isNew ? 0.2 : 0));

    const spoken = languages.length ? d.languages.find((l) => languages.includes(l.toLowerCase())) ?? null : null;
    const speaks = spoken !== null;
    const nearby = city ? (d.clinicCity ?? "").toLowerCase() === city : false;
    const preference = languages.length || city ? ((languages.length ? (speaks ? 0.8 : 0) : 0.4) + (city ? (nearby ? 0.2 : 0) : 0.1)) : 0.5;

    const score = (fit * w.fit + quality * w.quality + availability * w.availability + price * w.price + reliability * w.reliability + historyScore * w.history + balance * w.balance + preference * w.preference) / totalWeight;
    candidates.push({
      d, fee, nextSlot, exactFit, fit, quality, trusted, years, hoursAway, isToday, speaks, spoken, isNew, score,
      seenBefore: Boolean(before) && historyScore > 0, done: s.doneAll,
      disliked: Boolean(before) && before!.lastRating !== null && before!.lastRating <= 2,
      withinCap: fee <= cap + 0.5,
      parts: { fit, quality, availability, price, reliability, history: historyScore, balance, preference },
    });
  }
  if (!candidates.length) return { ...empty, typicalFee: Math.round(typicalFee), comfortFee: Math.round(comfortFee) };

  // ── gates, in order of importance: the right specialization, then the price guard
  // a doctor the patient rated 1 or 2 stars is left out, unless that would leave nobody
  const welcome = candidates.filter((c) => !c.disliked);
  const usable = welcome.length ? welcome : candidates;
  const rightOnes = specialization ? usable.filter((c) => c.fit >= 0.5) : usable;
  const fitRelaxed = Boolean(specialization) && rightOnes.length === 0;
  const fitting = fitRelaxed ? usable : rightOnes;
  const affordable = fitting.filter((c) => c.withinCap || c.seenBefore);
  const priceGuardRelaxed = affordable.length === 0;
  const pool = (priceGuardRelaxed ? fitting : affordable).sort((a, b) => b.score - a.score);

  // ── three different choices, not the three highest scores
  const picked: { c: Candidate; reason: MatchReason }[] = [];
  const free = (c: Candidate) => !picked.some((p) => p.c.d.id === c.d.id);
  const take = (c: Candidate | undefined, reason: MatchReason) => { if (c && picked.length < settings.maxResults && free(c)) picked.push({ c, reason }); };

  take(pool[0], "BEST_MATCH");
  // best value: the most fit and quality for each rupee, among doctors who are a real fit
  const valueOf = (c: Candidate) => (c.fit * 0.6 + c.quality * 0.4) / (c.fee / typicalFee);
  take([...pool].filter(free).sort((a, b) => valueOf(b) - valueOf(a))[0], "BEST_VALUE");
  // experienced: the longest practice and the most trusted rating, still inside what this patient is shown
  take([...pool].filter(free).sort((a, b) => b.years - a.years || b.trusted - a.trusted)[0], "EXPERIENCED");
  for (const c of pool) take(c, "BEST_MATCH");

  const clock = (time: string) => { const [h, m] = time.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
  return {
    specialization: specialization ? { id: specialization.id, name: specialization.name } : null,
    typicalFee: Math.round(typicalFee),
    comfortFee: Math.round(comfortFee),
    newPatient,
    priceGuardRelaxed,
    fitRelaxed,
    considered: candidates.length,
    items: picked.map(({ c, reason }, position) => {
      const { d } = c;
      // the two or three plain reasons a patient can check for themselves
      const why = [
        c.seenBefore ? "You have consulted this doctor before" : null,
        c.exactFit && specialization ? `${specialization.name} specialist` : null,
        c.isToday ? `Free today at ${clock(c.nextSlot.time)}` : null,
        c.spoken ? `Speaks ${c.spoken}` : null,
        c.fee <= typicalFee * 0.9 ? `₹${Math.round(typicalFee - c.fee)} under the usual fee` : null,
        c.years >= 10 ? `${Math.round(c.years)} years of experience` : null,
        d.ratingCount >= 10 && c.trusted >= 4.5 ? `Rated ${Number(d.ratingAverage).toFixed(1)} by ${d.ratingCount} patients` : null,
      ].filter((line): line is string => line !== null).slice(0, 3);
      return {
        id: d.id, slug: d.slug, displayName: d.displayName, photoUrl: d.photoUrl, qualification: d.qualification, specialization: d.specialization,
        experienceYears: n(d.experienceYears), languages: d.languages, clinicCity: d.clinicCity, slotMinutes: d.slotMinutes,
        videoFee: n(d.videoFee), audioFee: n(d.audioFee), fee: c.fee,
        ratingAverage: Number(d.ratingAverage), ratingCount: d.ratingCount, tier: d.tier?.name ?? null, consultationsDone: c.done,
        nextSlot: c.nextSlot, reason, position, why,
        score: Math.round(c.score * 100),
        parts: Object.fromEntries(Object.entries(c.parts).map(([key, value]) => [key, Math.round(value * 100)])),
      };
    }),
  };
};

/** Saves one run of the guided search and that each doctor in it was shown. */
export const recordMatch = async (userId: number | undefined, input: MatchInput, result: Awaited<ReturnType<typeof matchDoctors>>) => {
  const session = await prisma.matchSession.create({
    data: {
      userId: userId ?? null, specializationId: result.specialization?.id ?? null, input,
      result: { typicalFee: result.typicalFee, comfortFee: result.comfortFee, newPatient: result.newPatient, considered: result.considered, items: result.items.map((i) => ({ doctorId: i.id, reason: i.reason, fee: i.fee, score: i.score, parts: i.parts })) },
      events: { create: result.items.map((i) => ({ doctorId: i.id, type: "IMPRESSION", position: i.position, reason: i.reason })) },
    },
    select: { id: true },
  });
  return session.id;
};
