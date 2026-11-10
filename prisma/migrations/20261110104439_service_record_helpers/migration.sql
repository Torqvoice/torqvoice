-- CreateTable
CREATE TABLE "service_record_helpers" (
    "id" TEXT NOT NULL,
    "serviceRecordId" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_record_helpers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_record_helpers_technicianId_idx" ON "service_record_helpers"("technicianId");

-- CreateIndex
CREATE INDEX "service_record_helpers_organizationId_idx" ON "service_record_helpers"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "service_record_helpers_serviceRecordId_technicianId_key" ON "service_record_helpers"("serviceRecordId", "technicianId");

-- AddForeignKey
ALTER TABLE "service_record_helpers" ADD CONSTRAINT "service_record_helpers_serviceRecordId_fkey" FOREIGN KEY ("serviceRecordId") REFERENCES "service_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_record_helpers" ADD CONSTRAINT "service_record_helpers_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "technicians"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_record_helpers" ADD CONSTRAINT "service_record_helpers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
