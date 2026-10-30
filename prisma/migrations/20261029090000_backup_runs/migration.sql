-- One row per backup run of a workshop to a destination it connected under
-- Settings -> Integrations: scheduled or manual, the restic snapshot it made
-- and how it ended. A new table with no data to move.

-- CreateTable
CREATE TABLE "backup_runs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "snapshotId" TEXT,
    "filesNew" INTEGER,
    "bytesAdded" BIGINT,
    "totalBytes" BIGINT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backup_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "backup_runs_connectionId_createdAt_idx" ON "backup_runs"("connectionId", "createdAt");

-- CreateIndex
CREATE INDEX "backup_runs_organizationId_createdAt_idx" ON "backup_runs"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "backup_runs_status_idx" ON "backup_runs"("status");

-- AddForeignKey
ALTER TABLE "backup_runs" ADD CONSTRAINT "backup_runs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backup_runs" ADD CONSTRAINT "backup_runs_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "integration_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

