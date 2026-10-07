// Shapes used by the patient and doctor pages.

export type PublicDoctor = {
  id: number; slug: string; displayName: string; photoUrl: string | null; qualification: string | null; specialization: string | null;
  experienceYears: number | null; languages: string[]; bio: string | null; clinicCity: string | null;
  videoFee: number | null; audioFee: number | null; slotMinutes: number;
};

/** What a patient answered in the guided booking, kept with the appointment for the doctor. */
export type Intake = {
  relation?: "SELF" | "FAMILY" | "CHILD"; city?: string; language?: string; symptoms?: string[]; duration?: string;
  severity?: "MILD" | "MODERATE" | "SEVERE"; conditions?: string; diagnosis?: string; medications?: string; specialization?: string;
};

export type AppointmentStatus = "PENDING_PAYMENT" | "CONFIRMED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "NO_SHOW";

export type MyAppointment = {
  id: number; appointmentNumber: string; patientName: string; mode: "VIDEO" | "AUDIO" | "CHAT" | "IN_CLINIC"; scheduledAt: string;
  durationMinutes: number; status: AppointmentStatus; fee: number; meetingUrl: string | null; symptoms: string | null;
  files?: { id: number; fileName: string; kind: string; size: number }[];
  doctor: { displayName: string; photoUrl: string | null; specialization: string | null; slug: string };
  prescription: { id: number; prescriptionNumber: string } | null;
  cancelledBy: string | null; cancelReason: string | null; review: { rating: number } | null;
  paid: boolean; refunded: number; canPay: boolean; canCancel: boolean; canRate: boolean;
};

export type MyPrescription = {
  id: number; prescriptionNumber: string; patientName: string; diagnosis: string | null; advice: string | null;
  followUpDate: string | null; issuedAt: string | null;
  doctor: { displayName: string; qualification: string | null; registrationNumber: string | null };
  orders: { id: number; orderNumber: string; status: string }[];
  items: {
    id: number; medicineName: string; potency: string | null; dosage: string | null; frequency: string | null; duration: string | null;
    instructions: string | null; quantity: number;
    buy: { variantId: number; productName: string; title: string; price: number; inStock: boolean; imageUrl: string | null } | null;
  }[];
};

export type MyOrder = {
  id: number; orderNumber: string; status: string; paymentMethod: string; paymentStatus: string; grandTotal: number; placedAt: string;
  items: { productName: string; variantTitle: string | null; quantity: number; imageUrl: string | null }[];
  estimatedDelivery: string | null; prescription: { prescriptionNumber: string } | null;
  shipments: { carrier: string | null; trackingNumber: string | null; trackingUrl: string | null }[];
};

/** The patient dashboard's first screen. */
export type PatientOverview = {
  upcoming: (Pick<MyAppointment, "id" | "appointmentNumber" | "patientName" | "mode" | "scheduledAt" | "durationMinutes" | "status" | "meetingUrl"> & {
    startsInMinutes: number; doctor: { displayName: string; photoUrl: string | null; specialization: string | null };
  })[];
  counts: { upcoming: number; consultationsDone: number; prescriptions: number; ordersOnTheWay: number; addresses: number };
  toDo: { kind: "pay-consultation" | "pay-order" | "order-medicines" | "follow-up" | "rate"; id: number; title: string; detail: string; amount: number | null }[];
  prescriptions: { id: number; prescriptionNumber: string; patientName: string; issuedAt: string | null; followUpDate: string | null; diagnosis: string | null; doctor: { displayName: string }; medicines: number; available: number; ordered: boolean }[];
  orders: { id: number; orderNumber: string; status: string; grandTotal: number; placedAt: string; estimatedDelivery: string | null; itemCount: number; firstItem: { productName: string; imageUrl: string | null } | null }[];
};

export const APPOINTMENT_TONE: Record<AppointmentStatus, string> = { CONFIRMED: "CONFIRMED", IN_PROGRESS: "PENDING", COMPLETED: "DELIVERED", CANCELLED: "CANCELLED", NO_SHOW: "CANCELLED", PENDING_PAYMENT: "PENDING" };

/** "in 3 hours", "tomorrow", "in 2 days": how far off a consultation is, in words a person would use. */
export const startsIn = (minutes: number) =>
  minutes <= 0 ? "now"
  : minutes < 60 ? `in ${minutes} ${minutes === 1 ? "minute" : "minutes"}`
  : minutes < 24 * 60 ? `in ${Math.round(minutes / 60)} ${Math.round(minutes / 60) === 1 ? "hour" : "hours"}`
  : minutes < 48 * 60 ? "tomorrow"
  : `in ${Math.round(minutes / 1440)} days`;

export type DoctorAppointment = {
  id: number; appointmentNumber: string; patientName: string; patientAge: number | null; patientGender: string | null; patientPhone: string | null;
  mode: string; scheduledAt: string; durationMinutes: number; status: AppointmentStatus; fee: number; doctorEarning: number;
  symptoms: string | null; meetingUrl: string | null; doctorNotes: string | null; paidOut: boolean;
  intake?: Intake | null;
  files?: { id: number; fileName: string; kind: string; size: number }[];
  prescription: { id: number; prescriptionNumber: string; status: "DRAFT" | "ISSUED" } | null;
};

export type DoctorOverview = {
  doctor: {
    displayName: string; photoUrl: string | null; verificationStatus: string; rejectionReason: string | null; consulting: boolean;
    videoFee: number | null; audioFee: number | null; commissionPercent: number; slotMinutes: number; hasWorkingHours: boolean;
    wholesale: { status: string; tier: string | null; discountPercent: number | null } | null;
    stream: string | null; tier: { name: string; maxPatientsPerDay: number } | null; rating: number; ratingCount: number;
  };
  earnings: {
    thisMonth: number; thisMonthConsultations: number; lastMonth: number; lastMonthConsultations: number;
    allTime: number; allTimeConsultations: number; waitingForPayout: number;
    months: { month: string; earned: number; consultations: number }[];
  };
  today: Pick<DoctorAppointment, "id" | "appointmentNumber" | "patientName" | "patientAge" | "patientGender" | "mode" | "scheduledAt" | "status" | "symptoms" | "meetingUrl">[];
  upcomingAfterToday: number;
};

export const MODE_LABEL: Record<string, string> = { VIDEO: "Video call", AUDIO: "Audio call", CHAT: "Chat", IN_CLINIC: "At the clinic" };
export const APPOINTMENT_LABEL: Record<AppointmentStatus, string> = {
  PENDING_PAYMENT: "Waiting for payment", CONFIRMED: "Booked", IN_PROGRESS: "Happening now", COMPLETED: "Done", CANCELLED: "Cancelled", NO_SHOW: "Missed",
};

/** Where a doctor stands in the four onboarding steps. */
export type Onboarding = {
  stream: { id: number; name: string; status: "OPEN" | "COMING_SOON" | "CLOSED"; questionsPerTest: number; passPercent: number } | null;
  verified: boolean; verificationStatus: string; testRequired: boolean; testPassed: boolean; streamOpen: boolean; hasFee: boolean;
  wantsToConsult: boolean; consulting: boolean; ready: boolean;
  submittedAt: string | null; verifiedAt: string | null; testPassedAt: string | null; rejectionReason: string | null;
  tier: { name: string; minPatientsPerDay: number; maxPatientsPerDay: number; commissionPercent: number; description: string | null } | null;
  attempts: { id: number; score: number; total: number; passed: boolean; submittedAt: string }[];
  triesLeftToday: number;
};
