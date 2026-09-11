-- A payment a vendor reports is booked once per invoice.
--
-- The customer's browser coming back to the invoice and the vendor's own
-- notification both report a payment, usually in the same second, and every
-- path that records one looked for it first and wrote second. Two reports
-- arriving together could both find nothing and both write, so the invoice
-- showed twice what the customer paid. The unique key below makes the write
-- itself the check.
--
-- The key includes the invoice, not only the vendor's id, because one payment
-- can legitimately be split across several invoices: a QuickBooks payment with
-- a line per invoice, or an imported payment applied to more than one. Rows
-- with no provider or no external id, which is every payment typed in by hand,
-- are not held to it, since Postgres counts nulls as distinct.
--
-- One transaction: Prisma does not wrap a migration in one, and the index
-- cannot be created while duplicates remain.

BEGIN;

-- Duplicates the race has already written: the same vendor payment on the
-- same invoice more than once. They are the same money reported twice, so the
-- earliest row is kept and the later copies are removed. Nothing references a
-- payment row, so nothing else changes with them.
DELETE FROM "payments" AS p
USING (
  SELECT "id"
  FROM (
    SELECT
      "id",
      row_number() OVER (
        PARTITION BY "serviceRecordId", "provider", "externalId"
        ORDER BY "createdAt", "id"
      ) AS "copy"
    FROM "payments"
    WHERE "provider" IS NOT NULL AND "externalId" IS NOT NULL
  ) AS ranked
  WHERE ranked."copy" > 1
) AS duplicate
WHERE p."id" = duplicate."id";

-- CreateIndex
CREATE UNIQUE INDEX "payments_serviceRecordId_provider_externalId_key" ON "payments"("serviceRecordId", "provider", "externalId");

COMMIT;
