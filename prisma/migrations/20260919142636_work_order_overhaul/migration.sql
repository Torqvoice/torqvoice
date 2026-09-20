-- AlterTable
ALTER TABLE "service_attachments" ADD COLUMN     "concernId" TEXT;

-- AlterTable
ALTER TABLE "service_concerns" ADD COLUMN     "cause" TEXT,
ADD COLUMN     "confirmation" TEXT,
ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "confirmedById" TEXT,
ADD COLUMN     "correction" TEXT;

-- AlterTable
ALTER TABLE "service_records" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "promisedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "technicians" ADD COLUMN     "skills" TEXT;

-- CreateIndex
CREATE INDEX "service_attachments_concernId_idx" ON "service_attachments"("concernId");

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_concerns" ADD CONSTRAINT "service_concerns_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_attachments" ADD CONSTRAINT "service_attachments_concernId_fkey" FOREIGN KEY ("concernId") REFERENCES "service_concerns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
