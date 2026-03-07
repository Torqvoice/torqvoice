-- DropForeignKey (idempotent)
ALTER TABLE "board_assignments" DROP CONSTRAINT IF EXISTS "board_assignments_inspectionId_fkey";
ALTER TABLE "board_assignments" DROP CONSTRAINT IF EXISTS "board_assignments_serviceRecordId_fkey";
ALTER TABLE "board_assignments" DROP CONSTRAINT IF EXISTS "board_assignments_technicianId_fkey";

-- AlterTable inspections (idempotent)
ALTER TABLE "inspections" ADD COLUMN IF NOT EXISTS "endDateTime" TIMESTAMP(3);
ALTER TABLE "inspections" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "inspections" ADD COLUMN IF NOT EXISTS "startDateTime" TIMESTAMP(3);
ALTER TABLE "inspections" ALTER COLUMN "technicianId" DROP NOT NULL;

-- AlterTable service_records (idempotent)
ALTER TABLE "service_records" ADD COLUMN IF NOT EXISTS "endDateTime" TIMESTAMP(3);
ALTER TABLE "service_records" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "service_records" ADD COLUMN IF NOT EXISTS "startDateTime" TIMESTAMP(3);
ALTER TABLE "service_records" ADD COLUMN IF NOT EXISTS "technicianId" TEXT;

-- AlterTable technicians (idempotent)
ALTER TABLE "technicians" ADD COLUMN IF NOT EXISTS "dailyCapacity" INTEGER NOT NULL DEFAULT 480;

-- DropTable (idempotent)
DROP TABLE IF EXISTS "board_assignments";

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "inspections_technicianId_idx" ON "inspections"("technicianId");
CREATE INDEX IF NOT EXISTS "service_records_technicianId_idx" ON "service_records"("technicianId");

-- Clean up orphaned technicianId references before adding foreign keys
UPDATE "service_records" SET "technicianId" = NULL WHERE "technicianId" IS NOT NULL AND "technicianId" NOT IN (SELECT id FROM "technicians");
UPDATE "inspections" SET "technicianId" = NULL WHERE "technicianId" IS NOT NULL AND "technicianId" NOT IN (SELECT id FROM "technicians");

-- AddForeignKey (idempotent)
ALTER TABLE "service_records" DROP CONSTRAINT IF EXISTS "service_records_technicianId_fkey";
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "technicians"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "inspections" DROP CONSTRAINT IF EXISTS "inspections_technicianId_fkey";
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "technicians"("id") ON DELETE SET NULL ON UPDATE CASCADE;
