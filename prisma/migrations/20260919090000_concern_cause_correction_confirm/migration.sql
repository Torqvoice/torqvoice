-- AlterTable
ALTER TABLE "service_concerns" ADD COLUMN     "cause" TEXT,
ADD COLUMN     "correction" TEXT,
ADD COLUMN     "confirmation" TEXT,
ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "confirmedById" TEXT;

-- AddForeignKey
ALTER TABLE "service_concerns" ADD CONSTRAINT "service_concerns_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
