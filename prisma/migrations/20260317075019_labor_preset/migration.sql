-- CreateTable
CREATE TABLE "labor_presets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "labor_presets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "labor_preset_items" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "presetId" TEXT NOT NULL,

    CONSTRAINT "labor_preset_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "labor_presets_organizationId_idx" ON "labor_presets"("organizationId");

-- CreateIndex
CREATE INDEX "labor_preset_items_presetId_idx" ON "labor_preset_items"("presetId");

-- AddForeignKey
ALTER TABLE "labor_presets" ADD CONSTRAINT "labor_presets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labor_preset_items" ADD CONSTRAINT "labor_preset_items_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "labor_presets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
