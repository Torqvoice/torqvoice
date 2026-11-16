-- AlterTable
ALTER TABLE "inspections" ADD COLUMN     "shareExpiresAt" TIMESTAMP(3),
ADD COLUMN     "shareNeverExpires" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shareRenewedAt" TIMESTAMP(3),
ADD COLUMN     "sharedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "quotes" ADD COLUMN     "shareExpiresAt" TIMESTAMP(3),
ADD COLUMN     "shareNeverExpires" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shareRenewedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "service_records" ADD COLUMN     "manuallyPaidAt" TIMESTAMP(3),
ADD COLUMN     "shareExpiresAt" TIMESTAMP(3),
ADD COLUMN     "shareNeverExpires" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shareRenewedAt" TIMESTAMP(3);

-- A link made before this column has no day to count from. The inspection's
-- last change is the closest thing on record, and never later than today.
UPDATE "inspections" SET "sharedAt" = "updatedAt" WHERE "publicToken" IS NOT NULL AND "sharedAt" IS NULL;
