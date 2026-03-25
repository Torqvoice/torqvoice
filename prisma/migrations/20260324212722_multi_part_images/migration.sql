-- AlterTable
ALTER TABLE "inventory_parts" ADD COLUMN     "images" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "stored_images" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fileName" TEXT,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inventoryPartId" TEXT,

    CONSTRAINT "stored_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stored_images_inventoryPartId_idx" ON "stored_images"("inventoryPartId");

-- AddForeignKey
ALTER TABLE "stored_images" ADD CONSTRAINT "stored_images_inventoryPartId_fkey" FOREIGN KEY ("inventoryPartId") REFERENCES "inventory_parts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
