-- AlterTable
ALTER TABLE "stored_images" ADD COLUMN     "tireMeasurementId" TEXT;

-- CreateTable
CREATE TABLE "tire_warehouses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "notes" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tire_warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tire_locations" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "zone" TEXT,
    "rack" TEXT,
    "shelf" TEXT,
    "position" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 8,
    "notes" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "warehouseId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tire_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tire_sets" (
    "id" TEXT NOT NULL,
    "reference" TEXT,
    "season" TEXT NOT NULL DEFAULT 'summer',
    "studded" BOOLEAN NOT NULL DEFAULT false,
    "brand" TEXT,
    "model" TEXT,
    "size" TEXT,
    "dotCode" TEXT,
    "loadSpeedIndex" TEXT,
    "withRims" BOOLEAN NOT NULL DEFAULT false,
    "rimType" TEXT,
    "hasTpms" BOOLEAN NOT NULL DEFAULT false,
    "quantity" INTEGER NOT NULL DEFAULT 4,
    "status" TEXT NOT NULL DEFAULT 'stored',
    "notes" TEXT,
    "locationId" TEXT,
    "vehicleId" TEXT,
    "customerId" TEXT,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "checkedInAt" TIMESTAMP(3),
    "checkedOutAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tire_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tire_measurements" (
    "id" TEXT NOT NULL,
    "position" TEXT NOT NULL DEFAULT 'unspecified',
    "treadDepthMm" DOUBLE PRECISION,
    "pressureBar" DOUBLE PRECISION,
    "condition" TEXT NOT NULL DEFAULT 'good',
    "damage" TEXT,
    "notes" TEXT,
    "tireSetId" TEXT NOT NULL,
    "movementId" TEXT,
    "measuredById" TEXT,
    "measuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tire_measurements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tire_movements" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromCode" TEXT,
    "toCode" TEXT,
    "fromLocationId" TEXT,
    "toLocationId" TEXT,
    "note" TEXT,
    "tireSetId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "performedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tire_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tire_warehouses_organizationId_idx" ON "tire_warehouses"("organizationId");

-- CreateIndex
CREATE INDEX "tire_locations_organizationId_idx" ON "tire_locations"("organizationId");

-- CreateIndex
CREATE INDEX "tire_locations_warehouseId_isArchived_idx" ON "tire_locations"("warehouseId", "isArchived");

-- CreateIndex
CREATE UNIQUE INDEX "tire_locations_warehouseId_code_key" ON "tire_locations"("warehouseId", "code");

-- CreateIndex
CREATE INDEX "tire_sets_organizationId_status_idx" ON "tire_sets"("organizationId", "status");

-- CreateIndex
CREATE INDEX "tire_sets_locationId_idx" ON "tire_sets"("locationId");

-- CreateIndex
CREATE INDEX "tire_sets_vehicleId_idx" ON "tire_sets"("vehicleId");

-- CreateIndex
CREATE INDEX "tire_sets_customerId_idx" ON "tire_sets"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "tire_sets_organizationId_reference_key" ON "tire_sets"("organizationId", "reference");

-- CreateIndex
CREATE INDEX "tire_measurements_tireSetId_measuredAt_idx" ON "tire_measurements"("tireSetId", "measuredAt" DESC);

-- CreateIndex
CREATE INDEX "tire_measurements_movementId_idx" ON "tire_measurements"("movementId");

-- CreateIndex
CREATE INDEX "tire_movements_tireSetId_createdAt_idx" ON "tire_movements"("tireSetId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "tire_movements_organizationId_createdAt_idx" ON "tire_movements"("organizationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "stored_images_tireMeasurementId_idx" ON "stored_images"("tireMeasurementId");

-- AddForeignKey
ALTER TABLE "stored_images" ADD CONSTRAINT "stored_images_tireMeasurementId_fkey" FOREIGN KEY ("tireMeasurementId") REFERENCES "tire_measurements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_warehouses" ADD CONSTRAINT "tire_warehouses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_warehouses" ADD CONSTRAINT "tire_warehouses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_locations" ADD CONSTRAINT "tire_locations_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "tire_warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_locations" ADD CONSTRAINT "tire_locations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_sets" ADD CONSTRAINT "tire_sets_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "tire_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_sets" ADD CONSTRAINT "tire_sets_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_sets" ADD CONSTRAINT "tire_sets_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_sets" ADD CONSTRAINT "tire_sets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_sets" ADD CONSTRAINT "tire_sets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_measurements" ADD CONSTRAINT "tire_measurements_tireSetId_fkey" FOREIGN KEY ("tireSetId") REFERENCES "tire_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_measurements" ADD CONSTRAINT "tire_measurements_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "tire_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_measurements" ADD CONSTRAINT "tire_measurements_measuredById_fkey" FOREIGN KEY ("measuredById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_movements" ADD CONSTRAINT "tire_movements_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "tire_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_movements" ADD CONSTRAINT "tire_movements_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "tire_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_movements" ADD CONSTRAINT "tire_movements_tireSetId_fkey" FOREIGN KEY ("tireSetId") REFERENCES "tire_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_movements" ADD CONSTRAINT "tire_movements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_movements" ADD CONSTRAINT "tire_movements_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
