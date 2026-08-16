-- Inspection overhaul: flexible, country-aware templates and the roadworthiness
-- certificate fields required by Directive 2014/45/EU Annex IV.
--
-- Every column here is nullable or defaulted, so existing rows keep working and
-- the existing condition values ("pass" / "attention" / "fail" /
-- "not_inspected") stay valid — the EU scale maps onto them and only adds
-- "dangerous" on top. Idempotent; safe to re-run.

-- Templates gain a regulatory profile
ALTER TABLE "inspection_templates" ADD COLUMN IF NOT EXISTS "country" TEXT;
ALTER TABLE "inspection_templates" ADD COLUMN IF NOT EXISTS "standard" TEXT DEFAULT 'custom';
ALTER TABLE "inspection_templates" ADD COLUMN IF NOT EXISTS "severityScale" TEXT NOT NULL DEFAULT 'eu';

-- Sections gain a description and a regulation reference (Annex I category)
ALTER TABLE "inspection_template_sections" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "inspection_template_sections" ADD COLUMN IF NOT EXISTS "code" TEXT;

-- Template items become configurable checks rather than plain labels
ALTER TABLE "inspection_template_items" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "inspection_template_items" ADD COLUMN IF NOT EXISTS "code" TEXT;
ALTER TABLE "inspection_template_items" ADD COLUMN IF NOT EXISTS "inputType" TEXT NOT NULL DEFAULT 'condition';
ALTER TABLE "inspection_template_items" ADD COLUMN IF NOT EXISTS "unit" TEXT;
ALTER TABLE "inspection_template_items" ADD COLUMN IF NOT EXISTS "minValue" DOUBLE PRECISION;
ALTER TABLE "inspection_template_items" ADD COLUMN IF NOT EXISTS "maxValue" DOUBLE PRECISION;
ALTER TABLE "inspection_template_items" ADD COLUMN IF NOT EXISTS "choices" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "inspection_template_items" ADD COLUMN IF NOT EXISTS "required" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "inspection_template_items" ADD COLUMN IF NOT EXISTS "photoRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "inspection_template_items" ADD COLUMN IF NOT EXISTS "defaultSeverity" TEXT;

-- Annex IV certificate fields, snapshotted on the inspection itself
ALTER TABLE "inspections" ADD COLUMN IF NOT EXISTS "vehicleCategory" TEXT;
ALTER TABLE "inspections" ADD COLUMN IF NOT EXISTS "nextTestDue" TIMESTAMP(3);
ALTER TABLE "inspections" ADD COLUMN IF NOT EXISTS "certificateNumber" TEXT;
ALTER TABLE "inspections" ADD COLUMN IF NOT EXISTS "inspectorName" TEXT;
ALTER TABLE "inspections" ADD COLUMN IF NOT EXISTS "testLocation" TEXT;

-- Filled-in items carry a copy of their check definition plus the recorded value
ALTER TABLE "inspection_items" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "inspection_items" ADD COLUMN IF NOT EXISTS "code" TEXT;
ALTER TABLE "inspection_items" ADD COLUMN IF NOT EXISTS "sectionCode" TEXT;
ALTER TABLE "inspection_items" ADD COLUMN IF NOT EXISTS "inputType" TEXT NOT NULL DEFAULT 'condition';
ALTER TABLE "inspection_items" ADD COLUMN IF NOT EXISTS "unit" TEXT;
ALTER TABLE "inspection_items" ADD COLUMN IF NOT EXISTS "minValue" DOUBLE PRECISION;
ALTER TABLE "inspection_items" ADD COLUMN IF NOT EXISTS "maxValue" DOUBLE PRECISION;
ALTER TABLE "inspection_items" ADD COLUMN IF NOT EXISTS "choices" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "inspection_items" ADD COLUMN IF NOT EXISTS "required" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "inspection_items" ADD COLUMN IF NOT EXISTS "photoRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "inspection_items" ADD COLUMN IF NOT EXISTS "defaultSeverity" TEXT;
ALTER TABLE "inspection_items" ADD COLUMN IF NOT EXISTS "measuredValue" DOUBLE PRECISION;
ALTER TABLE "inspection_items" ADD COLUMN IF NOT EXISTS "textValue" TEXT;

-- Templates that predate this migration graded on the old three-step scale
UPDATE "inspection_templates" SET "severityScale" = 'basic' WHERE "standard" IS NULL OR "standard" = 'custom';
