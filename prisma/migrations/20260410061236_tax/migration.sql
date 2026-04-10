-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "taxExempt" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "taxId" TEXT;

-- AlterTable
ALTER TABLE "quotes" ADD COLUMN     "taxInclusive" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "recurring_invoices" ADD COLUMN     "taxInclusive" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "service_records" ADD COLUMN     "taxInclusive" BOOLEAN NOT NULL DEFAULT false;
