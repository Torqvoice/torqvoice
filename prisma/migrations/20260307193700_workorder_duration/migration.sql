-- AlterTable
ALTER TABLE "inspections" ALTER COLUMN "technicianId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "inspections_technicianId_idx" ON "inspections"("technicianId");

-- CreateIndex
CREATE INDEX "service_records_technicianId_idx" ON "service_records"("technicianId");

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "technicians"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "technicians"("id") ON DELETE SET NULL ON UPDATE CASCADE;
