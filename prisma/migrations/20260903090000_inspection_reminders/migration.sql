-- AlterTable
ALTER TABLE "customers" ADD COLUMN "reminderOptOut" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "service_records" ADD COLUMN "bookingSource" TEXT;

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN "soldReportedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "inspection_reminder_campaigns" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "idempotencyToken" TEXT NOT NULL,
    "windowDays" INTEGER NOT NULL,
    "channel" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspection_reminder_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_reminder_sends" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "channel" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "scheduledMessageId" TEXT,
    "bookedAt" TIMESTAMP(3),
    "bookedServiceRecordId" TEXT,
    "bookedServiceRequestId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspection_reminder_sends_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inspection_reminder_campaigns_idempotencyToken_key" ON "inspection_reminder_campaigns"("idempotencyToken");

-- CreateIndex
CREATE INDEX "inspection_reminder_campaigns_organizationId_createdAt_idx" ON "inspection_reminder_campaigns"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "inspection_reminder_sends_token_key" ON "inspection_reminder_sends"("token");

-- CreateIndex
CREATE UNIQUE INDEX "inspection_reminder_sends_scheduledMessageId_key" ON "inspection_reminder_sends"("scheduledMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "inspection_reminder_sends_vehicleId_dueAt_key" ON "inspection_reminder_sends"("vehicleId", "dueAt");

-- CreateIndex
CREATE INDEX "inspection_reminder_sends_organizationId_createdAt_idx" ON "inspection_reminder_sends"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "inspection_reminder_sends_campaignId_idx" ON "inspection_reminder_sends"("campaignId");

-- AddForeignKey
ALTER TABLE "inspection_reminder_campaigns" ADD CONSTRAINT "inspection_reminder_campaigns_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_reminder_sends" ADD CONSTRAINT "inspection_reminder_sends_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "inspection_reminder_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_reminder_sends" ADD CONSTRAINT "inspection_reminder_sends_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_reminder_sends" ADD CONSTRAINT "inspection_reminder_sends_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_reminder_sends" ADD CONSTRAINT "inspection_reminder_sends_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_reminder_sends" ADD CONSTRAINT "inspection_reminder_sends_scheduledMessageId_fkey" FOREIGN KEY ("scheduledMessageId") REFERENCES "scheduled_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
