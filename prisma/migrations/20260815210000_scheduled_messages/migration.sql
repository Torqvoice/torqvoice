-- Messages the workshop lines up to go out on a chosen day and time.
--
-- One row per scheduled send, through whichever channel fits the customer
-- (email, SMS, Telegram, or an in-app note for the workshop itself). A
-- frequency other than 'once' reschedules itself after each send, following
-- the same shape report_schedules already uses. Idempotent; safe to re-run.

CREATE TABLE IF NOT EXISTS "scheduled_messages" (
  "id"             TEXT NOT NULL,
  "channel"        TEXT NOT NULL,
  "subject"        TEXT,
  "body"           TEXT NOT NULL,
  "recipient"      TEXT,
  "status"         TEXT NOT NULL DEFAULT 'scheduled',
  "sendAt"         TIMESTAMP(3) NOT NULL,
  "frequency"      TEXT NOT NULL DEFAULT 'once',
  "endDate"        TIMESTAMP(3),
  "lastRunAt"      TIMESTAMP(3),
  "sentAt"         TIMESTAMP(3),
  "runCount"       INTEGER NOT NULL DEFAULT 0,
  "errorMessage"   TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  "organizationId" TEXT NOT NULL,
  "customerId"     TEXT,
  "vehicleId"      TEXT,
  "createdById"    TEXT NOT NULL,

  CONSTRAINT "scheduled_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "scheduled_messages_organizationId_sendAt_idx"
  ON "scheduled_messages"("organizationId", "sendAt");

-- The cron poller's query: everything still queued whose time has come.
CREATE INDEX IF NOT EXISTS "scheduled_messages_status_sendAt_idx"
  ON "scheduled_messages"("status", "sendAt");

DO $$
BEGIN
  ALTER TABLE "scheduled_messages"
    ADD CONSTRAINT "scheduled_messages_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- A deleted customer or vehicle leaves the message in place with its history
-- intact; the send then falls back to the typed recipient, or fails loudly.
DO $$
BEGIN
  ALTER TABLE "scheduled_messages"
    ADD CONSTRAINT "scheduled_messages_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "scheduled_messages"
    ADD CONSTRAINT "scheduled_messages_vehicleId_fkey"
    FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
