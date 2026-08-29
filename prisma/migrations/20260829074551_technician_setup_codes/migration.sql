-- CreateTable
CREATE TABLE "technician_setup_codes" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "issuedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "technician_setup_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "technician_setup_codes_codeHash_key" ON "technician_setup_codes"("codeHash");

-- CreateIndex
CREATE INDEX "technician_setup_codes_organizationId_expiresAt_idx" ON "technician_setup_codes"("organizationId", "expiresAt");

-- CreateIndex
CREATE INDEX "technician_setup_codes_userId_idx" ON "technician_setup_codes"("userId");

-- AddForeignKey
ALTER TABLE "technician_setup_codes" ADD CONSTRAINT "technician_setup_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technician_setup_codes" ADD CONSTRAINT "technician_setup_codes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
