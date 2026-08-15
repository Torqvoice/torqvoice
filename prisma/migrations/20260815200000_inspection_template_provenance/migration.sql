-- Stable, namespaced identity for templates that came from a package.
--
-- The library previously recognised its own checklists by name, which cannot
-- survive a rename and leaves nowhere to record where a template came from or
-- which version of it is installed. Idempotent; safe to re-run.

ALTER TABLE "inspection_templates" ADD COLUMN IF NOT EXISTS "packageId" TEXT;
ALTER TABLE "inspection_templates" ADD COLUMN IF NOT EXISTS "packageVersion" TEXT;
ALTER TABLE "inspection_templates" ADD COLUMN IF NOT EXISTS "packageSource" TEXT;

CREATE INDEX IF NOT EXISTS "inspection_templates_organizationId_packageId_idx"
  ON "inspection_templates"("organizationId", "packageId");

-- Backfill the built-in library by name, which is how it was matched until now.
-- This is the last time names are used for identity: from here the id is
-- authoritative, so a workshop renaming its copy keeps its provenance.
UPDATE "inspection_templates" SET "packageId" = 'torqvoice/' || v.slug,
                                  "packageVersion" = '1.0.0',
                                  "packageSource" = 'builtin'
FROM (VALUES
  ('EU periodic technical inspection',            'eu-roadworthiness'),
  ('EU inspection — motorcycles (L category)',    'eu-roadworthiness-motorcycle'),
  ('Norway — EU-kontroll',                        'no-eu-kontroll'),
  ('Germany — Hauptuntersuchung',                 'de-hauptuntersuchung'),
  ('Netherlands — APK',                           'nl-apk'),
  ('Standard multi-point inspection',             'standard-multipoint'),
  ('Pre-purchase inspection',                     'pre-purchase'),
  ('Electric and hybrid vehicle check',           'ev-hybrid'),
  ('Marine vessel inspection',                    'marine')
) AS v(name, slug)
WHERE "inspection_templates"."name" = v.name
  AND "inspection_templates"."packageId" IS NULL;
