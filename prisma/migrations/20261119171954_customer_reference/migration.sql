-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "poRequired" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "quotes" ADD COLUMN     "customerReference" TEXT;

-- AlterTable
ALTER TABLE "service_records" ADD COLUMN     "customerReference" TEXT;
