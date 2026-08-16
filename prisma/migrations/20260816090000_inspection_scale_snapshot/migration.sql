-- Pins each inspection to the defect scale it was actually graded on.
--
-- The scale lived only on the template and was read live, so a workshop that
-- edited an old template and switched it to the EU scale would silently
-- relabel every inspection ever made from it: a "Fail" recorded in 2024 would
-- start reading "Major defect" on a certificate that had already been issued.
--
-- Additive and idempotent; safe to re-run.

ALTER TABLE "inspections" ADD COLUMN IF NOT EXISTS "severityScale" TEXT;
ALTER TABLE "inspections" ADD COLUMN IF NOT EXISTS "country" TEXT;

-- Backfill from the template as it stands today, which for anything predating
-- the EU scale is the plain three-step scale the earlier migration pinned.
UPDATE "inspections" i
SET "severityScale" = t."severityScale", "country" = t."country"
FROM "inspection_templates" t
WHERE i."templateId" = t."id" AND i."severityScale" IS NULL;
