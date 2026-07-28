-- Inventory: stock movement ledger, quote→stock linkage, barcode uniqueness
-- and low-stock alerting.
--
-- Ordering matters. The barcode data is normalised and de-duplicated BEFORE the
-- unique index is created, because existing installations may hold duplicate,
-- blank or mixed-case barcodes and a bare CREATE UNIQUE INDEX would abort the
-- upgrade for them.

-- ---------------------------------------------------------------------------
-- 1. New columns (nullable, no default — instant, no table rewrite)
-- ---------------------------------------------------------------------------

-- Records that a low-stock alert has already been sent for the current dip
-- below the reorder point. Cleared when stock recovers, so a part alerts once
-- per descent instead of on every check.
ALTER TABLE "inventory_parts" ADD COLUMN IF NOT EXISTS "lowStockAlertedAt" TIMESTAMP(3);

-- Lets a quote line remember which stocked part it was picked from, so
-- converting the quote to a job deducts the right inventory item.
ALTER TABLE "quote_parts" ADD COLUMN IF NOT EXISTS "inventoryPartId" TEXT;

-- ---------------------------------------------------------------------------
-- 2. Barcode clean-up, then uniqueness
--
-- Runs before the index so an upgrade can never fail on pre-existing data.
-- Nothing is deleted: at worst a duplicated barcode is cleared from the newer
-- of the two parts, and the part itself is untouched.
-- ---------------------------------------------------------------------------

-- Blank / whitespace-only barcodes mean "no barcode".
UPDATE "inventory_parts"
SET "barcode" = NULL
WHERE "barcode" IS NOT NULL AND btrim("barcode") = '';

-- Canonical form: trimmed and upper-cased. Scanners emit upper-case, and the
-- application now normalises identically on write and on lookup, so an exact
-- match is enough to resolve a scan to exactly one part.
UPDATE "inventory_parts"
SET "barcode" = upper(btrim("barcode"))
WHERE "barcode" IS NOT NULL
  AND "barcode" <> upper(btrim("barcode"));

-- Resolve any remaining collisions by keeping the earliest-created part in each
-- (organizationId, barcode) group and clearing the barcode on the others. Such
-- a barcode was already ambiguous — it could not reliably identify a part — and
-- the owner can re-scan the affected part to restore it.
WITH ranked AS (
    SELECT
        "id",
        row_number() OVER (
            PARTITION BY "organizationId", "barcode"
            ORDER BY "createdAt" ASC, "id" ASC
        ) AS rn
    FROM "inventory_parts"
    WHERE "barcode" IS NOT NULL
)
UPDATE "inventory_parts" p
SET "barcode" = NULL
FROM ranked r
WHERE p."id" = r."id" AND r.rn > 1;

-- Postgres treats NULLs as distinct in a unique index, so any number of parts
-- may have no barcode at all.
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_parts_organizationId_barcode_key"
    ON "inventory_parts"("organizationId", "barcode");

-- ---------------------------------------------------------------------------
-- 3. Stock movement ledger
--
-- Append-only record of every change to InventoryPart.quantity, written inside
-- the same transaction as the stock change itself so the two cannot drift.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "stock_movements" (
    "id" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "quantityAfter" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "inventoryPartId" TEXT NOT NULL,
    "serviceRecordId" TEXT,
    "serviceRecordLabel" TEXT,
    "userId" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- Matches the history query exactly (one part, newest first), so paging stays
-- an index scan with no sort step however long the ledger grows.
CREATE INDEX IF NOT EXISTS "stock_movements_inventoryPartId_createdAt_idx"
    ON "stock_movements"("inventoryPartId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "stock_movements_organizationId_createdAt_idx"
    ON "stock_movements"("organizationId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "stock_movements_serviceRecordId_idx"
    ON "stock_movements"("serviceRecordId");

-- Deleting a part removes its history; deleting the job or the user only nulls
-- the link, so "where was this used" survives them.
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_inventoryPartId_fkey"
    FOREIGN KEY ("inventoryPartId") REFERENCES "inventory_parts"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_serviceRecordId_fkey"
    FOREIGN KEY ("serviceRecordId") REFERENCES "service_records"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
