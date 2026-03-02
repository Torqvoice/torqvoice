-- AlterTable
ALTER TABLE "quote_labor" ADD COLUMN     "excluded" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "quote_parts" ADD COLUMN     "excluded" BOOLEAN NOT NULL DEFAULT false;
