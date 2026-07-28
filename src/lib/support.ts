/**
 * Whether a workshop can raise a support request from inside the app.
 *
 * Two independent conditions have to hold, and the order matters. Cloud mode
 * comes first because a self-hosted install has no support desk behind it —
 * there is nobody on the other end of the mail, so the button must never
 * appear there even if the setting somehow made it into the database (a
 * restored cloud backup, say). The stored flag is second and defaults to off,
 * so a fresh cloud deployment ships with the feature dark until someone turns
 * it on from the torqvoice.com admin dashboard.
 */

import { db } from "@/lib/db";
import { isCloudMode } from "@/lib/features";
import { SYSTEM_SETTING_KEYS } from "@/features/admin/Schema/systemSettingsSchema";

/** Used when no recipient is configured, matching the branding site's contact form. */
export const DEFAULT_SUPPORT_RECIPIENT = "post@torqvoice.com";

export async function isSupportEnabled(): Promise<boolean> {
  if (!isCloudMode()) return false;

  const setting = await db.systemSetting.findUnique({
    where: { key: SYSTEM_SETTING_KEYS.SUPPORT_ENABLED },
    select: { value: true },
  });

  // Only the exact string enables it. A stale or malformed value reads as off,
  // so the failure mode is a missing button rather than mail sent to nobody.
  return setting?.value === "true";
}

export async function getSupportRecipient(): Promise<string> {
  const setting = await db.systemSetting.findUnique({
    where: { key: SYSTEM_SETTING_KEYS.SUPPORT_RECIPIENT_EMAIL },
    select: { value: true },
  });

  const configured = setting?.value?.trim();
  return configured ? configured : DEFAULT_SUPPORT_RECIPIENT;
}
