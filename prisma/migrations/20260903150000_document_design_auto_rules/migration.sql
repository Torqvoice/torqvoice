-- A design can volunteer itself for one kind of job: parts-only sales, which
-- have no vehicle, or vehicle jobs. Nullable, so every existing design
-- keeps printing only where it was chosen. One design per rule per workshop
-- and document; Postgres treats nulls as distinct, so designs without a rule
-- do not collide.

ALTER TABLE "document_designs" ADD COLUMN "autoRule" TEXT;

CREATE UNIQUE INDEX "document_designs_organizationId_documentType_autoRule_key"
  ON "document_designs"("organizationId", "documentType", "autoRule");
