-- CreateTable
CREATE TABLE "vehicle_inspection_statuses" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "lastAt" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3),
    "found" BOOLEAN NOT NULL DEFAULT true,
    "registered" BOOLEAN,
    "lastError" TEXT,
    "extras" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_inspection_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_inspection_statuses_vehicleId_key" ON "vehicle_inspection_statuses"("vehicleId");

-- CreateIndex
CREATE INDEX "vehicle_inspection_statuses_organizationId_dueAt_idx" ON "vehicle_inspection_statuses"("organizationId", "dueAt");

-- CreateIndex
CREATE INDEX "vehicle_inspection_statuses_organizationId_checkedAt_idx" ON "vehicle_inspection_statuses"("organizationId", "checkedAt");

-- AddForeignKey
ALTER TABLE "vehicle_inspection_statuses" ADD CONSTRAINT "vehicle_inspection_statuses_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_inspection_statuses" ADD CONSTRAINT "vehicle_inspection_statuses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
