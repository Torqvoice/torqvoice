-- Customer email replies on the cloud instance: a per-workshop reply token
-- and the two tables that hold the mail. New columns and tables only; no
-- rows to move.

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN "replyMailToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "organizations_replyMailToken_key" ON "organizations"("replyMailToken");

-- CreateTable
CREATE TABLE "email_messages" (
    "id" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'message',
    "address" TEXT NOT NULL,
    "fromName" TEXT,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "messageId" TEXT,
    "inReplyTo" TEXT,
    "providerMessageId" TEXT,
    "spamVerdict" TEXT,
    "status" TEXT NOT NULL DEFAULT 'received',
    "errorMessage" TEXT,
    "relatedEntityType" TEXT,
    "relatedEntityId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT,

    CONSTRAINT "email_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_attachments" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "messageId" TEXT NOT NULL,

    CONSTRAINT "email_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_messages_providerMessageId_key" ON "email_messages"("providerMessageId");

-- CreateIndex
CREATE INDEX "email_messages_organizationId_customerId_createdAt_idx" ON "email_messages"("organizationId", "customerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "email_messages_organizationId_address_createdAt_idx" ON "email_messages"("organizationId", "address", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "email_messages_organizationId_createdAt_idx" ON "email_messages"("organizationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "email_messages_organizationId_readAt_idx" ON "email_messages"("organizationId", "readAt");

-- CreateIndex
CREATE INDEX "email_messages_organizationId_messageId_idx" ON "email_messages"("organizationId", "messageId");

-- CreateIndex
CREATE INDEX "email_attachments_messageId_idx" ON "email_attachments"("messageId");

-- AddForeignKey
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_attachments" ADD CONSTRAINT "email_attachments_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "email_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
