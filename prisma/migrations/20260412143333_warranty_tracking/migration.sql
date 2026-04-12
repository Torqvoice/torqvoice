-- AlterTable
ALTER TABLE "service_records" ADD COLUMN     "warrantyExpiresAt" TIMESTAMP(3),
ADD COLUMN     "warrantyMileage" INTEGER,
ADD COLUMN     "warrantyMonths" INTEGER,
ADD COLUMN     "warrantyNotes" TEXT;
