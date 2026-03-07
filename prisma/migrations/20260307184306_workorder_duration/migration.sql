/*
  Warnings:

  - You are about to drop the column `date` on the `board_assignments` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[serviceRecordId]` on the table `board_assignments` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[inspectionId]` on the table `board_assignments` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "board_assignments_inspectionId_date_key";

-- DropIndex
DROP INDEX "board_assignments_organizationId_date_idx";

-- DropIndex
DROP INDEX "board_assignments_serviceRecordId_date_key";

-- DropIndex
DROP INDEX "board_assignments_technicianId_date_idx";

-- AlterTable
ALTER TABLE "board_assignments" DROP COLUMN "date";

-- AlterTable
ALTER TABLE "inspections" ADD COLUMN     "endDateTime" TIMESTAMP(3),
ADD COLUMN     "startDateTime" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "service_records" ADD COLUMN     "endDateTime" TIMESTAMP(3),
ADD COLUMN     "startDateTime" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "technicians" ADD COLUMN     "dailyCapacity" INTEGER NOT NULL DEFAULT 480;

-- CreateIndex
CREATE UNIQUE INDEX "board_assignments_serviceRecordId_key" ON "board_assignments"("serviceRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "board_assignments_inspectionId_key" ON "board_assignments"("inspectionId");

-- CreateIndex
CREATE INDEX "board_assignments_organizationId_idx" ON "board_assignments"("organizationId");

-- CreateIndex
CREATE INDEX "board_assignments_technicianId_idx" ON "board_assignments"("technicianId");
