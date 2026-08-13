-- Per-reminder notification channels (in-app bell / email) and a marker for
-- when the due-reminder cron has fired. Idempotent and safe to re-run.

ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "notifyInApp" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "notifyEmail" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "notifiedAt" TIMESTAMP(3);

-- Reminders that are ALREADY overdue at deploy time are marked as notified so
-- the first cron run does not flood every workshop's bell with notifications
-- for reminders they have long been seeing as overdue in the UI. Only
-- reminders that become due after this deploy will notify.
UPDATE "reminders"
SET "notifiedAt" = NOW()
WHERE "dueDate" IS NOT NULL
  AND "dueDate" <= NOW()
  AND "notifiedAt" IS NULL;
