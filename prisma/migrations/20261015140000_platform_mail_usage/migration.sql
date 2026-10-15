-- Customer mail sent through the platform's own address, per workshop and
-- UTC day, for the daily cap on plans without custom email. A new table with
-- no data to move.

-- CreateTable
CREATE TABLE "platform_mail_usage" (
    "organizationId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "platform_mail_usage_pkey" PRIMARY KEY ("organizationId","day")
);
