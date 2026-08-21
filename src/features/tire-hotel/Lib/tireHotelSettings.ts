import { cache } from 'react'
import { db } from '@/lib/db'
import { getFeatures, FeatureGatedError } from '@/lib/features'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { DEFAULT_TREAD_THRESHOLDS_MM } from './tireConstants'

/**
 * The tire hotel needs two things to be live: a plan that includes it, and a
 * workshop that has switched it on. Both are checked here so every entry
 * point (sidebar, routes, server actions, cron sweeps) gets the same
 * answer, and a plan downgrade hides the module without touching the
 * organization's own setting.
 */
export const isTireHotelEnabled = cache(async (organizationId: string): Promise<boolean> => {
  if (!organizationId) return false

  const features = await getFeatures(organizationId)
  if (!features.tireHotel) return false

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

    const features = await getFeatures(organizationId)

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
      enabled: features.tireHotel && map.get(SETTING_KEYS.TIRE_HOTEL_ENABLED) === 'true',
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

/**
 * Guards every tire hotel server action. Separates the two reasons it can be
 * unavailable: a plan that does not include it raises the usual upgrade
 * error, while a plan that does but a workshop that has not opted in raises
 * a plain disabled error.
 */
export async function requireTireHotel(organizationId: string): Promise<void> {
  const features = await getFeatures(organizationId)
  if (!features.tireHotel) throw new FeatureGatedError('tireHotel')
  if (!(await isTireHotelEnabled(organizationId))) {
    throw new TireHotelDisabledError()
  }
}
