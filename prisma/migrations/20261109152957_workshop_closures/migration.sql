-- CreateTable
CREATE TABLE "workshop_closures" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "repeatsYearly" BOOLEAN NOT NULL DEFAULT false,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workshop_closures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technician_absences" (
    "id" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "reason" TEXT NOT NULL DEFAULT 'holiday',
    "note" TEXT,
    "technicianId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "technician_absences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workshop_closures_organizationId_startDate_idx" ON "workshop_closures"("organizationId", "startDate");

-- CreateIndex
CREATE INDEX "technician_absences_organizationId_startDate_idx" ON "technician_absences"("organizationId", "startDate");

-- CreateIndex
CREATE INDEX "technician_absences_technicianId_idx" ON "technician_absences"("technicianId");

-- AddForeignKey
ALTER TABLE "workshop_closures" ADD CONSTRAINT "workshop_closures_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technician_absences" ADD CONSTRAINT "technician_absences_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "technicians"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technician_absences" ADD CONSTRAINT "technician_absences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
