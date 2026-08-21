-- CreateTable
CREATE TABLE "whatsapp_messages" (
    "id" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "fromNumber" TEXT NOT NULL,
    "toNumber" TEXT NOT NULL,
    "body" TEXT,
    "mediaUrl" TEXT,
    "mediaType" TEXT,
    "mediaFilename" TEXT,
    "templateName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "providerMessageId" TEXT,
    "errorMessage" TEXT,
    "relatedEntityType" TEXT,
    "relatedEntityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT,

    CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_messages_organizationId_customerId_createdAt_idx" ON "whatsapp_messages"("organizationId", "customerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "whatsapp_messages_organizationId_createdAt_idx" ON "whatsapp_messages"("organizationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "whatsapp_messages_providerMessageId_idx" ON "whatsapp_messages"("providerMessageId");

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
