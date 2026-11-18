/*
  Warnings:

  - You are about to drop the `workshop_fault_codes` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "workshop_fault_codes" DROP CONSTRAINT "workshop_fault_codes_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "workshop_fault_codes" DROP CONSTRAINT "workshop_fault_codes_updatedById_fkey";

-- DropTable
DROP TABLE "workshop_fault_codes";
