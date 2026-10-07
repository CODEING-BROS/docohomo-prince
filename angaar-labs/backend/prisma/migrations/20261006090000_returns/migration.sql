-- AlterEnum
ALTER TYPE "ReturnStatus" ADD VALUE 'CLOSED';

-- AlterTable
ALTER TABLE "ReturnItem" ADD COLUMN     "restocked" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ReturnRequest" ADD COLUMN     "createdById" INTEGER,
ADD COLUMN     "pickedUpAt" TIMESTAMP(3),
ADD COLUMN     "pickupCourier" TEXT,
ADD COLUMN     "pickupTracking" TEXT,
ADD COLUMN     "receivedAt" TIMESTAMP(3),
ADD COLUMN     "refundId" INTEGER,
ADD COLUMN     "refundMethod" TEXT,
ADD COLUMN     "refundReference" TEXT,
ADD COLUMN     "requestedById" INTEGER;

