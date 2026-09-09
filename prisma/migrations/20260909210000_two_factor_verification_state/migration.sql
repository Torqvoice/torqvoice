-- AlterTable
ALTER TABLE "two_factor" ADD COLUMN     "verified" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "failedVerificationCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lockedUntil" TIMESTAMP(3);
