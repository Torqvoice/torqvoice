-- ServiceRecord gains its own organization scope and an optional direct
-- customer; vehicle becomes optional (parts-only / counter sales).
-- Idempotent and backfilling: safe on databases of any size and safe to
-- re-run. Existing records keep working unchanged.

ALTER TABLE "service_records" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "service_records" ADD COLUMN IF NOT EXISTS "customerId" TEXT;

-- Backfill organization from the owning vehicle (every existing record has one)
UPDATE "service_records" sr
SET "organizationId" = v."organizationId"
FROM "vehicles" v
WHERE sr."vehicleId" = v."id" AND sr."organizationId" IS NULL;

ALTER TABLE "service_records" ALTER COLUMN "vehicleId" DROP NOT NULL;

DO $$ BEGIN
  ALTER TABLE "service_records" ADD CONSTRAINT "service_records_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "service_records" ADD CONSTRAINT "service_records_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "service_records_organizationId_idx" ON "service_records"("organizationId");
CREATE INDEX IF NOT EXISTS "service_records_customerId_idx" ON "service_records"("customerId");
