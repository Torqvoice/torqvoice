-- The pulled busy event's page in the vendor's own calendar, so the workshop
-- calendar can open it there.
ALTER TABLE "external_calendar_events" ADD COLUMN "remoteUrl" TEXT;
