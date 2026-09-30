-- Prisma does not wrap a migration in a transaction. Nothing here touches
-- existing rows, but the table and the column that points at it belong
-- together, so they land together or not at all.
BEGIN;

-- CreateTable
CREATE TABLE "work_order_statuses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'slate',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "notifyCustomer" BOOLEAN NOT NULL DEFAULT false,
    "messageTemplate" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "work_order_statuses_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "service_records" ADD COLUMN     "customStatusId" TEXT,
ADD COLUMN     "customStatusSince" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "work_order_statuses_organizationId_stage_sortOrder_idx" ON "work_order_statuses"("organizationId", "stage", "sortOrder");

-- CreateIndex
CREATE INDEX "service_records_customStatusId_idx" ON "service_records"("customStatusId");

-- AddForeignKey
ALTER TABLE "work_order_statuses" ADD CONSTRAINT "work_order_statuses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_customStatusId_fkey" FOREIGN KEY ("customStatusId") REFERENCES "work_order_statuses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
