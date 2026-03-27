-- CreateTable
CREATE TABLE "status_reports" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "message" TEXT,
    "videoUrl" TEXT,
    "videoFileName" TEXT,
    "publicToken" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sentVia" TEXT,
    "sentAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "customerFeedback" TEXT,
    "feedbackAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "serviceRecordId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "technicianId" TEXT,

    CONSTRAINT "status_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "status_reports_publicToken_key" ON "status_reports"("publicToken");

-- CreateIndex
CREATE INDEX "status_reports_serviceRecordId_idx" ON "status_reports"("serviceRecordId");

-- CreateIndex
CREATE INDEX "status_reports_organizationId_idx" ON "status_reports"("organizationId");

-- CreateIndex
CREATE INDEX "status_reports_publicToken_idx" ON "status_reports"("publicToken");

-- CreateIndex
CREATE INDEX "status_reports_expiresAt_idx" ON "status_reports"("expiresAt");

-- AddForeignKey
ALTER TABLE "status_reports" ADD CONSTRAINT "status_reports_serviceRecordId_fkey" FOREIGN KEY ("serviceRecordId") REFERENCES "service_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_reports" ADD CONSTRAINT "status_reports_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_reports" ADD CONSTRAINT "status_reports_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "technicians"("id") ON DELETE SET NULL ON UPDATE CASCADE;
