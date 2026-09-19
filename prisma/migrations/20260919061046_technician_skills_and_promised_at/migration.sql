-- AlterTable
ALTER TABLE "service_records" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "promisedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "technicians" ADD COLUMN     "skills" TEXT;

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
