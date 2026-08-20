import { CronJob } from 'cron'
import { db } from '@/lib/db'
import { getFeatures } from '@/lib/features'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { syncCharges } from '@/features/tire-hotel/Lib/syncCharges'

const LOG_PREFIX = '[storage-charges]'

/**
 * Organizations running a tire hotel, by both the plan and their own switch.
 *
 * A workshop that turned the feature off should stop accruing storage fees,
 * not quietly build up a backlog of charges nobody asked for and nobody can
 * see until they turn it back on.
 */
async function activeOrganizations(): Promise<string[]> {
  const settings = await db.appSetting.findMany({
    where: { key: SETTING_KEYS.TIRE_HOTEL_ENABLED, value: 'true' },
    select: { organizationId: true },
  })

  const enabled: string[] = []
  for (const { organizationId } of settings) {
    if (!organizationId) continue
    const features = await getFeatures(organizationId)
    if (features.tireHotel) enabled.push(organizationId)
  }
  return enabled
}

/**
 * Raises the storage charges that have fallen due.
 *
 * Agreements bill by period, so somebody has to notice when a period starts.
 * Doing it only when a human opens the set means the shop's income depends on
 * who clicked where, and a set nobody opened all winter is a season billed
 * for free.
 *
 * Every agreement syncs in its own transaction, so one bad row cannot stop
 * the rest of the sweep. Nothing here decides what is owed: that is
 * duePeriods, working from the charges already recorded, which is why running
 * this twice in a day, or late after downtime, still bills each period once.
 */
export async function processStorageCharges(now: Date = new Date()): Promise<number> {
  const organizations = await activeOrganizations()
  if (organizations.length === 0) return 0

  let raised = 0

  for (const organizationId of organizations) {
    const agreements = await db.tireStorageAgreement.findMany({
      where: { organizationId, status: 'active' },
      select: { id: true },
    })

    for (const agreement of agreements) {
      try {
        raised += await db.$transaction((tx) => syncCharges(tx, agreement.id, organizationId, now))
      } catch (error) {
        console.error(`${LOG_PREFIX} agreement ${agreement.id} failed:`, error)
      }
    }
  }

  return raised
}

/**
 * Nightly, because a storage period is a season or a month.
 *
 * Runs after midnight so a period that starts today is raised on the day it
 * starts rather than the day after.
 */
export function checkStorageCharges() {
  const job = new CronJob('40 0 * * *', async () => {
    try {
      const raised = await processStorageCharges()
      if (raised > 0) {
        console.warn(`${LOG_PREFIX} raised ${raised} storage charge(s)`)
      }
    } catch (error) {
      console.error(`${LOG_PREFIX} sweep failed:`, error)
    }
  })
  job.start()
  console.warn(`${LOG_PREFIX} Storage-charge sweep started (nightly)`)
}
