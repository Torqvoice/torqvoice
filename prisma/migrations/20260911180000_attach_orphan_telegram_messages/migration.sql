-- Telegram messages that arrived from a chat before it was linked to a
-- customer were stored with no customer, which made them invisible in the
-- inbox and impossible to mark read, while the sidebar still counted them.
-- The webhook attaches such messages the moment the chat links; this does
-- the same for the rows already there, by the chat id the customer carries.
BEGIN;

UPDATE "telegram_messages" m
   SET "customerId" = c."id"
  FROM "customers" c
 WHERE m."customerId" IS NULL
   AND c."telegramChatId" = m."chatId"
   AND c."organizationId" = m."organizationId";

COMMIT;
