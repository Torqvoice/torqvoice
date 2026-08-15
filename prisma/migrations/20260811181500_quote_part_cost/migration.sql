-- Internal cost and markup on quote parts, mirroring service parts
ALTER TABLE "quote_parts" ADD COLUMN IF NOT EXISTS "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "quote_parts" ADD COLUMN IF NOT EXISTS "markupPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;
