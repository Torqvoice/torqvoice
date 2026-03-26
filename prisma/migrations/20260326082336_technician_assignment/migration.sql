/*
  Warnings:

  - You are about to drop the column `memberId` on the `technicians` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "technicians" DROP COLUMN "memberId",
ADD COLUMN     "userId" TEXT;

-- AddForeignKey
ALTER TABLE "technicians" ADD CONSTRAINT "technicians_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
