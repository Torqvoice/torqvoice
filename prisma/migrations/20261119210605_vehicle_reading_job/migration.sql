/*
  Warnings:

  - A unique constraint covering the columns `[readingJobId]` on the table `vehicles` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "readingBeforeJob" INTEGER,
ADD COLUMN     "readingJobId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_readingJobId_key" ON "vehicles"("readingJobId");

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_readingJobId_fkey" FOREIGN KEY ("readingJobId") REFERENCES "service_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
