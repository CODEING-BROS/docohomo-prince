-- CreateEnum
CREATE TYPE "StreamStatus" AS ENUM ('OPEN', 'COMING_SOON', 'CLOSED');

-- AlterTable
ALTER TABLE "DoctorProfile" ADD COLUMN     "testPassedAt" TIMESTAMP(3),
ADD COLUMN     "tierId" INTEGER;

-- CreateTable
CREATE TABLE "ConsultingStream" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "StreamStatus" NOT NULL DEFAULT 'OPEN',
    "questionsPerTest" INTEGER NOT NULL DEFAULT 10,
    "passPercent" INTEGER NOT NULL DEFAULT 60,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultingStream_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StreamQuestion" (
    "id" SERIAL NOT NULL,
    "streamId" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "options" TEXT[],
    "correctIndex" INTEGER NOT NULL,
    "explanation" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StreamQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorTestAttempt" (
    "id" SERIAL NOT NULL,
    "doctorId" INTEGER NOT NULL,
    "streamId" INTEGER NOT NULL,
    "questionIds" INTEGER[],
    "answers" JSONB,
    "score" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "DoctorTestAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorTier" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "minPatientsPerDay" INTEGER NOT NULL DEFAULT 0,
    "maxPatientsPerDay" INTEGER NOT NULL,
    "commissionPercent" DECIMAL(5,2) NOT NULL DEFAULT 20,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoctorTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorReview" (
    "id" SERIAL NOT NULL,
    "doctorId" INTEGER NOT NULL,
    "patientId" INTEGER,
    "appointmentId" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'APPROVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoctorReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConsultingStream_name_key" ON "ConsultingStream"("name");

-- CreateIndex
CREATE INDEX "StreamQuestion_streamId_isActive_idx" ON "StreamQuestion"("streamId", "isActive");

-- CreateIndex
CREATE INDEX "DoctorTestAttempt_doctorId_startedAt_idx" ON "DoctorTestAttempt"("doctorId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorTier_name_key" ON "DoctorTier"("name");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorReview_appointmentId_key" ON "DoctorReview"("appointmentId");

-- CreateIndex
CREATE INDEX "DoctorReview_doctorId_status_idx" ON "DoctorReview"("doctorId", "status");

-- CreateIndex
CREATE INDEX "DoctorProfile_tierId_idx" ON "DoctorProfile"("tierId");

-- AddForeignKey
ALTER TABLE "DoctorProfile" ADD CONSTRAINT "DoctorProfile_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "DoctorTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreamQuestion" ADD CONSTRAINT "StreamQuestion_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "ConsultingStream"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorTestAttempt" ADD CONSTRAINT "DoctorTestAttempt_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "DoctorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorTestAttempt" ADD CONSTRAINT "DoctorTestAttempt_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "ConsultingStream"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorReview" ADD CONSTRAINT "DoctorReview_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "DoctorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorReview" ADD CONSTRAINT "DoctorReview_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorReview" ADD CONSTRAINT "DoctorReview_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
