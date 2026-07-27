-- Inventory hardening:
--   1. Quote lines can link to a stocked part, so converting a quote to a job
--      deducts the right inventory item.
--   2. Barcodes become unique per organization, so scanning is deterministic.
--   3. Every quantity change is recorded in an append-only ledger.

-- ---------------------------------------------------------------------------
-- 1. Quote parts -> inventory link
-- ---------------------------------------------------------------------------
ALTER TABLE "quote_parts" ADD COLUMN "inventoryPartId" TEXT;

-- ---------------------------------------------------------------------------
-- 2. Barcode uniqueness (data-safe)
--
-- Existing rows may hold blank, mixed-case, or duplicate barcodes, any of which
-- would make the unique index fail to build. Normalise first, then resolve
-- collisions by keeping the oldest row and clearing the barcode on the rest --
-- never deleting a part, since the part itself is still real inventory.
-- ---------------------------------------------------------------------------

-- Blank/whitespace-only barcodes are "no barcode".
UPDATE "inventory_parts"
SET "barcode" = NULL
WHERE "barcode" IS NOT NULL AND btrim("barcode") = '';

-- Canonical form: trimmed and upper-cased. Scanners emit upper-case and the
-- app now normalises identically on write and on lookup.
UPDATE "inventory_parts"
SET "barcode" = upper(btrim("barcode"))
WHERE "barcode" IS NOT NULL;

-- Resolve duplicates: keep the earliest-created row in each
-- (organizationId, barcode) group, clear the barcode on the others.
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

-- NULL barcodes stay distinct under the Postgres unique-index rule, so any
-- number of parts may have no barcode.
CREATE UNIQUE INDEX "inventory_parts_organizationId_barcode_key"
    ON "inventory_parts" ("organizationId", "barcode");

-- ---------------------------------------------------------------------------
-- 3. Stock movement ledger
-- ---------------------------------------------------------------------------
CREATE TABLE "stock_movements" (
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

-- CreateIndex
CREATE INDEX "stock_movements_inventoryPartId_createdAt_idx"
    ON "stock_movements" ("inventoryPartId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "stock_movements_organizationId_createdAt_idx"
    ON "stock_movements" ("organizationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "stock_movements_serviceRecordId_idx"
    ON "stock_movements" ("serviceRecordId");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_inventoryPartId_fkey"
    FOREIGN KEY ("inventoryPartId") REFERENCES "inventory_parts" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_serviceRecordId_fkey"
    FOREIGN KEY ("serviceRecordId") REFERENCES "service_records" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
