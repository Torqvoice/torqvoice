-- Manual data migration: DateTime refactor
-- Run AFTER the 20260307184306_workorder_duration migration
--
-- This migrates scheduling data from board_assignments to service_records/inspections.
-- The structural changes (adding columns, dropping constraints) are already handled
-- by the Prisma migration.

-- Step 1: Populate startDateTime/endDateTime on service_records from their serviceDate
-- For records that have a board assignment, use serviceDate as the base date.
-- Default: startDateTime = serviceDate at 08:00, endDateTime = serviceDate at 09:00
UPDATE service_records sr
SET
  "startDateTime" = sr."serviceDate",
  "endDateTime" = sr."serviceDate" + INTERVAL '1 hour'
WHERE sr."startDateTime" IS NULL;

-- Step 2: Populate startDateTime/endDateTime on inspections
-- Use createdAt as fallback date
UPDATE inspections i
SET
  "startDateTime" = i."createdAt",
  "endDateTime" = i."createdAt" + INTERVAL '1 hour'
WHERE i."startDateTime" IS NULL;
