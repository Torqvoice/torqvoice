-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "telegramChatId" TEXT;

-- CreateTable
CREATE TABLE "telegram_messages" (
    "id" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "telegramMessageId" TEXT,
    "errorMessage" TEXT,
    "relatedEntityType" TEXT,
    "relatedEntityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT,

    CONSTRAINT "telegram_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "telegram_messages_organizationId_customerId_createdAt_idx" ON "telegram_messages"("organizationId", "customerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "telegram_messages_organizationId_chatId_createdAt_idx" ON "telegram_messages"("organizationId", "chatId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "telegram_messages" ADD CONSTRAINT "telegram_messages_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_messages" ADD CONSTRAINT "telegram_messages_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
