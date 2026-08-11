-- Human-facing editable customer number, unique per organization
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "customerNumber" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "customers_organizationId_customerNumber_key"
  ON "customers"("organizationId", "customerNumber");
