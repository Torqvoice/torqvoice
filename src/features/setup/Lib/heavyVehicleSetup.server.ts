import 'server-only'

import { db } from '@/lib/db'
import { getFeatures } from '@/lib/features'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'

/**
 * Where the fleet and heavy vehicle setup checklist stands for a workshop.
 * It is opened on request (the search palette, or the link at the foot of
 * Settings, Custom Fields) and stays until dismissed: nothing about it shows
 * for a workshop that never asked.
 */
export const HEAVY_VEHICLE_SETUP_KEY = 'setup.heavyVehiclesCard'

/** The five switches the checklist walks through, and whether each is on. */
export interface HeavyVehicleSetupState {
  reference: boolean
  fleetNumber: boolean
  customFields: boolean
  meters: boolean
  equipment: boolean
}

/**
 * The checklist when the workshop has opened it and its plan includes what
 * it sets up; null otherwise, so the page draws nothing. The plan is asked
 * first: without it nothing else is read.
 */
export async function heavyVehicleSetupState(
  organizationId: string
): Promise<HeavyVehicleSetupState | null> {
  if (!(await getFeatures(organizationId)).customFields) return null
  const open = await db.appSetting.findFirst({
    where: { organizationId, key: HEAVY_VEHICLE_SETUP_KEY },
    select: { value: true },
  })
  if (open?.value !== 'open') return null
  const [settings, fields, meters, equipment] = await Promise.all([
    db.appSetting.findMany({
      where: {
        organizationId,
        key: {
          in: [SETTING_KEYS.CUSTOMER_REFERENCE_ENABLED, SETTING_KEYS.VEHICLE_FLEET_NUMBER_ENABLED],
        },
      },
      select: { key: true, value: true },
    }),
    db.customFieldDefinition.count({
      where: { organizationId, entityType: { in: ['vehicle', 'customer'] } },
    }),
    db.meterType.count({ where: { organizationId } }),
    db.equipmentType.count({ where: { organizationId } }),
  ])
  const on = (key: string) => settings.some((s) => s.key === key && s.value === 'true')
  return {
    reference: on(SETTING_KEYS.CUSTOMER_REFERENCE_ENABLED),
    fleetNumber: on(SETTING_KEYS.VEHICLE_FLEET_NUMBER_ENABLED),
    customFields: fields > 0,
    meters: meters > 0,
    equipment: equipment > 0,
  }
}
