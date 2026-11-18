-- AlterTable
ALTER TABLE "service_attachments" ADD COLUMN     "scan" JSONB;

-- AlterTable
ALTER TABLE "vehicle_findings" ADD COLUMN     "faultCode" TEXT,
ADD COLUMN     "faultMeaning" TEXT,
ADD COLUMN     "faultMeaningSource" TEXT,
ADD COLUMN     "faultModule" TEXT,
ADD COLUMN     "faultStatus" TEXT,
ADD COLUMN     "sourceAttachmentId" TEXT;

-- CreateTable
CREATE TABLE "workshop_fault_codes" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "make" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL DEFAULT '',
    "notes" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workshop_fault_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workshop_fault_codes_organizationId_idx" ON "workshop_fault_codes"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "workshop_fault_codes_organizationId_code_make_key" ON "workshop_fault_codes"("organizationId", "code", "make");

-- CreateIndex
CREATE INDEX "vehicle_findings_vehicleId_faultCode_idx" ON "vehicle_findings"("vehicleId", "faultCode");

-- CreateIndex
CREATE INDEX "vehicle_findings_sourceAttachmentId_idx" ON "vehicle_findings"("sourceAttachmentId");

-- AddForeignKey
ALTER TABLE "vehicle_findings" ADD CONSTRAINT "vehicle_findings_sourceAttachmentId_fkey" FOREIGN KEY ("sourceAttachmentId") REFERENCES "service_attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop_fault_codes" ADD CONSTRAINT "workshop_fault_codes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop_fault_codes" ADD CONSTRAINT "workshop_fault_codes_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
