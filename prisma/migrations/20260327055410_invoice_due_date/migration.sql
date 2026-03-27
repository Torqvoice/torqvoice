-- AlterTable
ALTER TABLE "service_records" ADD COLUMN     "invoiceDate" TIMESTAMP(3),
ADD COLUMN     "invoiceDueDate" TIMESTAMP(3);

-- Backfill startDateTime from serviceDate for all service records where startDateTime is NULL
UPDATE "service_records"
SET "startDateTime" = "serviceDate"
WHERE "startDateTime" IS NULL;

-- Backfill invoiceDate from startDateTime (which is now always set)
UPDATE "service_records"
SET "invoiceDate" = COALESCE("startDateTime", "serviceDate")
WHERE "invoiceDate" IS NULL;

-- Backfill startDateTime for inspections from createdAt where startDateTime is NULL
UPDATE "inspections"
SET "startDateTime" = "createdAt"
WHERE "startDateTime" IS NULL;
