-- Per-check defect phrases a workshop can standardise on, offered alongside the
-- built-in catalogue when a technician records a defect. Additive and
-- idempotent; safe to re-run.

ALTER TABLE "inspection_template_items"
  ADD COLUMN IF NOT EXISTS "defectSuggestions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "inspection_items"
  ADD COLUMN IF NOT EXISTS "defectSuggestions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
