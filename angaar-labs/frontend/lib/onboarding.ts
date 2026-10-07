import type { VerificationStatus } from "@/lib/types";

// Doctor onboarding as the admin sees it: consulting streams, their test questions, and doctor levels.

export type StreamStatus = "OPEN" | "COMING_SOON" | "CLOSED";

/** One consulting stream, as `/api/admin/streams` returns it. */
export type StreamRow = {
  id: number; name: string; description: string | null; status: StreamStatus;
  questionsPerTest: number; passPercent: number; sortOrder: number; isActive: boolean;
  questionCount: number; activeQuestionCount: number; doctorCount: number; passedCount: number; specializationCount?: number;
};

/** What doctors of a stream can specialise in, as the stream's questions page returns it. */
export type StreamSpecialization = {
  id: number; streamId: number; name: string; description: string | null; symptoms: string[]; isGeneral: boolean;
  sortOrder: number; isActive: boolean; activeQuestionCount: number; doctorCount: number;
};

export type StreamQuestion = {
  id: number; question: string; options: string[]; correctIndex: number; // position of the right answer, from 0
  explanation: string | null; isActive: boolean; sortOrder: number; createdAt: string; updatedAt: string;
  specializationId: number | null; // empty: asked of every doctor in the stream
};

export const STREAM_STATUSES: StreamStatus[] = ["OPEN", "COMING_SOON", "CLOSED"];

// the badge colours are shared with other pages, so each stream state borrows the closest one
export const STREAM_STATUS: Record<StreamStatus, { label: string; tone: string; hint: string }> = {
  OPEN: { label: "Open", tone: "ACTIVE", hint: "Doctors can register and take consultations" },
  COMING_SOON: { label: "Coming soon", tone: "PENDING", hint: "Doctors can register; consultations start when it opens" },
  CLOSED: { label: "Closed", tone: "ARCHIVED", hint: "Hidden from new doctors; no consultations" },
};

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 6;

/** "A", "B", "C"… for the answer options. */
export const optionLetter = (index: number) => String.fromCharCode(65 + index);

/** Bronze, Silver, Gold: as `/api/admin/doctor-tiers` returns them. */
export type DoctorTier = {
  id: number; name: string; description: string | null; minPatientsPerDay: number; maxPatientsPerDay: number;
  commissionPercent: number; sortOrder: number; isActive: boolean; doctorCount: number;
  promoteAfterConsultations: number | null; promoteMinRating: number | null; // both empty: doctors reach this level only when staff move them
};

/** One doctor's progress through the four steps, as `/api/admin/doctors/:id/onboarding` returns it. */
export type DoctorOnboarding = {
  stream: { id: number; name: string; status: StreamStatus; questionsPerTest: number; passPercent: number } | null; // null when staff have not listed the doctor's stream
  streamName: string | null; // what the doctor chose
  verified: boolean; verificationStatus: VerificationStatus;
  testRequired: boolean; testPassed: boolean; streamOpen: boolean;
  hasFee: boolean; wantsToConsult: boolean; consulting: boolean; ready: boolean;
  photoUrl: string | null; gender: "MALE" | "FEMALE" | "OTHER" | null; dateOfBirth: string | null; // yyyy-MM-dd
  registeredAt: string; submittedAt: string | null; verifiedAt: string | null; testPassedAt: string | null;
  tierId: number | null;
  tier: { id: number; name: string; description: string | null; minPatientsPerDay: number; maxPatientsPerDay: number; commissionPercent: number } | null;
  commissionPercent: number; ratingAverage: number; ratingCount: number;
  attempts: { id: number; streamName: string; score: number; total: number; passed: boolean; startedAt: string; submittedAt: string | null }[];
};
