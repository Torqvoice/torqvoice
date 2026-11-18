-- Labor times and fluid specs from a repair data source (Open Labor
-- Project), kept for as long as the key that fetched them is on a paid
-- plan, so a vehicle looked up once is not paid for again. Rows fetched with
-- a workshop's own key belong to its connection and go when it disconnects;
-- rows fetched with a key the server holds have no connection and owner
-- "platform". New table only; nothing existing changes.

-- CreateTable
CREATE TABLE "repair_data_cache" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "connectionId" TEXT,
    "kind" TEXT NOT NULL,
    "lookupKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repair_data_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "repair_data_cache_source_owner_kind_lookupKey_key" ON "repair_data_cache"("source", "owner", "kind", "lookupKey");

-- CreateIndex
CREATE INDEX "repair_data_cache_connectionId_idx" ON "repair_data_cache"("connectionId");

-- AddForeignKey
ALTER TABLE "repair_data_cache" ADD CONSTRAINT "repair_data_cache_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "integration_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
