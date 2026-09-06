-- Named designs become rows, and an issued invoice keeps what it was issued
-- with. Prisma does not wrap a migration in a transaction; this one moves
-- data, so it wraps itself.
BEGIN;

-- CreateTable
CREATE TABLE "document_designs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "layout" JSONB NOT NULL,
    "template" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_designs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_design_snapshots" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "layout" JSONB NOT NULL,
    "template" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_design_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_asset_snapshots" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_asset_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_designs_organizationId_documentType_idx" ON "document_designs"("organizationId", "documentType");

-- CreateIndex
CREATE UNIQUE INDEX "document_design_snapshots_organizationId_hash_key" ON "document_design_snapshots"("organizationId", "hash");

-- CreateIndex
CREATE UNIQUE INDEX "document_asset_snapshots_organizationId_hash_key" ON "document_asset_snapshots"("organizationId", "hash");

-- AddForeignKey
ALTER TABLE "document_designs" ADD CONSTRAINT "document_designs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_design_snapshots" ADD CONSTRAINT "document_design_snapshots_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_asset_snapshots" ADD CONSTRAINT "document_asset_snapshots_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "service_records" ADD COLUMN "designId" TEXT,
ADD COLUMN "issuedAt" TIMESTAMP(3),
ADD COLUMN "issuedDesignSnapshotId" TEXT,
ADD COLUMN "issuedLogoSnapshotId" TEXT,
ADD COLUMN "issuedData" JSONB;

-- AlterTable
ALTER TABLE "customers" ADD COLUMN "invoiceDesignId" TEXT;

-- CreateIndex
CREATE INDEX "service_records_designId_idx" ON "service_records"("designId");

-- CreateIndex
CREATE INDEX "service_records_issuedDesignSnapshotId_idx" ON "service_records"("issuedDesignSnapshotId");

-- CreateIndex
CREATE INDEX "service_records_issuedLogoSnapshotId_idx" ON "service_records"("issuedLogoSnapshotId");

-- CreateIndex
CREATE INDEX "customers_invoiceDesignId_idx" ON "customers"("invoiceDesignId");

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_designId_fkey" FOREIGN KEY ("designId") REFERENCES "document_designs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_issuedDesignSnapshotId_fkey" FOREIGN KEY ("issuedDesignSnapshotId") REFERENCES "document_design_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_issuedLogoSnapshotId_fkey" FOREIGN KEY ("issuedLogoSnapshotId") REFERENCES "document_asset_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_invoiceDesignId_fkey" FOREIGN KEY ("invoiceDesignId") REFERENCES "document_designs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Data: the designs a workshop saved in the designer, out of the settings
-- blob and into rows. Ids are kept, so "invoice.activeDesign" pointers of
-- the form design:<id> keep meaning the same design.
--
-- Row by row in PL/pgSQL rather than one INSERT ... SELECT, because this has
-- to land on every organization there is: most have no blob at all, some
-- have an empty list, and a blob written by an older build could hold
-- anything. A value that is not JSON, not an array, or an entry without an
-- id, a name or a layout object is skipped, never fatal. Designs were saved
-- for whichever document was on the canvas and the blob did not record
-- which; every entry becomes an invoice design, which is what the gallery
-- has always shown them as.
DO $$
DECLARE
  setting RECORD;
  entry RECORD;
  designs jsonb;
  saved_at timestamptz;
  layout jsonb;
  template jsonb;
BEGIN
  FOR setting IN
    SELECT "organizationId", "value"
    FROM "app_settings"
    WHERE "key" = 'designer.savedDesigns' AND "organizationId" IS NOT NULL
  LOOP
    BEGIN
      designs := setting."value"::jsonb;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;
    IF designs IS NULL OR jsonb_typeof(designs) <> 'array' THEN
      CONTINUE;
    END IF;

    FOR entry IN SELECT value FROM jsonb_array_elements(designs) LOOP
      IF jsonb_typeof(entry.value) <> 'object' THEN CONTINUE; END IF;
      IF COALESCE(entry.value->>'id', '') = '' OR COALESCE(entry.value->>'name', '') = '' THEN
        CONTINUE;
      END IF;
      layout := entry.value->'layout';
      IF layout IS NULL OR jsonb_typeof(layout) <> 'object' THEN CONTINUE; END IF;
      template := entry.value->'template';
      IF template IS NULL OR jsonb_typeof(template) <> 'object' THEN
        template := '{}'::jsonb;
      END IF;
      BEGIN
        saved_at := NULLIF(entry.value->>'savedAt', '')::timestamptz;
      EXCEPTION WHEN OTHERS THEN
        saved_at := NULL;
      END;

      INSERT INTO "document_designs"
        ("id", "organizationId", "documentType", "name", "layout", "template", "createdAt", "updatedAt")
      VALUES (
        entry.value->>'id',
        setting."organizationId",
        'invoice',
        left(entry.value->>'name', 60),
        layout,
        template,
        COALESCE(saved_at, CURRENT_TIMESTAMP),
        COALESCE(saved_at, CURRENT_TIMESTAMP)
      )
      ON CONFLICT ("id") DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- The blob is not read any more; leaving it would let an old build write
-- over designs the new one has since edited.
DELETE FROM "app_settings" WHERE "key" = 'designer.savedDesigns';

COMMIT;
