import { db } from '@/lib/db'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { typeKeySearchTerms } from './typeKey'

/**
 * Whether the workshop has switched the German type key on. Off by default,
 * and off means hidden everywhere: a vehicle keeps what was typed, but no
 * page, print or share link shows it.
 */
export function typeKeyEnabledIn(settings: Record<string, string | undefined>): boolean {
  // A marine workshop has no switch for it, so it cannot be left on there.
  return (
    settings[SETTING_KEYS.VEHICLE_TYPE_KEY_ENABLED] === 'true' &&
    settings[SETTING_KEYS.SERVICE_TYPE] !== 'marine'
  )
}

export async function isTypeKeyEnabled(organizationId: string): Promise<boolean> {
  const rows = await db.appSetting.findMany({
    where: {
      organizationId,
      key: { in: [SETTING_KEYS.VEHICLE_TYPE_KEY_ENABLED, SETTING_KEYS.SERVICE_TYPE] },
    },
    select: { key: true, value: true },
  })
  return typeKeyEnabledIn(Object.fromEntries(rows.map((row) => [row.key, row.value])))
}

/** The vehicle as a page or print may show it: without the type key while the setting is off. */
export function gateTypeKey<T extends { hsn?: string | null; tsn?: string | null }>(
  vehicle: T,
  enabled: boolean
): T {
  return enabled ? vehicle : { ...vehicle, hsn: null, tsn: null }
}

/**
 * The vehicle conditions a search term adds as a type key, for a workshop
 * that records one. Asks the setting only when the term could be a key, so
 * an ordinary search costs nothing extra.
 */
export async function typeKeySearch(
  organizationId: string,
  term: string
): Promise<{ hsn?: string; tsn?: string }[]> {
  const terms = typeKeySearchTerms(term)
  if (terms.length === 0) return []
  return (await isTypeKeyEnabled(organizationId)) ? terms : []
}
