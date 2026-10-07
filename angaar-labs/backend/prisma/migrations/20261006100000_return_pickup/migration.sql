-- AlterTable
ALTER TABLE "ReturnRequest" ADD COLUMN     "pickupArrivedAt" TIMESTAMP(3),
ADD COLUMN     "pickupCheckedAt" TIMESTAMP(3),
ADD COLUMN     "pickupOrderRef" TEXT,
ADD COLUMN     "pickupProblem" TEXT,
ADD COLUMN     "pickupShipmentRef" TEXT,
ADD COLUMN     "pickupStatus" TEXT;

