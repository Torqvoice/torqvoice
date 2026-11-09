-- AlterTable
ALTER TABLE "inventory_parts" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
