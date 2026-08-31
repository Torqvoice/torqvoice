-- Edit lock for invoices and quotes.
--
-- Additive and nullable throughout. Locking is off until an org turns it on,
-- so every existing document stays exactly as editable as it is today and
-- nothing needs backfilling.
--
-- sentAt is deliberately separate from sharedAt: sharedAt tracks the public
-- link and is cleared when the link is revoked, whereas having sent an invoice
-- is not undone by withdrawing the link. Existing invoices leave it null, so
-- an org that locks on "sent" locks only what it sends from now on. That is
-- the safe direction to be wrong in: nothing already issued is frozen out of
-- reach on the day the setting is switched on.

ALTER TABLE "service_records" ADD COLUMN "sentAt" TIMESTAMP(3);
ALTER TABLE "service_records" ADD COLUMN "editUnlockedAt" TIMESTAMP(3);
ALTER TABLE "service_records" ADD COLUMN "editUnlockedById" TEXT;

-- Quotes get the same sentAt so an admin unlock is spent when the quote is
-- issued again, exactly as it is for invoices. Without it an unlocked quote
-- would stay editable forever, because its status does not change when a
-- corrected copy is re-sent and re-accepted.
ALTER TABLE "quotes" ADD COLUMN "sentAt" TIMESTAMP(3);
ALTER TABLE "quotes" ADD COLUMN "editUnlockedAt" TIMESTAMP(3);
ALTER TABLE "quotes" ADD COLUMN "editUnlockedById" TEXT;
