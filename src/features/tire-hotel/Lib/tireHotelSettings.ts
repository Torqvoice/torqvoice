import { cache } from 'react'
import { db } from '@/lib/db'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { DEFAULT_TREAD_THRESHOLDS_MM } from './tireConstants'

/**
 * The tire hotel is opt-in. Every entry point — sidebar, routes, server
 * actions, cron sweeps — asks this before doing anything, so a workshop that
 * never turns it on carries none of it.
 */
export const isTireHotelEnabled = cache(async (organizationId: string): Promise<boolean> => {
  if (!organizationId) return false
  const setting = await db.appSetting.findUnique({
    where: { organizationId_key: { organizationId, key: SETTING_KEYS.TIRE_HOTEL_ENABLED } },
    select: { value: true },
  })
  return setting?.value === 'true'
})

export type TireHotelSettings = {
  enabled: boolean
  summerReplaceMm: number
  winterReplaceMm: number
  defaultCapacity: number
  capacityWarnPercent: number
}

const DEFAULTS: Omit<TireHotelSettings, 'enabled'> = {
  summerReplaceMm: DEFAULT_TREAD_THRESHOLDS_MM.summerReplace,
  winterReplaceMm: DEFAULT_TREAD_THRESHOLDS_MM.winterReplace,
  defaultCapacity: 8,
  capacityWarnPercent: 90,
}

function toNumber(value: string | undefined, fallback: number): number {
  if (value == null || value === '') return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const getTireHotelSettings = cache(
  async (organizationId: string): Promise<TireHotelSettings> => {
    if (!organizationId) return { enabled: false, ...DEFAULTS }

    const rows = await db.appSetting.findMany({
      where: {
        organizationId,
        key: {
          in: [
            SETTING_KEYS.TIRE_HOTEL_ENABLED,
            SETTING_KEYS.TIRE_HOTEL_SUMMER_REPLACE_MM,
            SETTING_KEYS.TIRE_HOTEL_WINTER_REPLACE_MM,
            SETTING_KEYS.TIRE_HOTEL_DEFAULT_CAPACITY,
            SETTING_KEYS.TIRE_HOTEL_CAPACITY_WARN_PERCENT,
          ],
        },
      },
      select: { key: true, value: true },
    })

    const map = new Map(rows.map((r) => [r.key, r.value]))

    return {
      enabled: map.get(SETTING_KEYS.TIRE_HOTEL_ENABLED) === 'true',
      summerReplaceMm: toNumber(
        map.get(SETTING_KEYS.TIRE_HOTEL_SUMMER_REPLACE_MM),
        DEFAULTS.summerReplaceMm
      ),
      winterReplaceMm: toNumber(
        map.get(SETTING_KEYS.TIRE_HOTEL_WINTER_REPLACE_MM),
        DEFAULTS.winterReplaceMm
      ),
      defaultCapacity: toNumber(
        map.get(SETTING_KEYS.TIRE_HOTEL_DEFAULT_CAPACITY),
        DEFAULTS.defaultCapacity
      ),
      capacityWarnPercent: toNumber(
        map.get(SETTING_KEYS.TIRE_HOTEL_CAPACITY_WARN_PERCENT),
        DEFAULTS.capacityWarnPercent
      ),
    }
  }
)

/** Thrown by actions when the module is off, so the caller can say why. */
export class TireHotelDisabledError extends Error {
  constructor() {
    super('Tire hotel is not enabled for this organization')
    this.name = 'TireHotelDisabledError'
  }
}

export async function requireTireHotel(organizationId: string): Promise<void> {
  if (!(await isTireHotelEnabled(organizationId))) {
    throw new TireHotelDisabledError()
  }
}
