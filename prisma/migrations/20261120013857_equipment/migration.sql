/*
  Warnings:

  - A unique constraint covering the columns `[equipmentItemId,meterTypeId]` on the table `vehicle_meters` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "vehicle_meters" ADD COLUMN     "equipmentItemId" TEXT,
ALTER COLUMN "vehicleId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "equipment_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "equipment_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_items" (
    "id" TEXT NOT NULL,
    "make" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "manufactureYear" INTEGER,
    "manufactureDate" DATE,
    "installDate" DATE,
    "notes" TEXT,
    "ratedCapacity" TEXT,
    "nextExaminationDue" DATE,
    "lastExaminedAt" DATE,
    "certificateReference" TEXT,
    "reportFileUrl" TEXT,
    "reportFileName" TEXT,
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "typeId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "equipment_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_fittings" (
    "id" TEXT NOT NULL,
    "fittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,
    "itemId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "equipment_fittings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_record_equipment" (
    "serviceRecordId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_record_equipment_pkey" PRIMARY KEY ("serviceRecordId","itemId")
);

-- CreateTable
CREATE TABLE "quote_equipment" (
    "quoteId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_equipment_pkey" PRIMARY KEY ("quoteId","itemId")
);

-- CreateIndex
CREATE INDEX "equipment_types_organizationId_idx" ON "equipment_types"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_types_organizationId_name_key" ON "equipment_types"("organizationId", "name");

-- CreateIndex
CREATE INDEX "equipment_items_vehicleId_idx" ON "equipment_items"("vehicleId");

-- CreateIndex
CREATE INDEX "equipment_items_organizationId_serialNumber_idx" ON "equipment_items"("organizationId", "serialNumber");

-- CreateIndex
CREATE INDEX "equipment_fittings_itemId_idx" ON "equipment_fittings"("itemId");

-- CreateIndex
CREATE INDEX "equipment_fittings_vehicleId_idx" ON "equipment_fittings"("vehicleId");

-- CreateIndex
CREATE INDEX "equipment_fittings_organizationId_idx" ON "equipment_fittings"("organizationId");

-- CreateIndex
CREATE INDEX "service_record_equipment_itemId_idx" ON "service_record_equipment"("itemId");

-- CreateIndex
CREATE INDEX "service_record_equipment_organizationId_idx" ON "service_record_equipment"("organizationId");

-- CreateIndex
CREATE INDEX "quote_equipment_itemId_idx" ON "quote_equipment"("itemId");

-- CreateIndex
CREATE INDEX "quote_equipment_organizationId_idx" ON "quote_equipment"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_meters_equipmentItemId_meterTypeId_key" ON "vehicle_meters"("equipmentItemId", "meterTypeId");

-- AddForeignKey
ALTER TABLE "equipment_types" ADD CONSTRAINT "equipment_types_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_items" ADD CONSTRAINT "equipment_items_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "equipment_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_items" ADD CONSTRAINT "equipment_items_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_items" ADD CONSTRAINT "equipment_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_fittings" ADD CONSTRAINT "equipment_fittings_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "equipment_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_fittings" ADD CONSTRAINT "equipment_fittings_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_fittings" ADD CONSTRAINT "equipment_fittings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_record_equipment" ADD CONSTRAINT "service_record_equipment_serviceRecordId_fkey" FOREIGN KEY ("serviceRecordId") REFERENCES "service_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_record_equipment" ADD CONSTRAINT "service_record_equipment_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "equipment_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_record_equipment" ADD CONSTRAINT "service_record_equipment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_equipment" ADD CONSTRAINT "quote_equipment_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_equipment" ADD CONSTRAINT "quote_equipment_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "equipment_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_equipment" ADD CONSTRAINT "quote_equipment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_meters" ADD CONSTRAINT "vehicle_meters_equipmentItemId_fkey" FOREIGN KEY ("equipmentItemId") REFERENCES "equipment_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A meter is on a vehicle or on a piece of equipment, never both and never neither.
-- Every existing row has a vehicle and no item, so it holds from the start.
ALTER TABLE "vehicle_meters" ADD CONSTRAINT "vehicle_meters_one_owner"
  CHECK (("vehicleId" IS NULL) <> ("equipmentItemId" IS NULL));
