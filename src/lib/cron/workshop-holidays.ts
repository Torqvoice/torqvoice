import { CronJob } from 'cron'
import { db } from '@/lib/db'
import { isRestoring } from '@/lib/backup/freeze'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { syncPublicHolidays } from '@/features/workshop-calendar/Lib/holidaySync.server'
import { refreshLinkedFeeds } from '@/features/workshop-calendar/Lib/feedSync.server'

/**
 * Once a day, fetch each workshop's public holidays again (so next year's
 * arrive before they are needed and corrections reach the board) and read
 * its linked holiday calendars again. A workshop whose fetch fails keeps the
 * holidays it had.
 */
export async function syncWorkshopHolidaysOnce(now = new Date()): Promise<number> {
  const rows = await db.appSetting.findMany({
    where: {
      OR: [
        { key: SETTING_KEYS.HOLIDAY_COUNTRY, value: { not: '' } },
        { key: SETTING_KEYS.HOLIDAY_FEEDS, value: { contains: '"url":"http' } },
      ],
      organizationId: { not: null },
    },
    select: { organizationId: true },
  })
  const ids = [...new Set(rows.map((r) => r.organizationId).filter((id): id is string => !!id))]
  let synced = 0
  for (const organizationId of ids) {
    if (isRestoring(organizationId)) continue
    try {
      await syncPublicHolidays(organizationId, { now })
      await refreshLinkedFeeds(organizationId, { now })
      synced++
    } catch (error) {
      console.error(`[cron] Holiday sync failed for ${organizationId}:`, error)
    }
  }
  return synced
}

/** Daily at 04:15 UTC. */
export function syncWorkshopHolidays() {
  const job = new CronJob('15 4 * * *', async () => {
    try {
      await syncWorkshopHolidaysOnce()
    } catch (error) {
      console.error('[cron] Holiday sync failed:', error)
    }
  })
  job.start()
}
