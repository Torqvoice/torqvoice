-- CreateTable
CREATE TABLE "vehicle_findings" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'needs_work',
    "status" TEXT NOT NULL DEFAULT 'open',
    "notes" TEXT,
    "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "serviceRecordId" TEXT,
    "resolvedServiceRecordId" TEXT,

    CONSTRAINT "vehicle_findings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vehicle_findings_vehicleId_idx" ON "vehicle_findings"("vehicleId");

-- CreateIndex
CREATE INDEX "vehicle_findings_serviceRecordId_idx" ON "vehicle_findings"("serviceRecordId");

-- AddForeignKey
ALTER TABLE "vehicle_findings" ADD CONSTRAINT "vehicle_findings_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_findings" ADD CONSTRAINT "vehicle_findings_serviceRecordId_fkey" FOREIGN KEY ("serviceRecordId") REFERENCES "service_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_findings" ADD CONSTRAINT "vehicle_findings_resolvedServiceRecordId_fkey" FOREIGN KEY ("resolvedServiceRecordId") REFERENCES "service_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
