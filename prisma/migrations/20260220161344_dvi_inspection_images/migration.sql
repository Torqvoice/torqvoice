/*
  Warnings:

  - You are about to drop the column `imageUrl` on the `inspection_items` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "inspection_items" DROP COLUMN "imageUrl",
ADD COLUMN     "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];
