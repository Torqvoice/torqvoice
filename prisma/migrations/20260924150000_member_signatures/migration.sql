-- AlterTable
ALTER TABLE "inspections" ADD COLUMN     "signatureSnapshotId" TEXT;

-- AlterTable
ALTER TABLE "service_records" ADD COLUMN     "issuedSignatureSnapshotId" TEXT;

-- CreateTable
CREATE TABLE "member_signatures" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_signatures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "member_signatures_memberId_key" ON "member_signatures"("memberId");

-- CreateIndex
CREATE INDEX "inspections_signatureSnapshotId_idx" ON "inspections"("signatureSnapshotId");

-- CreateIndex
CREATE INDEX "service_records_issuedSignatureSnapshotId_idx" ON "service_records"("issuedSignatureSnapshotId");

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_signatureSnapshotId_fkey" FOREIGN KEY ("signatureSnapshotId") REFERENCES "document_asset_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_signatures" ADD CONSTRAINT "member_signatures_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "organization_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_issuedSignatureSnapshotId_fkey" FOREIGN KEY ("issuedSignatureSnapshotId") REFERENCES "document_asset_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

