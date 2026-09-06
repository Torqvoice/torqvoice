-- Read tracking for inbound messages. A null "readAt" on an inbound row is an
-- unread message: the sidebar counts those and the inbox marks a thread's
-- rows read when it is opened. Outbound rows never get a value.
--
-- Everything already in the tables is stamped as read, so the count starts
-- from zero rather than from every message the workshop has ever received.
-- One transaction: Prisma does not wrap a migration in one, and a half-run
-- here would leave some channels counting history and others not.

BEGIN;

ALTER TABLE "sms_messages" ADD COLUMN "readAt" TIMESTAMP(3);
ALTER TABLE "telegram_messages" ADD COLUMN "readAt" TIMESTAMP(3);
ALTER TABLE "whatsapp_messages" ADD COLUMN "readAt" TIMESTAMP(3);

UPDATE "sms_messages" SET "readAt" = "createdAt" WHERE "direction" = 'inbound';
UPDATE "telegram_messages" SET "readAt" = "createdAt" WHERE "direction" = 'inbound';
UPDATE "whatsapp_messages" SET "readAt" = "createdAt" WHERE "direction" = 'inbound';

CREATE INDEX "sms_messages_organizationId_readAt_idx" ON "sms_messages"("organizationId", "readAt");
CREATE INDEX "telegram_messages_organizationId_readAt_idx" ON "telegram_messages"("organizationId", "readAt");
CREATE INDEX "whatsapp_messages_organizationId_readAt_idx" ON "whatsapp_messages"("organizationId", "readAt");

COMMIT;
