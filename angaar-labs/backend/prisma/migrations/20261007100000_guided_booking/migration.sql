-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "intake" JSONB,
ADD COLUMN     "matchSessionId" INTEGER;

-- AlterTable
ALTER TABLE "StreamSpecialization" ADD COLUMN     "isGeneral" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "MatchSession" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "specializationId" INTEGER,
    "input" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchEvent" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "doctorId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "position" INTEGER,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchSession_userId_createdAt_idx" ON "MatchSession"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "MatchEvent_sessionId_idx" ON "MatchEvent"("sessionId");

-- CreateIndex
CREATE INDEX "MatchEvent_doctorId_type_idx" ON "MatchEvent"("doctorId", "type");

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_matchSessionId_fkey" FOREIGN KEY ("matchSessionId") REFERENCES "MatchSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchEvent" ADD CONSTRAINT "MatchEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "MatchSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

