-- Add per-user last seen app version for the update banner.
-- IF NOT EXISTS keeps this idempotent for environments where the column
-- was applied manually before the migration was recorded.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastSeenVersion" TEXT;
