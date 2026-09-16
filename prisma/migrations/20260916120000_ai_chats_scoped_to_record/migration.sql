-- AlterTable
ALTER TABLE "ai_chats" ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "vehicleId" TEXT;

-- CreateIndex
CREATE INDEX "ai_chats_vehicleId_idx" ON "ai_chats"("vehicleId");

-- CreateIndex
CREATE INDEX "ai_chats_customerId_idx" ON "ai_chats"("customerId");

-- AddForeignKey
ALTER TABLE "ai_chats" ADD CONSTRAINT "ai_chats_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_chats" ADD CONSTRAINT "ai_chats_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
