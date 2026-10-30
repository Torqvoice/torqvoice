-- Backups Torqvoice runs for a workshop on the cloud instance (one restic
-- repository per workshop in a bucket of ours), beside the destinations a
-- workshop connects itself. A run row now says which of the two it belongs
-- to, and a platform run has no connection. Existing rows are destination
-- runs and keep their connection.

-- AlterTable
ALTER TABLE "backup_runs" ALTER COLUMN "connectionId" DROP NOT NULL;
ALTER TABLE "backup_runs" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'destination';
ALTER TABLE "backup_runs" ADD COLUMN "safetySnapshotId" TEXT;
ALTER TABLE "backup_runs" ADD COLUMN "requestedBy" TEXT;
ALTER TABLE "backup_runs" ADD COLUMN "reason" TEXT;

-- DropIndex
DROP INDEX IF EXISTS "backup_runs_organizationId_createdAt_idx";
DROP INDEX IF EXISTS "backup_runs_status_idx";

-- CreateIndex
CREATE INDEX "backup_runs_organizationId_kind_createdAt_idx" ON "backup_runs"("organizationId", "kind", "createdAt");
CREATE INDEX "backup_runs_status_createdAt_idx" ON "backup_runs"("status", "createdAt");

-- CreateTable
CREATE TABLE "platform_backups" (
    "organizationId" TEXT NOT NULL,
    "lastScheduledAt" TIMESTAMP(3),
    "lastGoodAt" TIMESTAMP(3),
    "lastPruneAt" TIMESTAMP(3),
    "lastCheckAt" TIMESTAMP(3),
    "retryAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "purgedAt" TIMESTAMP(3),
    "repositorySize" BIGINT,
    "snapshots" JSONB NOT NULL DEFAULT '[]',
    "lastFailureMailAt" TIMESTAMP(3),
    "lastOverdueAlertAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_backups_pkey" PRIMARY KEY ("organizationId")
);

-- CreateIndex
CREATE INDEX "platform_backups_pausedAt_idx" ON "platform_backups"("pausedAt");

-- AddForeignKey
ALTER TABLE "platform_backups" ADD CONSTRAINT "platform_backups_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
