-- AlterTable
ALTER TABLE "service_records" ADD COLUMN     "issuedVehiclePhotoSnapshotId" TEXT;

-- CreateIndex
CREATE INDEX "service_records_issuedVehiclePhotoSnapshotId_idx" ON "service_records"("issuedVehiclePhotoSnapshotId");

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_issuedVehiclePhotoSnapshotId_fkey" FOREIGN KEY ("issuedVehiclePhotoSnapshotId") REFERENCES "document_asset_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
