-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "bodyType" TEXT;

-- CreateTable
CREATE TABLE "condition_marks" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "inspectionId" TEXT,
    "inspectionItemId" TEXT,
    "serviceRecordId" TEXT,
    "bodyType" TEXT NOT NULL,
    "view" TEXT NOT NULL,
    "panel" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'minor',
    "note" TEXT,
    "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "condition_marks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "condition_marks_vehicleId_idx" ON "condition_marks"("vehicleId");

-- CreateIndex
CREATE INDEX "condition_marks_inspectionId_idx" ON "condition_marks"("inspectionId");

-- CreateIndex
CREATE INDEX "condition_marks_inspectionItemId_idx" ON "condition_marks"("inspectionItemId");

-- CreateIndex
CREATE INDEX "condition_marks_serviceRecordId_idx" ON "condition_marks"("serviceRecordId");

-- CreateIndex
CREATE INDEX "condition_marks_organizationId_idx" ON "condition_marks"("organizationId");

-- AddForeignKey
ALTER TABLE "condition_marks" ADD CONSTRAINT "condition_marks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condition_marks" ADD CONSTRAINT "condition_marks_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condition_marks" ADD CONSTRAINT "condition_marks_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "inspections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condition_marks" ADD CONSTRAINT "condition_marks_inspectionItemId_fkey" FOREIGN KEY ("inspectionItemId") REFERENCES "inspection_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condition_marks" ADD CONSTRAINT "condition_marks_serviceRecordId_fkey" FOREIGN KEY ("serviceRecordId") REFERENCES "service_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condition_marks" ADD CONSTRAINT "condition_marks_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condition_marks" ADD CONSTRAINT "condition_marks_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
