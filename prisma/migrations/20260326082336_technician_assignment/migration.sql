-- Step 1: Add userId column if it doesn't already exist
ALTER TABLE "technicians" ADD COLUMN IF NOT EXISTS "userId" TEXT;

-- Step 2: Backfill userId from memberId where memberId points to a valid user
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'technicians' AND column_name = 'memberId') THEN
    UPDATE "technicians"
    SET "userId" = "memberId"
    WHERE "memberId" IS NOT NULL
      AND "userId" IS NULL
      AND "memberId" IN (SELECT "id" FROM "users");
  END IF;
END $$;

-- Step 3: Drop memberId if it exists
ALTER TABLE "technicians" DROP COLUMN IF EXISTS "memberId";

-- Step 4: Add foreign key for userId if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'technicians_userId_fkey' AND table_name = 'technicians'
  ) THEN
    ALTER TABLE "technicians" ADD CONSTRAINT "technicians_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Step 5: Backfill technicianId on service records where techName matches but technicianId is null
UPDATE "service_records" sr
SET "technicianId" = t."id"
FROM "technicians" t, "vehicles" v
WHERE v."id" = sr."vehicleId"
  AND sr."technicianId" IS NULL
  AND sr."techName" IS NOT NULL
  AND t."name" = sr."techName"
  AND t."organizationId" = v."organizationId"
  AND t."isActive" = true;
