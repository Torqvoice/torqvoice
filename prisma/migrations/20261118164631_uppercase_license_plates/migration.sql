-- Licence plates (and boat registrations) are stored in one form from now on:
-- trimmed, single spaces, upper case. Bring the existing rows to it.
-- ASCII letters are mapped by hand so the result does not depend on the
-- database locale (a Turkish locale would turn "i" into a dotted capital);
-- upper() then handles the remaining letters where the locale knows them.
-- Spaces and hyphens stay. Issued documents and saved job titles are frozen
-- copies and are not touched.
BEGIN;

UPDATE "vehicles" AS v
SET "licensePlate" = n.plate
FROM (
  SELECT
    "id",
    upper(
      translate(
        btrim(regexp_replace("licensePlate", '\s+', ' ', 'g')),
        'abcdefghijklmnopqrstuvwxyz',
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
      )
    ) AS plate
  FROM "vehicles"
  WHERE "licensePlate" IS NOT NULL
) AS n
WHERE v."id" = n."id"
  AND n.plate <> ''
  AND n.plate <> v."licensePlate";

COMMIT;
