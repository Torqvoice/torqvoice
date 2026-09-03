'use server'

import { db } from '@/lib/db'
import { safeTimeZone } from '@/lib/timezone'
import { withAuth } from '@/lib/with-auth'
import { SETTING_KEYS } from '../Schema/settingsSchema'

/**
 * Give a workshop that never chose a timezone the one its first visitor's
 * browser reports, stored as an explicit choice. Booking times and opening
 * hours need a real zone on the server, and "automatic" only ever meant
 * something in a browser. Runs once: a workshop with a zone is left alone,
 * and the settings page shows what was adopted so it can be corrected.
 */
export async function adoptDetectedTimezone(detected: string) {
  return withAuth(async ({ organizationId, userId }) => {
    const zone = safeTimeZone(detected, '')
    if (!zone) return { adopted: false }
    const existing = await db.appSetting.findUnique({
      where: { organizationId_key: { organizationId, key: SETTING_KEYS.TIMEZONE } },
      select: { value: true },
    })
    if (existing?.value?.trim()) return { adopted: false }
    await db.appSetting.upsert({
      where: { organizationId_key: { organizationId, key: SETTING_KEYS.TIMEZONE } },
      create: { organizationId, userId, key: SETTING_KEYS.TIMEZONE, value: zone },
      update: { value: zone },
    })
    return { adopted: true, zone }
  })
}
