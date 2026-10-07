import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "../generated/prisma/client";
import { ReviewStatus, StreamStatus } from "../generated/prisma/client";
import { bulkResult, idsBody, logBulkDelete } from "../lib/bulk";
import { DEFAULT_MATCH, matchSettings, matchSettingsInput, saveMatchSettings } from "../lib/doctor-match";
import { onboardingOf, settleConsulting } from "../lib/doctor-onboarding";
import { HttpError, getPage, idParam, notFound, num, optionalInt, optionalString, paged } from "../lib/http";
import { prisma } from "../lib/prisma";

// What staff manage around a doctor's four onboarding steps: the consulting streams and their
// test questions, the doctor levels (Bronze, Silver, Gold), what patients said, and one doctor's
// progress. How the steps add up to "can consult" is in lib/doctor-onboarding.ts.
export const streamRoutes = Router();
export const doctorTierRoutes = Router();
export const doctorReviewRoutes = Router();
export const doctorOnboardingRoutes = Router(); // mounted at /api/admin/doctors, next to the other doctor routes

type Tx = Prisma.TransactionClient;

const blank = (v: unknown) => (v === "" ? undefined : v);
const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const optionalText = (max: number) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable().optional());

/** Reads a form; what is wrong is said in words the page can show as they are. */
const read = <T>(schema: z.ZodType<T>, body: unknown, fallback: string): T => {
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpError(400, result.error.issues[0]?.message ?? fallback, result.error.issues);
  return result.data;
};

/** What the page sent, as fields to lay over the saved record before checking the whole thing. */
const fields = (body: unknown): Record<string, unknown> => (typeof body === "object" && body !== null && !Array.isArray(body) ? { ...body } : {});

// ─────────────────────────────────────────────── consulting streams

const streamInput = z.object({
  name: z.string("Give the stream a name").trim().min(2, "Give the stream a name").max(60, "Keep the name under 60 characters"),
  description: optionalText(300),
  status: z.enum(StreamStatus, "Choose open, coming soon or closed").optional(),
  questionsPerTest: z.coerce.number("Enter how many questions a doctor is asked").int().min(1, "A test needs at least 1 question").max(100, "A test can have up to 100 questions").optional(),
  passPercent: z.coerce.number("Enter the pass mark").int().min(1, "The pass mark must be between 1 and 100").max(100, "The pass mark must be between 1 and 100").optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

const isOpen = (stream: { status: StreamStatus; isActive: boolean }) => stream.isActive && stream.status === "OPEN";

/** Switches consultations on for the stream's verified doctors who were only waiting for the stream. */
const settleStream = async (tx: Tx, streamName: string) => {
  const waiting = await tx.doctorProfile.findMany({
    where: { stream: streamName, verificationStatus: "APPROVED", isListed: true, acceptsConsultations: false },
    select: { id: true },
  });
  let switchedOn = 0;
  for (const doctor of waiting) if (await settleConsulting(tx, doctor.id)) switchedOn++;
  return switchedOn;
};

// How the guided booking chooses which doctors to show (lib/doctor-match.ts).
streamRoutes.get("/matching", async (_req, res) => res.json({ settings: await matchSettings(), defaults: DEFAULT_MATCH }));
streamRoutes.put("/matching", async (req, res) => {
  const input = read(matchSettingsInput, req.body, "Check the matching settings");
  const saved = await saveMatchSettings(input);
  await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "matching.update", entity: "Setting", entityId: "care.matching", changes: input } });
  res.json({ settings: saved, defaults: DEFAULT_MATCH });
});

// Every stream with what staff need to see at a glance. Doctors point at a stream by its name.
streamRoutes.get("/", async (_req, res) => {
  const [streams, active, doctors, passed] = await Promise.all([
    prisma.consultingStream.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { questions: true, specializations: true } } } }),
    prisma.streamQuestion.groupBy({ by: ["streamId"], where: { isActive: true }, _count: true }),
    prisma.doctorProfile.groupBy({ by: ["stream"], where: { stream: { not: null } }, _count: true }),
    prisma.doctorProfile.groupBy({ by: ["stream"], where: { stream: { not: null }, testPassedAt: { not: null } }, _count: true }),
  ]);
  const activeOf = new Map(active.map((row) => [row.streamId, row._count]));
  const doctorsOf = new Map(doctors.map((row) => [row.stream, row._count]));
  const passedOf = new Map(passed.map((row) => [row.stream, row._count]));

  res.json({
    items: streams.map(({ _count, ...stream }) => ({
      ...stream,
      questionCount: _count.questions,
      specializationCount: _count.specializations,
      activeQuestionCount: activeOf.get(stream.id) ?? 0,
      doctorCount: doctorsOf.get(stream.name) ?? 0,
      passedCount: passedOf.get(stream.name) ?? 0,
    })),
  });
});

streamRoutes.post("/", async (req, res) => {
  const input = read(streamInput, req.body, "Check the stream details");
  if (await prisma.consultingStream.findFirst({ where: { name: { equals: input.name, mode: "insensitive" } } })) {
    throw new HttpError(400, "A stream with this name already exists");
  }
  // a new stream goes last
  const last = await prisma.consultingStream.aggregate({ _max: { sortOrder: true } });
  const stream = await prisma.$transaction(async (tx) => {
    const created = await tx.consultingStream.create({ data: { ...input, sortOrder: input.sortOrder ?? (last._max.sortOrder === null ? 0 : last._max.sortOrder + 1) } });
    await tx.auditLog.create({ data: { actorId: req.user!.id, action: "stream.create", entity: "ConsultingStream", entityId: String(created.id) } });
    return created;
  });
  res.status(201).json(stream);
});

streamRoutes.patch("/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const input = read(streamInput.partial(), req.body, "Check the stream details");
  const existing = await prisma.consultingStream.findUnique({ where: { id } });
  if (!existing) throw notFound("Stream");
  if (input.name && (await prisma.consultingStream.findFirst({ where: { id: { not: id }, name: { equals: input.name, mode: "insensitive" } } }))) {
    throw new HttpError(400, "Another stream already has this name");
  }

  const result = await prisma.$transaction(
    async (tx) => {
      const stream = await tx.consultingStream.update({ where: { id }, data: input });
      // doctors point at their stream by name, so a new name is written onto them too
      const renamed = stream.name !== existing.name
        ? (await tx.doctorProfile.updateMany({ where: { stream: existing.name }, data: { stream: stream.name } })).count
        : 0;
      // the stream has just opened: its verified doctors can start
      const switchedOn = isOpen(stream) && !isOpen(existing) ? await settleStream(tx, stream.name) : 0;
      await tx.auditLog.create({
        data: { actorId: req.user!.id, action: "stream.update", entity: "ConsultingStream", entityId: String(id), changes: { ...input, doctorsRenamed: renamed, doctorsSwitchedOn: switchedOn } },
      });
      return { ...stream, doctorsRenamed: renamed, doctorsSwitchedOn: switchedOn };
    },
    { timeout: 60_000 },
  );
  res.json(result);
});

// A stream doctors are registered in is kept; the rest go, with their questions and specializations.
streamRoutes.post("/bulk-delete", async (req, res) => {
  const { ids } = idsBody.parse(req.body);
  const streams = await prisma.consultingStream.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  const used = await prisma.doctorProfile.groupBy({ by: ["stream"], where: { stream: { in: streams.map((s) => s.name) } }, _count: true });
  const inUse = new Set(used.map((u) => u.stream));
  const gone = streams.filter((s) => !inUse.has(s.name));
  const deleted = await prisma.consultingStream.deleteMany({ where: { id: { in: gone.map((s) => s.id) } } });
  await logBulkDelete(req.user!.id, "ConsultingStream", gone.map((s) => s.id), { names: gone.map((s) => s.name) });
  res.json(bulkResult(deleted.count, ids.length - deleted.count, "Streams that doctors are registered in were kept. Switch them off instead, or move the doctors first."));
});

streamRoutes.delete("/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const stream = await prisma.consultingStream.findUnique({ where: { id } });
  if (!stream) throw notFound("Stream");
  const doctors = await prisma.doctorProfile.count({ where: { stream: stream.name } });
  if (doctors > 0) {
    throw new HttpError(400, `${doctors} ${doctors === 1 ? "doctor is" : "doctors are"} registered in this stream, so it cannot be deleted. Switch it off instead, or move them to another stream first.`);
  }
  // its questions and test sittings go with it
  await prisma.$transaction([
    prisma.consultingStream.delete({ where: { id } }),
    prisma.auditLog.create({ data: { actorId: req.user!.id, action: "stream.delete", entity: "ConsultingStream", entityId: String(id), changes: { name: stream.name } } }),
  ]);
  res.json({ ok: true });
});

// ─────────────────────────────────────────────── test questions of one stream

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;

const questionInput = z
  .object({
    question: z.string("Type the question").trim().min(1, "Type the question").max(1000, "Keep the question under 1,000 characters"),
    options: z
      .array(z.string("An answer option is empty").trim().min(1, "An answer option is empty").max(300, "Keep each option under 300 characters"), "Add the answer options")
      .min(MIN_OPTIONS, `Add at least ${MIN_OPTIONS} answer options`)
      .max(MAX_OPTIONS, `A question can have up to ${MAX_OPTIONS} answer options`),
    correctIndex: z.number("Choose the right answer").int("Choose the right answer").min(0, "Choose the right answer"), // from 0
    explanation: optionalText(1000),
    isActive: z.boolean().optional(),
    sortOrder: z.coerce.number().int().min(0).optional(),
    // empty: every doctor in the stream is asked; set: only doctors with this specialization
    specializationId: z.preprocess((v) => (v === "" || v === undefined ? null : v), z.coerce.number().int().positive().nullable()),
  })
  .superRefine((q, ctx) => {
    if (q.correctIndex >= q.options.length) ctx.addIssue({ code: "custom", path: ["correctIndex"], message: "Choose the right answer from the options" });
    if (new Set(q.options.map((option) => option.toLowerCase())).size !== q.options.length) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "Two of the answer options are the same" });
    }
  });

const questionSelect = { id: true, question: true, options: true, correctIndex: true, explanation: true, isActive: true, sortOrder: true, specializationId: true, createdAt: true, updatedAt: true } as const;

/** A question's specialization must be one of its own stream's. */
const specializationOf = async (streamId: number, specializationId: number | null) => {
  if (specializationId === null) return null;
  const found = await prisma.streamSpecialization.findFirst({ where: { id: specializationId, streamId }, select: { id: true } });
  if (!found) throw new HttpError(400, "Choose a specialization that belongs to this stream");
  return found.id;
};
const questionOrder: Prisma.StreamQuestionOrderByWithRelationInput[] = [{ sortOrder: "asc" }, { id: "asc" }];

const streamOr404 = async (id: number) => {
  const stream = await prisma.consultingStream.findUnique({ where: { id } });
  if (!stream) throw notFound("Stream");
  return stream;
};

const nextQuestionOrder = async (tx: Tx, streamId: number) => {
  const last = await tx.streamQuestion.aggregate({ where: { streamId }, _max: { sortOrder: true } });
  return last._max.sortOrder === null ? 0 : last._max.sortOrder + 1;
};

/** A stream with no active questions has no test, so doctors who were waiting on the test can start. */
const settleIfNoTest = async (tx: Tx, stream: { id: number; name: string }) => {
  if ((await tx.streamQuestion.count({ where: { streamId: stream.id, isActive: true } })) === 0) await settleStream(tx, stream.name);
};

const questionFilters = z.object({
  q: optionalString,
  active: z.preprocess(blank, z.enum(["yes", "no"]).optional()),
  specialization: z.preprocess(blank, z.union([z.literal("general"), z.coerce.number().int().positive()]).optional()),
});

// The stream's test settings and its questions. The counts ignore the search, so the warnings stay true.
streamRoutes.get("/:id/questions", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const filters = questionFilters.parse(req.query);
  const stream = await streamOr404(id);

  const where: Prisma.StreamQuestionWhereInput = { streamId: id };
  if (filters.q) {
    where.OR = [
      { question: { contains: filters.q, mode: "insensitive" } },
      { explanation: { contains: filters.q, mode: "insensitive" } },
    ];
  }
  if (filters.active) where.isActive = filters.active === "yes";
  if (filters.specialization === "general") where.specializationId = null;
  else if (filters.specialization) where.specializationId = filters.specialization;

  const [items, questionCount, activeQuestionCount, doctorCount, passedCount, specializations, doctorsBySpecialization] = await Promise.all([
    prisma.streamQuestion.findMany({ where, orderBy: questionOrder, select: questionSelect }),
    prisma.streamQuestion.count({ where: { streamId: id } }),
    prisma.streamQuestion.count({ where: { streamId: id, isActive: true } }),
    prisma.doctorProfile.count({ where: { stream: stream.name } }),
    prisma.doctorProfile.count({ where: { stream: stream.name, testPassedAt: { not: null } } }),
    prisma.streamSpecialization.findMany({ where: { streamId: id }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { questions: { where: { isActive: true } } } } } }),
    prisma.doctorProfile.groupBy({ by: ["specializationId"], where: { stream: stream.name, specializationId: { not: null } }, _count: true }),
  ]);
  const doctorsOf = new Map(doctorsBySpecialization.map((row) => [row.specializationId, row._count]));
  res.json({
    stream: { ...stream, questionCount, activeQuestionCount, doctorCount, passedCount },
    specializations: specializations.map(({ _count, ...s }) => ({ ...s, activeQuestionCount: _count.questions, doctorCount: doctorsOf.get(s.id) ?? 0 })),
    items,
  });
});

streamRoutes.post("/:id/questions", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const input = read(questionInput, req.body, "Check the question");
  await streamOr404(id);
  const specializationId = await specializationOf(id, input.specializationId);
  const question = await prisma.$transaction(async (tx) =>
    tx.streamQuestion.create({ data: { ...input, specializationId, streamId: id, sortOrder: input.sortOrder ?? (await nextQuestionOrder(tx, id)) }, select: questionSelect }),
  );
  res.status(201).json(question);
});

// Several questions at once, for when staff paste a prepared set. Either all are saved or none.
streamRoutes.post("/:id/questions/bulk", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const body = z.object({ questions: z.array(z.unknown()).min(1, "Add at least one question").max(200, "Add up to 200 questions at a time"), specializationId: z.preprocess((v) => (v === "" || v === undefined ? null : v), z.coerce.number().int().positive().nullable()) });
  const { questions, specializationId: forSpecialization } = read(body, req.body, "Add at least one question");
  await streamOr404(id);
  const bulkSpecialization = await specializationOf(id, forSpecialization);

  const parsed = questions.map((raw, index) => {
    const result = questionInput.safeParse(raw);
    if (!result.success) throw new HttpError(400, `Question ${index + 1}: ${result.error.issues[0]?.message ?? "check this question"}`, result.error.issues);
    return result.data;
  });

  const created = await prisma.$transaction(async (tx) => {
    const first = await nextQuestionOrder(tx, id);
    const saved = await tx.streamQuestion.createMany({ data: parsed.map((q, index) => ({ ...q, specializationId: q.specializationId ?? bulkSpecialization, streamId: id, sortOrder: first + index })) });
    await tx.auditLog.create({ data: { actorId: req.user!.id, action: "stream.questions-add", entity: "ConsultingStream", entityId: String(id), changes: { added: saved.count } } });
    return saved.count;
  });
  res.status(201).json({ created });
});

const questionParams = z.object({ id: z.coerce.number().int().positive(), questionId: z.coerce.number().int().positive() });

// Change the wording, the options, the right answer, or just switch the question on or off.
streamRoutes.patch("/:id/questions/:questionId", async (req, res) => {
  const { id, questionId } = questionParams.parse(req.params);
  const existing = await prisma.streamQuestion.findFirst({ where: { id: questionId, streamId: id }, include: { stream: { select: { id: true, name: true } } } });
  if (!existing) throw notFound("Question");
  // only what was sent changes; the question is then checked as a whole
  const input = read(
    questionInput,
    { question: existing.question, options: existing.options, correctIndex: existing.correctIndex, explanation: existing.explanation, isActive: existing.isActive, sortOrder: existing.sortOrder, specializationId: existing.specializationId, ...fields(req.body) },
    "Check the question",
  );
  input.specializationId = await specializationOf(id, input.specializationId);
  const question = await prisma.$transaction(
    async (tx) => {
      const saved = await tx.streamQuestion.update({ where: { id: questionId }, data: input, select: questionSelect });
      if (existing.isActive && !saved.isActive) await settleIfNoTest(tx, existing.stream);
      return saved;
    },
    { timeout: 60_000 },
  );
  res.json(question);
});

streamRoutes.post("/:id/questions/bulk-delete", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { ids } = idsBody.parse(req.body);
  const stream = await streamOr404(id);
  const deleted = await prisma.$transaction(
    async (tx) => {
      const removed = await tx.streamQuestion.deleteMany({ where: { id: { in: ids }, streamId: id } });
      // with no questions left there is no test, so doctors waiting on it can start
      if (removed.count) await settleIfNoTest(tx, stream);
      return removed.count;
    },
    { timeout: 60_000 },
  );
  if (deleted) await logBulkDelete(req.user!.id, "StreamQuestion", ids, { streamId: id });
  res.json(bulkResult(deleted, ids.length - deleted));
});

streamRoutes.delete("/:id/questions/:questionId", async (req, res) => {
  const { id, questionId } = questionParams.parse(req.params);
  const existing = await prisma.streamQuestion.findFirst({ where: { id: questionId, streamId: id }, include: { stream: { select: { id: true, name: true } } } });
  if (!existing) throw notFound("Question");
  await prisma.$transaction(
    async (tx) => {
      await tx.streamQuestion.delete({ where: { id: questionId } });
      if (existing.isActive) await settleIfNoTest(tx, existing.stream);
      await tx.auditLog.create({ data: { actorId: req.user!.id, action: "stream.question-delete", entity: "StreamQuestion", entityId: String(questionId), changes: { streamId: id } } });
    },
    { timeout: 60_000 },
  );
  res.json({ ok: true });
});

// ─────────────────────────────────────────────── specializations of one stream

const specializationInput = z.object({
  name: z.string("Give the specialization a name").trim().min(2, "Give the specialization a name").max(80, "Keep the name under 80 characters"),
  description: optionalText(300),
  // what patients tap or type; they point the guided booking at this specialization
  symptoms: z.array(z.string().trim().min(2).max(60)).max(60).optional(),
  isGeneral: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});
const specializationParams = z.object({ id: z.coerce.number().int().positive(), specializationId: z.coerce.number().int().positive() });

streamRoutes.post("/:id/specializations", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const input = read(specializationInput, req.body, "Check the specialization");
  await streamOr404(id);
  if (await prisma.streamSpecialization.findFirst({ where: { streamId: id, name: { equals: input.name, mode: "insensitive" } } })) throw new HttpError(400, "This stream already has a specialization with that name");
  const last = await prisma.streamSpecialization.aggregate({ where: { streamId: id }, _max: { sortOrder: true } });
  const created = await prisma.$transaction(async (tx) => {
    if (input.isGeneral) await tx.streamSpecialization.updateMany({ where: { streamId: id }, data: { isGeneral: false } }); // one general choice per stream
    return tx.streamSpecialization.create({ data: { ...input, streamId: id, sortOrder: input.sortOrder ?? (last._max.sortOrder === null ? 0 : last._max.sortOrder + 1) } });
  });
  await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "stream.specialization-add", entity: "StreamSpecialization", entityId: String(created.id), changes: { streamId: id, name: created.name } } });
  res.status(201).json(created);
});

streamRoutes.patch("/:id/specializations/:specializationId", async (req, res) => {
  const { id, specializationId } = specializationParams.parse(req.params);
  const existing = await prisma.streamSpecialization.findFirst({ where: { id: specializationId, streamId: id } });
  if (!existing) throw notFound("Specialization");
  const input = read(specializationInput.partial(), req.body, "Check the specialization");
  if (input.name && (await prisma.streamSpecialization.findFirst({ where: { streamId: id, id: { not: specializationId }, name: { equals: input.name, mode: "insensitive" } } }))) {
    throw new HttpError(400, "This stream already has a specialization with that name");
  }
  const saved = await prisma.$transaction(async (tx) => {
    if (input.isGeneral) await tx.streamSpecialization.updateMany({ where: { streamId: id, id: { not: specializationId } }, data: { isGeneral: false } });
    const updated = await tx.streamSpecialization.update({ where: { id: specializationId }, data: input });
    // doctors carry the name for display, so a rename reaches them too
    if (input.name && input.name !== existing.name) await tx.doctorProfile.updateMany({ where: { specializationId }, data: { specialization: input.name } });
    await tx.auditLog.create({ data: { actorId: req.user!.id, action: "stream.specialization-update", entity: "StreamSpecialization", entityId: String(specializationId), changes: input } });
    return updated;
  });
  res.json(saved);
});

// A specialization doctors have chosen is kept. The questions of one that goes become general questions of the stream.
streamRoutes.post("/:id/specializations/bulk-delete", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { ids } = idsBody.parse(req.body);
  const gone = (await prisma.streamSpecialization.findMany({ where: { id: { in: ids }, streamId: id, doctors: { none: {} } }, select: { id: true } })).map((s) => s.id);
  const deleted = await prisma.streamSpecialization.deleteMany({ where: { id: { in: gone }, doctors: { none: {} } } });
  await logBulkDelete(req.user!.id, "StreamSpecialization", gone, { streamId: id });
  res.json(bulkResult(deleted.count, ids.length - deleted.count, "Specializations that doctors have chosen were kept. Switch them off instead."));
});

streamRoutes.delete("/:id/specializations/:specializationId", async (req, res) => {
  const { id, specializationId } = specializationParams.parse(req.params);
  const existing = await prisma.streamSpecialization.findFirst({ where: { id: specializationId, streamId: id }, include: { _count: { select: { doctors: true, questions: true } } } });
  if (!existing) throw notFound("Specialization");
  if (existing._count.doctors > 0) {
    throw new HttpError(400, `${existing._count.doctors} ${existing._count.doctors === 1 ? "doctor has" : "doctors have"} this specialization, so it cannot be deleted. Switch it off instead.`);
  }
  // its questions become general questions of the stream
  await prisma.$transaction([
    prisma.streamSpecialization.delete({ where: { id: specializationId } }),
    prisma.auditLog.create({ data: { actorId: req.user!.id, action: "stream.specialization-delete", entity: "StreamSpecialization", entityId: String(specializationId), changes: { name: existing.name, questionsKept: existing._count.questions } } }),
  ]);
  res.json({ ok: true });
});

// ─────────────────────────────────────────────── doctor levels (Bronze, Silver, Gold)

const tierInput = z
  .object({
    name: z.string("Give the level a name").trim().min(2, "Give the level a name").max(40, "Keep the name under 40 characters"),
    description: optionalText(300),
    minPatientsPerDay: z.coerce.number("Enter the fewest patients a day").int("Patients a day must be a whole number").min(0, "Patients a day cannot be negative").max(1000),
    maxPatientsPerDay: z.coerce.number("Enter the most patients a day").int("Patients a day must be a whole number").min(1, "The most patients a day must be 1 or more").max(1000),
    commissionPercent: z.coerce.number("Enter the platform share").min(0, "The platform share cannot be negative").max(90, "The platform share cannot be more than 90%"),
    // moving up by itself: both empty means only staff can give this level
    promoteAfterConsultations: z.preprocess((v) => (v === "" || v === undefined ? null : v), z.coerce.number("Enter a number of consultations").int("Consultations must be a whole number").min(1, "Consultations must be 1 or more").max(100000).nullable()),
    promoteMinRating: z.preprocess((v) => (v === "" || v === undefined ? null : v), z.coerce.number("Enter a rating from 1 to 5").min(1, "A rating is from 1 to 5").max(5, "A rating is from 1 to 5").nullable()),
    sortOrder: z.coerce.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine((tier, ctx) => {
    if (tier.minPatientsPerDay > tier.maxPatientsPerDay) {
      ctx.addIssue({ code: "custom", path: ["maxPatientsPerDay"], message: "The most patients a day cannot be less than the fewest" });
    }
  });

type TierRecord = Awaited<ReturnType<typeof prisma.doctorTier.findFirstOrThrow>>;
const tierOut = (tier: TierRecord, doctorCount: number) => ({
  ...tier, commissionPercent: num(tier.commissionPercent), promoteMinRating: tier.promoteMinRating === null ? null : num(tier.promoteMinRating), doctorCount,
});

doctorTierRoutes.get("/", async (_req, res) => {
  const tiers = await prisma.doctorTier.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }], include: { _count: { select: { doctors: true } } } });
  res.json({ items: tiers.map(({ _count, ...tier }) => tierOut(tier, _count.doctors)) });
});

doctorTierRoutes.post("/", async (req, res) => {
  const input = read(tierInput, req.body, "Check the level details");
  if (await prisma.doctorTier.findFirst({ where: { name: { equals: input.name, mode: "insensitive" } } })) {
    throw new HttpError(400, "A level with this name already exists");
  }
  // a new level goes last, above the ones before it
  const last = await prisma.doctorTier.aggregate({ _max: { sortOrder: true } });
  const tier = await prisma.$transaction(async (tx) => {
    const created = await tx.doctorTier.create({ data: { ...input, sortOrder: input.sortOrder ?? (last._max.sortOrder === null ? 0 : last._max.sortOrder + 1) } });
    await tx.auditLog.create({ data: { actorId: req.user!.id, action: "doctor-tier.create", entity: "DoctorTier", entityId: String(created.id) } });
    return created;
  });
  res.status(201).json(tierOut(tier, 0));
});

doctorTierRoutes.patch("/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const existing = await prisma.doctorTier.findUnique({ where: { id } });
  if (!existing) throw notFound("Level");
  // only what was sent changes; the level is then checked as a whole
  const input = read(
    tierInput,
    {
      name: existing.name, description: existing.description, minPatientsPerDay: existing.minPatientsPerDay, maxPatientsPerDay: existing.maxPatientsPerDay,
      commissionPercent: num(existing.commissionPercent), sortOrder: existing.sortOrder, isActive: existing.isActive,
      promoteAfterConsultations: existing.promoteAfterConsultations, promoteMinRating: existing.promoteMinRating === null ? null : num(existing.promoteMinRating), ...fields(req.body),
    },
    "Check the level details",
  );
  if (await prisma.doctorTier.findFirst({ where: { id: { not: id }, name: { equals: input.name, mode: "insensitive" } } })) {
    throw new HttpError(400, "Another level already has this name");
  }

  const result = await prisma.$transaction(async (tx) => {
    const tier = await tx.doctorTier.update({ where: { id }, data: input });
    // payments read the share from the doctor, so a new share is copied to everyone on this level
    const shareChanged = num(tier.commissionPercent) !== num(existing.commissionPercent);
    const doctorsUpdated = shareChanged ? (await tx.doctorProfile.updateMany({ where: { tierId: id }, data: { commissionPercent: tier.commissionPercent } })).count : 0;
    await tx.auditLog.create({ data: { actorId: req.user!.id, action: "doctor-tier.update", entity: "DoctorTier", entityId: String(id), changes: { ...input, doctorsUpdated } } });
    return { tier, doctorsUpdated };
  });
  const doctorCount = await prisma.doctorProfile.count({ where: { tierId: id } });
  res.json({ ...tierOut(result.tier, doctorCount), doctorsUpdated: result.doctorsUpdated });
});

doctorTierRoutes.post("/bulk-delete", async (req, res) => {
  const { ids } = idsBody.parse(req.body);
  const gone = (await prisma.doctorTier.findMany({ where: { id: { in: ids }, doctors: { none: {} } }, select: { id: true } })).map((t) => t.id);
  const deleted = await prisma.doctorTier.deleteMany({ where: { id: { in: gone }, doctors: { none: {} } } });
  await logBulkDelete(req.user!.id, "DoctorTier", gone);
  res.json(bulkResult(deleted.count, ids.length - deleted.count, "Levels that still have doctors on them were kept. Move those doctors to another level first."));
});

doctorTierRoutes.delete("/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const tier = await prisma.doctorTier.findUnique({ where: { id }, include: { _count: { select: { doctors: true } } } });
  if (!tier) throw notFound("Level");
  if (tier._count.doctors > 0) {
    throw new HttpError(400, `${tier._count.doctors} ${tier._count.doctors === 1 ? "doctor is" : "doctors are"} on this level. Move them to another level first.`);
  }
  await prisma.$transaction([
    prisma.doctorTier.delete({ where: { id } }),
    prisma.auditLog.create({ data: { actorId: req.user!.id, action: "doctor-tier.delete", entity: "DoctorTier", entityId: String(id), changes: { name: tier.name } } }),
  ]);
  res.json({ ok: true });
});

// ─────────────────────────────────────────────── what patients said about doctors

const reviewFilters = z.object({
  q: optionalString,
  status: z.preprocess(blank, z.enum(ReviewStatus).optional()),
  rating: z.preprocess(blank, z.coerce.number().int().min(1).max(5).optional()),
  doctorId: optionalInt,
});

const reviewWhere = (filters: z.infer<typeof reviewFilters>) => {
  const base: Prisma.DoctorReviewWhereInput = {};
  if (filters.q) {
    base.OR = [
      { comment: { contains: filters.q, mode: "insensitive" } },
      { doctor: { displayName: { contains: filters.q, mode: "insensitive" } } },
      { appointment: { patientName: { contains: filters.q, mode: "insensitive" } } },
      { appointment: { appointmentNumber: { contains: filters.q, mode: "insensitive" } } },
      { patient: { firstName: { contains: filters.q, mode: "insensitive" } } },
      { patient: { lastName: { contains: filters.q, mode: "insensitive" } } },
    ];
  }
  if (filters.rating) base.rating = filters.rating;
  if (filters.doctorId) base.doctorId = filters.doctorId;
  const where: Prisma.DoctorReviewWhereInput = { ...base, ...(filters.status ? { status: filters.status } : {}) };
  return { base, where };
};

/** A doctor's stars are worked out from the reviews patients can see. */
const recountRating = async (tx: Tx, doctorId: number) => {
  const summary = await tx.doctorReview.aggregate({ where: { doctorId, status: "APPROVED" }, _avg: { rating: true }, _count: true });
  await tx.doctorProfile.update({ where: { id: doctorId }, data: { ratingAverage: Math.round((summary._avg.rating ?? 0) * 100) / 100, ratingCount: summary._count } });
};

doctorReviewRoutes.get("/", async (req, res) => {
  const { page, pageSize, skip, take } = getPage(req);
  const { base, where } = reviewWhere(reviewFilters.parse(req.query));

  const [total, rows, statusCounts, doctors] = await Promise.all([
    prisma.doctorReview.count({ where }),
    prisma.doctorReview.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take,
      select: {
        id: true, rating: true, comment: true, status: true, createdAt: true, doctorId: true, appointmentId: true,
        doctor: { select: { displayName: true, photoUrl: true } },
        patient: { select: { firstName: true, lastName: true, phone: true } },
        appointment: { select: { appointmentNumber: true, patientName: true, scheduledAt: true } },
      },
    }),
    // the tabs follow the search and the other filters, but not the status itself
    prisma.doctorReview.groupBy({ by: ["status"], where: base, _count: true }),
    // only doctors who have been reviewed, for the filter
    prisma.doctorProfile.findMany({ where: { reviews: { some: {} } }, orderBy: { displayName: "asc" }, select: { id: true, displayName: true } }),
  ]);

  const items = rows.map(({ doctor, patient, appointment, ...review }) => ({
    ...review,
    doctorName: doctor.displayName,
    doctorPhotoUrl: doctor.photoUrl,
    // the person the consultation was for; the account that booked it may be a family member
    patientName: appointment.patientName || [patient?.firstName, patient?.lastName].filter(Boolean).join(" ") || null,
    patientPhone: patient?.phone ?? null,
    appointmentNumber: appointment.appointmentNumber,
    consultedAt: appointment.scheduledAt,
  }));

  res.json({
    ...paged(items, total, page, pageSize),
    statusCounts: Object.fromEntries(statusCounts.map((s) => [s.status, s._count])),
    doctors: doctors.map((doctor) => ({ id: doctor.id, name: doctor.displayName })),
  });
});

// Show a review to patients, or hide it.
doctorReviewRoutes.patch("/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { status } = read(z.object({ status: z.enum(ReviewStatus, "Choose approve or reject") }), req.body, "Choose approve or reject");
  const review = await prisma.doctorReview.findUnique({ where: { id }, select: { doctorId: true, status: true } });
  if (!review) throw notFound("Review");
  await prisma.$transaction(async (tx) => {
    await tx.doctorReview.update({ where: { id }, data: { status } });
    await recountRating(tx, review.doctorId);
    await tx.auditLog.create({ data: { actorId: req.user!.id, action: "doctor-review.status", entity: "DoctorReview", entityId: String(id), changes: { from: review.status, to: status } } });
  });
  res.json({ ok: true, status });
});

doctorReviewRoutes.post("/bulk-delete", async (req, res) => {
  const { ids } = idsBody.parse(req.body);
  const reviews = await prisma.doctorReview.findMany({ where: { id: { in: ids } }, select: { id: true, doctorId: true } });
  const deleted = await prisma.$transaction(async (tx) => {
    const removed = await tx.doctorReview.deleteMany({ where: { id: { in: reviews.map((r) => r.id) } } });
    // each doctor's stars are worked out again from what is left
    for (const doctorId of new Set(reviews.map((r) => r.doctorId))) await recountRating(tx, doctorId);
    return removed.count;
  });
  await logBulkDelete(req.user!.id, "DoctorReview", reviews.map((r) => r.id));
  res.json(bulkResult(deleted, ids.length - deleted));
});

doctorReviewRoutes.delete("/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const review = await prisma.doctorReview.findUnique({ where: { id }, select: { doctorId: true, rating: true } });
  if (!review) throw notFound("Review");
  await prisma.$transaction(async (tx) => {
    await tx.doctorReview.delete({ where: { id } });
    await recountRating(tx, review.doctorId);
    await tx.auditLog.create({ data: { actorId: req.user!.id, action: "doctor-review.delete", entity: "DoctorReview", entityId: String(id), changes: { doctorId: review.doctorId, rating: review.rating } } });
  });
  res.json({ ok: true });
});

// ─────────────────────────────────────────────── one doctor's onboarding

const dayOf = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);

/** Where the doctor is across the four steps, their level, and every test they have sat. */
const onboardingOut = async (doctorId: number) => {
  const [state, doctor, attempts] = await Promise.all([
    onboardingOf(prisma, doctorId),
    prisma.doctorProfile.findUnique({
      where: { id: doctorId },
      select: {
        stream: true, photoUrl: true, createdAt: true, submittedAt: true, verifiedAt: true, testPassedAt: true, tierId: true, commissionPercent: true,
        ratingAverage: true, ratingCount: true,
        tier: { select: { id: true, name: true, description: true, minPatientsPerDay: true, maxPatientsPerDay: true, commissionPercent: true } },
        // the doctor gives these when registering; they are kept on the account
        user: { select: { gender: true, dateOfBirth: true } },
      },
    }),
    prisma.doctorTestAttempt.findMany({
      where: { doctorId },
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      take: 50,
      select: { id: true, score: true, total: true, passed: true, startedAt: true, submittedAt: true, stream: { select: { name: true } } },
    }),
  ]);
  if (!state || !doctor) throw notFound("Doctor");

  return {
    ...state,
    streamName: doctor.stream, // what the doctor chose; `stream` is null when staff have not listed it
    photoUrl: doctor.photoUrl,
    gender: doctor.user.gender,
    dateOfBirth: dayOf(doctor.user.dateOfBirth),
    registeredAt: doctor.createdAt,
    submittedAt: doctor.submittedAt,
    verifiedAt: doctor.verifiedAt,
    testPassedAt: doctor.testPassedAt,
    tierId: doctor.tierId,
    tier: doctor.tier ? { ...doctor.tier, commissionPercent: num(doctor.tier.commissionPercent) } : null,
    commissionPercent: num(doctor.commissionPercent),
    ratingAverage: num(doctor.ratingAverage),
    ratingCount: doctor.ratingCount,
    attempts: attempts.map(({ stream, ...attempt }) => ({ ...attempt, streamName: stream.name })),
  };
};

doctorOnboardingRoutes.get("/:id/onboarding", async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json(await onboardingOut(id));
});

const onboardingInput = z
  .object({
    tierId: z.preprocess((v) => (v === "" ? null : v), z.coerce.number().int().positive().nullable().optional()),
    testPassed: z.boolean().optional(), // true waives the test, false makes the doctor sit it again
  })
  .refine((body) => body.tierId !== undefined || body.testPassed !== undefined, "Nothing to change");

// Move the doctor to a level, and/or mark the test as passed or reset it.
doctorOnboardingRoutes.patch("/:id/onboarding", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { tierId, testPassed } = read(onboardingInput, req.body, "Nothing to change");
  const doctor = await prisma.doctorProfile.findUnique({ where: { id }, select: { tierId: true, testPassedAt: true } });
  if (!doctor) throw notFound("Doctor");
  const tier = tierId ? await prisma.doctorTier.findUnique({ where: { id: tierId } }) : null;
  if (tierId && !tier) throw new HttpError(400, "This level no longer exists. Reload the page and choose again.");
  if (tier && !tier.isActive && tier.id !== doctor.tierId) throw new HttpError(400, `The ${tier.name} level is switched off. Choose another level, or switch it on first.`);

  const consultingSwitchedOn = await prisma.$transaction(async (tx) => {
    const data: Prisma.DoctorProfileUncheckedUpdateInput = {};
    // payments read the share from the doctor, so the level's share is copied across
    if (tier) Object.assign(data, { tierId: tier.id, commissionPercent: tier.commissionPercent });
    else if (tierId === null) data.tierId = null;
    if (testPassed === true && !doctor.testPassedAt) data.testPassedAt = new Date();
    if (testPassed === false) data.testPassedAt = null;
    await tx.doctorProfile.update({ where: { id }, data });

    const switchedOn = testPassed === undefined ? false : await settleConsulting(tx, id);
    await tx.auditLog.create({
      data: {
        actorId: req.user!.id, action: "doctor.onboarding", entity: "DoctorProfile", entityId: String(id),
        changes: {
          ...(tierId !== undefined ? { tier: { from: doctor.tierId, to: tier?.id ?? null } } : {}),
          ...(testPassed !== undefined ? { testPassed: { from: doctor.testPassedAt !== null, to: testPassed } } : {}),
          consultingSwitchedOn: switchedOn,
        },
      },
    });
    return switchedOn;
  });

  res.json({ ...(await onboardingOut(id)), consultingSwitchedOn });
});
