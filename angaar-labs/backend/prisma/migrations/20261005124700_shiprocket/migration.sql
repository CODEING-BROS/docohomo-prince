-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "labelUrl" TEXT,
ADD COLUMN     "lastCheckedAt" TIMESTAMP(3),
ADD COLUMN     "problem" TEXT,
ADD COLUMN     "providerOrderId" TEXT;
