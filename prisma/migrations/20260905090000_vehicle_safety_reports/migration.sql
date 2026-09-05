-- A cache of what a safety authority (NHTSA first) knows about one model
-- year: recalls, owner complaints and crash ratings. Keyed by model, not by
-- workshop, since the data is public and the same for every 2003 Accord.

CREATE TABLE "vehicle_safety_reports" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "found" BOOLEAN NOT NULL DEFAULT true,
    "data" JSONB NOT NULL,
    "recallCount" INTEGER NOT NULL DEFAULT 0,
    "complaintCount" INTEGER NOT NULL DEFAULT 0,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_safety_reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vehicle_safety_reports_source_make_model_year_key" ON "vehicle_safety_reports"("source", "make", "model", "year");
CREATE INDEX "vehicle_safety_reports_fetchedAt_idx" ON "vehicle_safety_reports"("fetchedAt");
