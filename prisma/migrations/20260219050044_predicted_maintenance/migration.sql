-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "maintenanceDismissed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maintenanceDismissedAt" TIMESTAMP(3);
