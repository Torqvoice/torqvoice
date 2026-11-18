-- Licence plates (and boat registrations) are stored in one form from now on:
-- trimmed, single spaces, upper case. Bring the existing rows to it.
-- ASCII letters are mapped by hand so the result does not depend on the
-- database locale (a Turkish locale would turn "i" into a dotted capital);
-- upper() then handles the remaining letters where the locale knows them.
-- Spaces and hyphens stay; a plate that is empty or only spaces becomes no
-- plate, as a save stores it. Issued documents and saved job titles are frozen
-- copies and are not touched.
BEGIN;

UPDATE "vehicles" AS v
SET "licensePlate" = n.plate
FROM (
  SELECT
    "id",
    NULLIF(
      upper(
        translate(
          btrim(regexp_replace("licensePlate", '\s+', ' ', 'g')),
          'abcdefghijklmnopqrstuvwxyz',
          'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
        )
      ),
      ''
    ) AS plate
  FROM "vehicles"
  WHERE "licensePlate" IS NOT NULL
) AS n
WHERE v."id" = n."id"
  AND n.plate IS DISTINCT FROM v."licensePlate";

COMMIT;
