-- AlterTable
ALTER TABLE "inspection_items" ADD COLUMN     "allowNotApplicable" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "inspection_template_items" ADD COLUMN     "allowNotApplicable" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "inspections" ADD COLUMN     "designSnapshotId" TEXT;

-- AlterTable
ALTER TABLE "status_reports" ADD COLUMN     "inspectionId" TEXT,
ALTER COLUMN "serviceRecordId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "inspection_attachments" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'image',
    "description" TEXT,
    "includeInReport" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inspectionId" TEXT NOT NULL,

    CONSTRAINT "inspection_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inspection_attachments_inspectionId_idx" ON "inspection_attachments"("inspectionId");

-- CreateIndex
CREATE INDEX "inspections_designSnapshotId_idx" ON "inspections"("designSnapshotId");

-- CreateIndex
CREATE INDEX "status_reports_inspectionId_idx" ON "status_reports"("inspectionId");

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_designSnapshotId_fkey" FOREIGN KEY ("designSnapshotId") REFERENCES "document_design_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_attachments" ADD CONSTRAINT "inspection_attachments_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_reports" ADD CONSTRAINT "status_reports_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
