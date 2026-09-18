-- Prisma does not wrap a migration in a transaction, and this one changes
-- rows as well as tables: a half-applied run would leave jobs that print a
-- warranty with no statement to print it under.
BEGIN;

-- AlterTable
ALTER TABLE "service_records" ADD COLUMN     "warrantyStatus" TEXT;

-- AlterTable
ALTER TABLE "quotes" ADD COLUMN     "warrantyMonths" INTEGER,
ADD COLUMN     "warrantyMileage" INTEGER,
ADD COLUMN     "warrantyNotes" TEXT,
ADD COLUMN     "warrantyStatus" TEXT;

-- Every job that already carries a warranty was offering one. Until now a
-- filled field was the only way to say so.
UPDATE "service_records"
SET "warrantyStatus" = 'included'
WHERE "warrantyMonths" IS NOT NULL
   OR "warrantyMileage" IS NOT NULL
   OR ("warrantyNotes" IS NOT NULL AND "warrantyNotes" <> '');

COMMIT;
