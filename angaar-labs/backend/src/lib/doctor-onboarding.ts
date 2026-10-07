import type { Prisma } from "../generated/prisma/client";
import { prisma } from "./prisma";

// A doctor reaches patients in four steps:
//   1. registration      they fill in the form and upload their proofs
//   2. verification      staff check the documents
//   3. test questions    a short test for their consulting stream and specialization (skipped while there are no questions for them)
//   4. consultation panel
// Consultations are switched on only when every step is done and the stream is open.

type Db = Prisma.TransactionClient | typeof prisma;

/** The questions a doctor can be asked: the stream's general ones, plus those of their specialization. */
export const testQuestionsWhere = (streamId: number, specializationId: number | null): Prisma.StreamQuestionWhereInput => ({
  streamId,
  isActive: true,
  OR: [{ specializationId: null }, ...(specializationId ? [{ specializationId }] : [])],
});

export const onboardingOf = async (db: Db, doctorId: number) => {
  const doctor = await db.doctorProfile.findUnique({
    where: { id: doctorId },
    select: { stream: true, specializationId: true, verificationStatus: true, testPassedAt: true, isListed: true, acceptsConsultations: true, videoFee: true, audioFee: true, specializationRef: { select: { id: true, name: true, isActive: true } } },
  });
  if (!doctor) return null;

  const stream = doctor.stream ? await db.consultingStream.findUnique({ where: { name: doctor.stream } }) : null;
  const questions = stream ? await db.streamQuestion.count({ where: testQuestionsWhere(stream.id, doctor.specializationId) }) : 0;
  const verified = doctor.verificationStatus === "APPROVED";
  const testRequired = questions > 0;
  const testPassed = doctor.testPassedAt !== null;
  // a stream that staff have not listed is treated as open, so older doctors keep working
  const streamOpen = !stream || (stream.isActive && stream.status === "OPEN");

  return {
    stream: stream
      ? { id: stream.id, name: stream.name, status: stream.status, questionsPerTest: Math.min(stream.questionsPerTest, questions), passPercent: stream.passPercent }
      : null,
    specialization: doctor.specializationRef ? { id: doctor.specializationRef.id, name: doctor.specializationRef.name } : null,
    verified,
    verificationStatus: doctor.verificationStatus,
    testRequired,
    testPassed,
    streamOpen,
    hasFee: doctor.videoFee !== null || doctor.audioFee !== null,
    wantsToConsult: doctor.isListed,
    consulting: doctor.acceptsConsultations,
    ready: verified && (!testRequired || testPassed) && streamOpen,
  };
};

/**
 * Switches consultations on once the doctor has finished every step and wants to consult.
 * It never switches them off: staff do that, or a suspension does.
 */
export const settleConsulting = async (db: Db, doctorId: number) => {
  const state = await onboardingOf(db, doctorId);
  if (!state || !state.ready || !state.wantsToConsult || state.consulting) return false;
  await db.doctorProfile.update({ where: { id: doctorId }, data: { acceptsConsultations: true } });
  return true;
};
