/*
  Warnings:

  - You are about to drop the `board_assignments` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "board_assignments" DROP CONSTRAINT "board_assignments_inspectionId_fkey";

-- DropForeignKey
ALTER TABLE "board_assignments" DROP CONSTRAINT "board_assignments_serviceRecordId_fkey";

-- DropForeignKey
ALTER TABLE "board_assignments" DROP CONSTRAINT "board_assignments_technicianId_fkey";

-- AlterTable
ALTER TABLE "inspections" ADD COLUMN     "endDateTime" TIMESTAMP(3),
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "startDateTime" TIMESTAMP(3),
ALTER COLUMN "technicianId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "service_records" ADD COLUMN     "endDateTime" TIMESTAMP(3),
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "startDateTime" TIMESTAMP(3),
ADD COLUMN     "technicianId" TEXT;

-- AlterTable
ALTER TABLE "technicians" ADD COLUMN     "dailyCapacity" INTEGER NOT NULL DEFAULT 480;

-- DropTable
DROP TABLE "board_assignments";

-- CreateIndex
CREATE INDEX "inspections_technicianId_idx" ON "inspections"("technicianId");

-- CreateIndex
CREATE INDEX "service_records_technicianId_idx" ON "service_records"("technicianId");

-- Clean up orphaned technicianId references before adding foreign keys
UPDATE "service_records" SET "technicianId" = NULL WHERE "technicianId" IS NOT NULL AND "technicianId" NOT IN (SELECT id FROM "technicians");
UPDATE "inspections" SET "technicianId" = NULL WHERE "technicianId" IS NOT NULL AND "technicianId" NOT IN (SELECT id FROM "technicians");

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "technicians"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "technicians"("id") ON DELETE SET NULL ON UPDATE CASCADE;
