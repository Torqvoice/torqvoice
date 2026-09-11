import { db } from '@/lib/db'
import { getFeatures } from '@/lib/features'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'

/**
 * Whether a workshop's customer portal answers at all.
 *
 * Two things have to hold: the workshop switched it on, and its plan still
 * includes it. The public routes used to check only the switch, so a portal
 * enabled on Pro kept working after a downgrade to the free plan.
 */
export async function isPortalLive(organizationId: string): Promise<boolean> {
  const [setting, features] = await Promise.all([
    db.appSetting.findUnique({
      where: { organizationId_key: { organizationId, key: SETTING_KEYS.PORTAL_ENABLED } },
      select: { value: true },
    }),
    getFeatures(organizationId),
  ])
  return setting?.value === 'true' && features.customerPortal
}
