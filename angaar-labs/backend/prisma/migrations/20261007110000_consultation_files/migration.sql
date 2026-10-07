-- CreateTable
CREATE TABLE "ConsultationFile" (
    "id" SERIAL NOT NULL,
    "uploaderId" INTEGER NOT NULL,
    "appointmentId" INTEGER,
    "fileName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsultationFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConsultationFile_storedName_key" ON "ConsultationFile"("storedName");

-- CreateIndex
CREATE INDEX "ConsultationFile_appointmentId_idx" ON "ConsultationFile"("appointmentId");

-- CreateIndex
CREATE INDEX "ConsultationFile_uploaderId_appointmentId_idx" ON "ConsultationFile"("uploaderId", "appointmentId");

-- AddForeignKey
ALTER TABLE "ConsultationFile" ADD CONSTRAINT "ConsultationFile_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

