-- CreateTable
CREATE TABLE "technicians" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#3b82f6',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "memberId" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "technicians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_assignments" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "technicianId" TEXT NOT NULL,
    "serviceRecordId" TEXT,
    "inspectionId" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "board_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "technicians_organizationId_idx" ON "technicians"("organizationId");

-- CreateIndex
CREATE INDEX "board_assignments_organizationId_date_idx" ON "board_assignments"("organizationId", "date");

-- CreateIndex
CREATE INDEX "board_assignments_technicianId_date_idx" ON "board_assignments"("technicianId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "board_assignments_serviceRecordId_date_key" ON "board_assignments"("serviceRecordId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "board_assignments_inspectionId_date_key" ON "board_assignments"("inspectionId", "date");

-- AddForeignKey
ALTER TABLE "technicians" ADD CONSTRAINT "technicians_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_assignments" ADD CONSTRAINT "board_assignments_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "technicians"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_assignments" ADD CONSTRAINT "board_assignments_serviceRecordId_fkey" FOREIGN KEY ("serviceRecordId") REFERENCES "service_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_assignments" ADD CONSTRAINT "board_assignments_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
