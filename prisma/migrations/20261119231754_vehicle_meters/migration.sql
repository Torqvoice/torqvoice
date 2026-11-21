-- CreateTable
CREATE TABLE "meter_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "meter_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_meters" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "vehicleId" TEXT NOT NULL,
    "meterTypeId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "vehicle_meters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meter_readings" (
    "id" TEXT NOT NULL,
    "value" DECIMAL(14,2) NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL,
    "replacedFrom" DECIMAL(14,2),
    "wrongAt" TIMESTAMP(3),
    "wrongById" TEXT,
    "createdById" TEXT,
    "source" TEXT NOT NULL DEFAULT 'web',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "vehicleMeterId" TEXT NOT NULL,
    "serviceRecordId" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "meter_readings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meter_types_organizationId_idx" ON "meter_types"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "meter_types_organizationId_name_key" ON "meter_types"("organizationId", "name");

-- CreateIndex
CREATE INDEX "vehicle_meters_organizationId_idx" ON "vehicle_meters"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_meters_vehicleId_meterTypeId_key" ON "vehicle_meters"("vehicleId", "meterTypeId");

-- CreateIndex
CREATE INDEX "meter_readings_vehicleMeterId_readAt_idx" ON "meter_readings"("vehicleMeterId", "readAt");

-- CreateIndex
CREATE INDEX "meter_readings_serviceRecordId_idx" ON "meter_readings"("serviceRecordId");

-- CreateIndex
CREATE INDEX "meter_readings_organizationId_idx" ON "meter_readings"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "meter_readings_vehicleMeterId_serviceRecordId_key" ON "meter_readings"("vehicleMeterId", "serviceRecordId");

-- AddForeignKey
ALTER TABLE "meter_types" ADD CONSTRAINT "meter_types_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_meters" ADD CONSTRAINT "vehicle_meters_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_meters" ADD CONSTRAINT "vehicle_meters_meterTypeId_fkey" FOREIGN KEY ("meterTypeId") REFERENCES "meter_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_meters" ADD CONSTRAINT "vehicle_meters_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meter_readings" ADD CONSTRAINT "meter_readings_vehicleMeterId_fkey" FOREIGN KEY ("vehicleMeterId") REFERENCES "vehicle_meters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meter_readings" ADD CONSTRAINT "meter_readings_serviceRecordId_fkey" FOREIGN KEY ("serviceRecordId") REFERENCES "service_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meter_readings" ADD CONSTRAINT "meter_readings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
