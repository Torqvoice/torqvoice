-- CreateTable
CREATE TABLE "integration_connections" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "label" TEXT,
    "credentials" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "state" JSONB NOT NULL DEFAULT '{}',
    "externalAccountId" TEXT,
    "externalAccountName" TEXT,
    "scopes" TEXT,
    "oauthState" TEXT,
    "lastHealthAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_links" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "remoteId" TEXT NOT NULL,
    "remoteUrl" TEXT,
    "metadata" JSONB,
    "checksum" TEXT,
    "remoteUpdatedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_jobs" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB,
    "idempotencyKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_logs" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "jobId" TEXT,
    "level" TEXT NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_calendar_events" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "remoteId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "remoteUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "integration_connections_oauthState_key" ON "integration_connections"("oauthState");

-- CreateIndex
CREATE INDEX "integration_connections_organizationId_idx" ON "integration_connections"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "integration_connections_organizationId_connectorId_key" ON "integration_connections"("organizationId", "connectorId");

-- CreateIndex
CREATE INDEX "integration_links_connectionId_remoteId_idx" ON "integration_links"("connectionId", "remoteId");

-- CreateIndex
CREATE INDEX "integration_links_entityType_entityId_idx" ON "integration_links"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "integration_links_connectionId_entityType_entityId_key" ON "integration_links"("connectionId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "integration_jobs_status_runAfter_idx" ON "integration_jobs"("status", "runAfter");

-- CreateIndex
CREATE INDEX "integration_jobs_connectionId_createdAt_idx" ON "integration_jobs"("connectionId", "createdAt");

-- CreateIndex
CREATE INDEX "integration_jobs_organizationId_createdAt_idx" ON "integration_jobs"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "integration_jobs_connectionId_idempotencyKey_key" ON "integration_jobs"("connectionId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "integration_logs_connectionId_createdAt_idx" ON "integration_logs"("connectionId", "createdAt");

-- CreateIndex
CREATE INDEX "external_calendar_events_organizationId_startAt_idx" ON "external_calendar_events"("organizationId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "external_calendar_events_connectionId_remoteId_key" ON "external_calendar_events"("connectionId", "remoteId");

-- AddForeignKey
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_links" ADD CONSTRAINT "integration_links_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "integration_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_jobs" ADD CONSTRAINT "integration_jobs_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "integration_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_logs" ADD CONSTRAINT "integration_logs_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "integration_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_calendar_events" ADD CONSTRAINT "external_calendar_events_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "integration_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_calendar_events" ADD CONSTRAINT "external_calendar_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
