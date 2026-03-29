-- CreateTable
CREATE TABLE "report_schedules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Scheduled Report',
    "frequency" TEXT NOT NULL,
    "dateRange" TEXT NOT NULL DEFAULT 'last30d',
    "sections" TEXT NOT NULL,
    "recipients" TEXT NOT NULL,
    "nextRunDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "report_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "report_schedules_organizationId_idx" ON "report_schedules"("organizationId");

-- CreateIndex
CREATE INDEX "report_schedules_nextRunDate_isActive_idx" ON "report_schedules"("nextRunDate", "isActive");

-- AddForeignKey
ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
