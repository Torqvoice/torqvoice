-- AlterTable
ALTER TABLE "labor_preset_items" ADD COLUMN     "pricingType" TEXT NOT NULL DEFAULT 'hourly';

-- AlterTable
ALTER TABLE "quote_labor" ADD COLUMN     "pricingType" TEXT NOT NULL DEFAULT 'hourly';

-- AlterTable
ALTER TABLE "recurring_labor" ADD COLUMN     "pricingType" TEXT NOT NULL DEFAULT 'hourly';

-- AlterTable
ALTER TABLE "service_labor" ADD COLUMN     "pricingType" TEXT NOT NULL DEFAULT 'hourly';
