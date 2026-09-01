-- CreateTable
CREATE TABLE "time_entries" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "note" TEXT,
    "source" TEXT NOT NULL DEFAULT 'app',
    "editedAt" TIMESTAMP(3),
    "editedByUserId" TEXT,
    "technicianId" TEXT NOT NULL,
    "serviceRecordId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "time_entries_technicianId_startedAt_idx" ON "time_entries"("technicianId", "startedAt");

-- CreateIndex
CREATE INDEX "time_entries_serviceRecordId_idx" ON "time_entries"("serviceRecordId");

-- CreateIndex
CREATE INDEX "time_entries_organizationId_startedAt_idx" ON "time_entries"("organizationId", "startedAt");

-- CreateIndex
CREATE INDEX "time_entries_technicianId_endedAt_idx" ON "time_entries"("technicianId", "endedAt");

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "technicians"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_serviceRecordId_fkey" FOREIGN KEY ("serviceRecordId") REFERENCES "service_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
