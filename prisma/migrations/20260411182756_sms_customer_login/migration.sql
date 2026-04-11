-- CreateTable
CREATE TABLE "customer_sms_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_sms_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_sms_codes_phone_organizationId_idx" ON "customer_sms_codes"("phone", "organizationId");

-- CreateIndex
CREATE INDEX "customer_sms_codes_organizationId_idx" ON "customer_sms_codes"("organizationId");
