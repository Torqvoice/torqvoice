-- CreateTable
CREATE TABLE "customer_reminder_logs" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "dueKey" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizationId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,

    CONSTRAINT "customer_reminder_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_reminder_logs_organizationId_sentAt_idx" ON "customer_reminder_logs"("organizationId", "sentAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "customer_reminder_logs_vehicleId_type_dueKey_key" ON "customer_reminder_logs"("vehicleId", "type", "dueKey");

-- AddForeignKey
ALTER TABLE "customer_reminder_logs" ADD CONSTRAINT "customer_reminder_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_reminder_logs" ADD CONSTRAINT "customer_reminder_logs_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_reminder_logs" ADD CONSTRAINT "customer_reminder_logs_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
