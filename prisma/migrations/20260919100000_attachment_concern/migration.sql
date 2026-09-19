-- AlterTable
ALTER TABLE "service_attachments" ADD COLUMN     "concernId" TEXT;

-- CreateIndex
CREATE INDEX "service_attachments_concernId_idx" ON "service_attachments"("concernId");

-- AddForeignKey
ALTER TABLE "service_attachments" ADD CONSTRAINT "service_attachments_concernId_fkey" FOREIGN KEY ("concernId") REFERENCES "service_concerns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
