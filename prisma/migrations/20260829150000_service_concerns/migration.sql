-- Concerns: what the customer asked about, one row each.
--
-- Additive only. Every existing job simply has no concerns, which reads
-- correctly on every screen, so nothing needs backfilling and nothing that
-- works today stops working.

CREATE TABLE "service_concerns" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "serviceRecordId" TEXT NOT NULL,

    CONSTRAINT "service_concerns_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "service_concerns_serviceRecordId_idx" ON "service_concerns"("serviceRecordId");

ALTER TABLE "service_concerns" ADD CONSTRAINT "service_concerns_serviceRecordId_fkey"
    FOREIGN KEY ("serviceRecordId") REFERENCES "service_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The cause half of the three Cs: a finding may answer a concern.
ALTER TABLE "vehicle_findings" ADD COLUMN "concernId" TEXT;

CREATE INDEX "vehicle_findings_concernId_idx" ON "vehicle_findings"("concernId");

ALTER TABLE "vehicle_findings" ADD CONSTRAINT "vehicle_findings_concernId_fkey"
    FOREIGN KEY ("concernId") REFERENCES "service_concerns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
