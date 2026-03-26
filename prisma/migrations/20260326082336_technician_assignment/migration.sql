-- Step 1: Add userId column (keep memberId for now)
ALTER TABLE "technicians" ADD COLUMN "userId" TEXT;

-- Step 2: Backfill userId from memberId where memberId points to a valid user
UPDATE "technicians"
SET "userId" = "memberId"
WHERE "memberId" IS NOT NULL
  AND "userId" IS NULL
  AND "memberId" IN (SELECT "id" FROM "users");

-- Step 3: Drop memberId
ALTER TABLE "technicians" DROP COLUMN "memberId";

-- Step 4: Add foreign key for userId
ALTER TABLE "technicians" ADD CONSTRAINT "technicians_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 5: Backfill technicianId on service records where techName matches but technicianId is null
UPDATE "service_records" sr
SET "technicianId" = t."id"
FROM "technicians" t
JOIN "vehicles" v ON sr."vehicleId" = v."id"
WHERE sr."technicianId" IS NULL
  AND sr."techName" IS NOT NULL
  AND t."name" = sr."techName"
  AND t."organizationId" = v."organizationId"
  AND t."isActive" = true;
