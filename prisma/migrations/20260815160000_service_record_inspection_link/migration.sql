-- Lets a work order be raised straight from an inspection, without a quote in
-- between, and lets the inspection show what it raised. Additive and
-- idempotent; safe to re-run.

ALTER TABLE "service_records" ADD COLUMN IF NOT EXISTS "inspectionId" TEXT;

DO $$ BEGIN
  ALTER TABLE "service_records" ADD CONSTRAINT "service_records_inspectionId_fkey"
    FOREIGN KEY ("inspectionId") REFERENCES "inspections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "service_records_inspectionId_idx" ON "service_records"("inspectionId");
