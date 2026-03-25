/*
  Warnings:

  - You are about to drop the column `images` on the `inventory_parts` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "inventory_parts" DROP COLUMN "images";

-- AlterTable
ALTER TABLE "service_parts" ADD COLUMN     "inventoryPartId" TEXT,
ADD COLUMN     "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 0;
