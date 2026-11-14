-- CreateTable
CREATE TABLE "platform_sms_usage" (
    "organizationId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "platform_sms_usage_pkey" PRIMARY KEY ("organizationId","day")
);
