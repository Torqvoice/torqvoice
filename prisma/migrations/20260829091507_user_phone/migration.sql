/*
  Warnings:

  - You are about to drop the column `phone` on the `technicians` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "technicians_organizationId_phone_idx";

-- AlterTable
ALTER TABLE "technicians" DROP COLUMN "phone";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "phone" TEXT;
