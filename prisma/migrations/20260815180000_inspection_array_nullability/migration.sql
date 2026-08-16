-- Corrects the nullability of the scalar list columns added by
-- 20260815120000_inspection_eu_compliance and
-- 20260815140000_inspection_defect_suggestions.
--
-- Those migrations declared the arrays NOT NULL. Prisma maps a `String[]` field
-- to a plain nullable array column and enforces the "never null" part in the
-- client, so the NOT NULL left the database a step ahead of the schema and
-- every `prisma migrate dev` wanted to write a migration removing it.
--
-- Fixed forward rather than by editing those files: both have already been
-- applied, and Prisma checksums applied migrations. Idempotent; safe to re-run.

ALTER TABLE "inspection_template_items" ALTER COLUMN "choices" DROP NOT NULL;
ALTER TABLE "inspection_template_items" ALTER COLUMN "defectSuggestions" DROP NOT NULL;

ALTER TABLE "inspection_items" ALTER COLUMN "choices" DROP NOT NULL;
ALTER TABLE "inspection_items" ALTER COLUMN "defectSuggestions" DROP NOT NULL;
