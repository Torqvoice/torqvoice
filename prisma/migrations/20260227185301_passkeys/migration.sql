/*
  Warnings:

  - A unique constraint covering the columns `[identifier]` on the table `verifications` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateTable
CREATE TABLE "passkeys" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "publicKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialID" TEXT NOT NULL,
    "counter" INTEGER NOT NULL,
    "deviceType" TEXT NOT NULL,
    "backedUp" BOOLEAN NOT NULL,
    "transports" TEXT,
    "aaguid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "passkeys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "passkeys_credentialID_key" ON "passkeys"("credentialID");

-- CreateIndex
CREATE INDEX "passkeys_userId_idx" ON "passkeys"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "verifications_identifier_key" ON "verifications"("identifier");

-- AddForeignKey
ALTER TABLE "passkeys" ADD CONSTRAINT "passkeys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
