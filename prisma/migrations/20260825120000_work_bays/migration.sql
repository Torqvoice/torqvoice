-- AlterTable
ALTER TABLE "service_records" ADD COLUMN     "workBayId" TEXT;

-- AlterTable
ALTER TABLE "inspections" ADD COLUMN     "workBayId" TEXT;

-- CreateTable
CREATE TABLE "work_bays" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#64748b',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "dailyCapacity" INTEGER NOT NULL DEFAULT 480,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_bays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_bays_organizationId_idx" ON "work_bays"("organizationId");

-- CreateIndex
CREATE INDEX "service_records_workBayId_idx" ON "service_records"("workBayId");

-- CreateIndex
CREATE INDEX "inspections_workBayId_idx" ON "inspections"("workBayId");

-- AddForeignKey
ALTER TABLE "work_bays" ADD CONSTRAINT "work_bays_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_workBayId_fkey" FOREIGN KEY ("workBayId") REFERENCES "work_bays"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_workBayId_fkey" FOREIGN KEY ("workBayId") REFERENCES "work_bays"("id") ON DELETE SET NULL ON UPDATE CASCADE;
