-- AlterTable
ALTER TABLE "technicians" ADD COLUMN     "phone" TEXT;

-- CreateTable
CREATE TABLE "technician_login_codes" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "technicianId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "technician_login_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "technician_login_codes_organizationId_technicianId_idx" ON "technician_login_codes"("organizationId", "technicianId");

-- CreateIndex
CREATE INDEX "technician_login_codes_expiresAt_idx" ON "technician_login_codes"("expiresAt");

-- CreateIndex
CREATE INDEX "technicians_organizationId_phone_idx" ON "technicians"("organizationId", "phone");

-- AddForeignKey
ALTER TABLE "technician_login_codes" ADD CONSTRAINT "technician_login_codes_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "technicians"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technician_login_codes" ADD CONSTRAINT "technician_login_codes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
