-- Lines say whether the document's tax is charged on them. Every existing
-- line is taxable, which is what every document so far was totalled as, so
-- nothing already written changes. The columns are added with a constant
-- default, which Postgres stores without rewriting the tables.

-- AlterTable
ALTER TABLE "service_parts" ADD COLUMN     "taxable" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "service_labor" ADD COLUMN     "taxable" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "quote_parts" ADD COLUMN     "taxable" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "quote_labor" ADD COLUMN     "taxable" BOOLEAN NOT NULL DEFAULT true;

-- The sum of a document's taxable lines. Null means all of them, so the
-- existing rows need no backfill.

-- AlterTable
ALTER TABLE "service_records" ADD COLUMN     "taxableSubtotal" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "quotes" ADD COLUMN     "taxableSubtotal" DOUBLE PRECISION;
