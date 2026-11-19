import { db } from '@/lib/db'
import { getFeatures } from '@/lib/features'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'

/**
 * Whether the workshop has switched the Fleet / unit number on. Off by
 * default, and off means hidden everywhere: a vehicle keeps what was typed,
 * but no page, list, print, share link or app shows it.
 */
export function fleetNumberEnabledIn(
  settings: Record<string, string | undefined>,
  features: { customFields: boolean }
): boolean {
  // A paid field, on the plans that have custom fields. After a downgrade the
  // switch may still read 'true'; the plan is what hides it then.
  return settings[SETTING_KEYS.VEHICLE_FLEET_NUMBER_ENABLED] === 'true' && features.customFields
}

export async function isFleetNumberEnabled(organizationId: string): Promise<boolean> {
  const rows = await db.appSetting.findMany({
    where: { organizationId, key: SETTING_KEYS.VEHICLE_FLEET_NUMBER_ENABLED },
    select: { key: true, value: true },
  })
  // The setting first: a workshop that never turned it on costs one indexed
  // read and no look at its plan.
  const row = rows.find((candidate) => candidate.key === SETTING_KEYS.VEHICLE_FLEET_NUMBER_ENABLED)
  if (row?.value !== 'true') return false
  return (await getFeatures(organizationId)).customFields
}

/** The vehicle as a page or print may show it: without the fleet number while the field is off. */
export function gateFleetNumber<T extends { fleetNumber?: string | null }>(
  vehicle: T,
  enabled: boolean
): T {
  return enabled ? vehicle : { ...vehicle, fleetNumber: null }
}

/**
 * The vehicle condition a search term adds as a fleet number, for a workshop
 * that records one; nothing otherwise, so the query is what it always was.
 */
export function fleetNumberMatch(
  term: string,
  enabled: boolean
): { fleetNumber: { contains: string; mode: 'insensitive' } }[] {
  return enabled && term.trim() ? [{ fleetNumber: { contains: term, mode: 'insensitive' } }] : []
}
