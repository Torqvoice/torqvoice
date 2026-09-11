-- AlterTable
ALTER TABLE "quotes" ADD COLUMN     "taxComponents" JSONB;

-- AlterTable
ALTER TABLE "recurring_invoices" ADD COLUMN     "taxComponents" JSONB;

-- AlterTable
ALTER TABLE "service_records" ADD COLUMN     "taxComponents" JSONB;
