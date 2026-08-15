-- Reminders gain their own organization scope, an optional customer, and an
-- optional vehicle so a reminder can relate to a vehicle, a customer, or just
-- the workshop. Idempotent and backfilling; safe to re-run.

ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "customerId" TEXT;

-- Backfill organization from the owning vehicle (every existing reminder has one)
UPDATE "reminders" r
SET "organizationId" = v."organizationId"
FROM "vehicles" v
WHERE r."vehicleId" = v."id" AND r."organizationId" IS NULL;

ALTER TABLE "reminders" ALTER COLUMN "vehicleId" DROP NOT NULL;

DO $$ BEGIN
  ALTER TABLE "reminders" ADD CONSTRAINT "reminders_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "reminders" ADD CONSTRAINT "reminders_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "reminders_customerId_idx" ON "reminders"("customerId");
CREATE INDEX IF NOT EXISTS "reminders_organizationId_idx" ON "reminders"("organizationId");
