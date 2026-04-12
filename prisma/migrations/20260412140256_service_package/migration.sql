-- CreateTable
CREATE TABLE "labor_preset_parts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "partNumber" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "inventoryPartId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "presetId" TEXT NOT NULL,

    CONSTRAINT "labor_preset_parts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "labor_preset_parts_presetId_idx" ON "labor_preset_parts"("presetId");

-- AddForeignKey
ALTER TABLE "labor_preset_parts" ADD CONSTRAINT "labor_preset_parts_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "labor_presets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
