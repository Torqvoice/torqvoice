-- AlterTable
ALTER TABLE "inspections" ADD COLUMN     "markTypesSnapshot" JSONB;

-- AlterTable
ALTER TABLE "service_records" ADD COLUMN     "conditionMapOnInvoice" BOOLEAN;

-- CreateTable
CREATE TABLE "condition_mark_types" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shape" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "condition_mark_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "condition_mark_types_organizationId_idx" ON "condition_mark_types"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "condition_mark_types_organizationId_key_key" ON "condition_mark_types"("organizationId", "key");

-- AddForeignKey
ALTER TABLE "condition_mark_types" ADD CONSTRAINT "condition_mark_types_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
