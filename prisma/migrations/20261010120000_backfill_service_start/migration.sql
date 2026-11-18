-- Jobs brought in by the Lubelog, Invoice Ninja and spreadsheet importers were
-- written without a start, and every date-ranged report finds a job by its
-- start, so they were in none of them. The start is the service date, the
-- same rule the 20260327055410 backfill used for older rows.
BEGIN;

UPDATE "service_records"
SET "startDateTime" = "serviceDate"
WHERE "startDateTime" IS NULL;

COMMIT;
