-- AlterTable
ALTER TABLE "quotes" ADD COLUMN     "lastViewedAt" TIMESTAMP(3),
ADD COLUMN     "sharedAt" TIMESTAMP(3),
ADD COLUMN     "viewCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "service_records" ADD COLUMN     "lastViewedAt" TIMESTAMP(3),
ADD COLUMN     "sharedAt" TIMESTAMP(3),
ADD COLUMN     "viewCount" INTEGER NOT NULL DEFAULT 0;
