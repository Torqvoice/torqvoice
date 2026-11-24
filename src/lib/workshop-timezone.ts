import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { db } from '@/lib/db'
import { DEFAULT_DATE_FORMAT } from '@/lib/format'
import { resolveWorkshopTimeZone } from '@/lib/timezone'

export { resolveWorkshopTimeZone }

/**
 * The zone server code reads workshop times in.
 *
 * The localisation page offers "automatic", which the browser resolves and
 * the server cannot. Saving that page also stores what the browser resolved,
 * so a workshop that never chose a zone still gets the right one here rather
 * than UTC. An explicit choice always wins.
 */
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

export interface WorkshopDateSettings {
  timeZone: string
  dateFormat: string
  timeFormat: '12h' | '24h'
}

/**
 * How the workshop writes a date and a time, and the zone it reads them in,
 * for server code that renders dates a customer reads: share pages and the
 * portal. Hand the result to `formatDate`/`formatDateTime` from `@/lib/format`;
 * never format with the viewer's or the server's locale.
 */
export async function workshopDateSettings(organizationId: string): Promise<WorkshopDateSettings> {
  const rows = await db.appSetting.findMany({
    where: {
      organizationId,
      key: {
        in: [
          SETTING_KEYS.TIMEZONE,
          SETTING_KEYS.TIMEZONE_DETECTED,
          SETTING_KEYS.DATE_FORMAT,
          SETTING_KEYS.TIME_FORMAT,
        ],
      },
    },
    select: { key: true, value: true },
  })
  const map = new Map(rows.map((r) => [r.key, r.value]))
  return {
    timeZone: resolveWorkshopTimeZone(
      map.get(SETTING_KEYS.TIMEZONE),
      map.get(SETTING_KEYS.TIMEZONE_DETECTED)
    ),
    dateFormat: map.get(SETTING_KEYS.DATE_FORMAT) || DEFAULT_DATE_FORMAT,
    timeFormat: map.get(SETTING_KEYS.TIME_FORMAT) === '24h' ? '24h' : '12h',
  }
}
