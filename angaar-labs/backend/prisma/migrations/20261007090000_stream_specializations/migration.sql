-- AlterTable
ALTER TABLE "DoctorProfile" ADD COLUMN     "specializationId" INTEGER;

-- AlterTable
ALTER TABLE "StreamQuestion" ADD COLUMN     "specializationId" INTEGER;

-- CreateTable
CREATE TABLE "StreamSpecialization" (
    "id" SERIAL NOT NULL,
    "streamId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StreamSpecialization_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StreamSpecialization_streamId_isActive_idx" ON "StreamSpecialization"("streamId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "StreamSpecialization_streamId_name_key" ON "StreamSpecialization"("streamId", "name");

-- CreateIndex
CREATE INDEX "StreamQuestion_specializationId_idx" ON "StreamQuestion"("specializationId");

-- AddForeignKey
ALTER TABLE "DoctorProfile" ADD CONSTRAINT "DoctorProfile_specializationId_fkey" FOREIGN KEY ("specializationId") REFERENCES "StreamSpecialization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreamSpecialization" ADD CONSTRAINT "StreamSpecialization_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "ConsultingStream"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreamQuestion" ADD CONSTRAINT "StreamQuestion_specializationId_fkey" FOREIGN KEY ("specializationId") REFERENCES "StreamSpecialization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

