-- The conversation between a customer and the workshop in the customer
-- portal, and the portal's cover photo.
--
-- The portal no longer has a background picker: a workshop chooses a theme,
-- and the picture it uploaded as a background becomes the cover photo of its
-- sign-in page. The gradient templates are gone with the picker.
BEGIN;

-- CreateTable
CREATE TABLE "portal_messages" (
    "id" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "attachments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorUserId" TEXT,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,

    CONSTRAINT "portal_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "portal_messages_organizationId_customerId_createdAt_idx" ON "portal_messages"("organizationId", "customerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "portal_messages_organizationId_direction_readAt_idx" ON "portal_messages"("organizationId", "direction", "readAt");

-- AddForeignKey
ALTER TABLE "portal_messages" ADD CONSTRAINT "portal_messages_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_messages" ADD CONSTRAINT "portal_messages_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_messages" ADD CONSTRAINT "portal_messages_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A request for a visit can carry the customer's photos and video, and the
-- part of the day that suits them.
-- AlterTable
ALTER TABLE "service_requests" ADD COLUMN     "attachments" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "preferredTime" TEXT;

-- An uploaded background picture becomes the cover photo, wherever one was
-- uploaded: a workshop that later switched to a gradient still owns the file.
INSERT INTO "app_settings" ("id", "key", "value", "userId", "organizationId")
SELECT 'cover_' || s."id", 'portal.cover', s."value", s."userId", s."organizationId"
FROM "app_settings" s
WHERE s."key" = 'portal.background.image'
  AND s."value" <> ''
  AND s."organizationId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "app_settings" c
    WHERE c."organizationId" = s."organizationId" AND c."key" = 'portal.cover'
  );

DELETE FROM "app_settings"
WHERE "key" IN ('portal.background.type', 'portal.background.template', 'portal.background.image');

COMMIT;
