BEGIN;

-- AlterTable
ALTER TABLE "quote_labor" ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "quote_parts" ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Existing quotes keep the order they show in today. Lines were read without
-- an ORDER BY, which returns them in physical row order, so number them by it.
UPDATE "quote_parts" AS p
SET "sortOrder" = o.position
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "quoteId" ORDER BY ctid) - 1 AS position
  FROM "quote_parts"
) AS o
WHERE p.id = o.id;

UPDATE "quote_labor" AS l
SET "sortOrder" = o.position
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "quoteId" ORDER BY ctid) - 1 AS position
  FROM "quote_labor"
) AS o
WHERE l.id = o.id;

COMMIT;
