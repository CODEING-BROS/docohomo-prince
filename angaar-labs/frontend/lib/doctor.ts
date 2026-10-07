import type { VerificationStatus } from "@/lib/types";

/** One doctor in full, as `/api/admin/doctors/:id` returns it. */
export type DoctorDetail = {
  id: number; displayName: string; slug: string; photoUrl: string | null; stream: string | null; qualification: string | null;
  specialization: string | null; specializationId: number | null; experienceYears: number | null; languages: string[]; bio: string | null;
  registrationNumber: string | null; registrationCouncil: string | null; registrationYear: number | null;
  clinicName: string | null; clinicAddress: string | null; clinicCity: string | null; clinicState: string | null; clinicPincode: string | null;
  verificationStatus: VerificationStatus; submittedAt: string | null; verifiedAt: string | null; rejectionReason: string | null;
  videoFee: number | null; audioFee: number | null; slotMinutes: number; commissionPercent: number;
  phone: string | null; email: string | null; consulting: boolean;
  wholesale: { id: number; status: VerificationStatus; tier: string | null } | null;
  appointmentCount: number; prescriptionCount: number; createdAt: string;
  documents: { id: number; type: string; fileUrl: string; fileName: string | null; status: "PENDING" | "APPROVED" | "REJECTED"; remarks: string | null; createdAt: string }[];
  availability: { id: number; dayOfWeek: number; startTime: string; endTime: string; mode: string }[];
  timeOff: { id: number; startsAt: string; endsAt: string; reason: string | null }[];
};

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const DOCUMENT_LABEL: Record<string, string> = {
  REGISTRATION_CERTIFICATE: "Medical registration certificate", DEGREE_CERTIFICATE: "Degree certificate", GOVERNMENT_ID: "Government photo ID",
  CLINIC_PROOF: "Clinic proof", GST_CERTIFICATE: "GST certificate", DRUG_LICENSE: "Drug licence", SHOP_LICENSE: "Shop licence", PHOTO: "Photo", OTHER: "Other document",
};
