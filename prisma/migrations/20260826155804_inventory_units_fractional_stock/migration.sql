-- AlterTable
ALTER TABLE "inventory_parts" ADD COLUMN     "unit" TEXT,
ALTER COLUMN "quantity" SET DEFAULT 0,
ALTER COLUMN "quantity" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "minQuantity" SET DEFAULT 0,
ALTER COLUMN "minQuantity" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "labor_preset_parts" ADD COLUMN     "unit" TEXT;

-- AlterTable
ALTER TABLE "quote_parts" ADD COLUMN     "unit" TEXT;

-- AlterTable
ALTER TABLE "recurring_parts" ALTER COLUMN "quantity" SET DEFAULT 1,
ALTER COLUMN "quantity" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "service_parts" ADD COLUMN     "unit" TEXT;

-- AlterTable
ALTER TABLE "stock_movements" ALTER COLUMN "delta" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "quantityAfter" SET DATA TYPE DOUBLE PRECISION;
