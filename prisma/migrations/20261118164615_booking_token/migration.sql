/*
  Warnings:

  - A unique constraint covering the columns `[organizationId,bookingToken]` on the table `appointments` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[organizationId,bookingToken]` on the table `service_records` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "bookingToken" TEXT;

-- AlterTable
ALTER TABLE "service_records" ADD COLUMN     "bookingToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "appointments_organizationId_bookingToken_key" ON "appointments"("organizationId", "bookingToken");

-- CreateIndex
CREATE UNIQUE INDEX "service_records_organizationId_bookingToken_key" ON "service_records"("organizationId", "bookingToken");
