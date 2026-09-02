-- CreateTable
CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "mapping" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undoneAt" TIMESTAMP(3),

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_batches_organizationId_createdAt_idx" ON "import_batches"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "customers" ADD COLUMN "importBatchId" TEXT;

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN "importBatchId" TEXT;

-- AlterTable
ALTER TABLE "service_records" ADD COLUMN "importBatchId" TEXT;

-- CreateIndex
CREATE INDEX "customers_importBatchId_idx" ON "customers"("importBatchId");

-- CreateIndex
CREATE INDEX "vehicles_importBatchId_idx" ON "vehicles"("importBatchId");

-- CreateIndex
CREATE INDEX "service_records_importBatchId_idx" ON "service_records"("importBatchId");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "inspections" ADD COLUMN "importBatchId" TEXT;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
