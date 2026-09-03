import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { db } from '@/lib/db'
import { safeTimeZone } from '@/lib/timezone'

/**
 * The zone server code reads workshop times in.
 *
 * The localisation page offers "automatic", which the browser resolves and
 * the server cannot. Saving that page also stores what the browser resolved,
 * so a workshop that never chose a zone still gets the right one here rather
 * than UTC. An explicit choice always wins.
 */
export function resolveWorkshopTimeZone(
  explicit: string | null | undefined,
  detected: string | null | undefined
): string {
  return safeTimeZone(explicit?.trim() || detected?.trim() || null)
}

export async function workshopTimeZone(organizationId: string): Promise<string> {
  const rows = await db.appSetting.findMany({
    where: { organizationId, key: { in: [SETTING_KEYS.TIMEZONE, SETTING_KEYS.TIMEZONE_DETECTED] } },
    select: { key: true, value: true },
  })
  const map = new Map(rows.map((r) => [r.key, r.value]))
  return resolveWorkshopTimeZone(
    map.get(SETTING_KEYS.TIMEZONE),
    map.get(SETTING_KEYS.TIMEZONE_DETECTED)
  )
}
