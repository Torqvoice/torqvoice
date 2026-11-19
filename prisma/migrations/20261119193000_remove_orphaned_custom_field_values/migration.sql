-- Custom field values are keyed by the id of the work order or quote they
-- belong to, with no foreign key, so deleting the record left its values
-- behind. The app now removes them with the record; this removes the ones
-- left from before.
--
-- A row is removed only when its kind names a table and no row of that table
-- has its id. Ids are never reused, so nothing can show such a value again.
-- Values of any other kind are not touched.
BEGIN;

DELETE FROM "custom_field_values" v
WHERE v."entityType" = 'service_record'
  AND NOT EXISTS (SELECT 1 FROM "service_records" r WHERE r."id" = v."entityId");

DELETE FROM "custom_field_values" v
WHERE v."entityType" = 'quote'
  AND NOT EXISTS (SELECT 1 FROM "quotes" q WHERE q."id" = v."entityId");

COMMIT;
