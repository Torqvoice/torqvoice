import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { getManifest } from '@/integrations/registry'
import { db } from '@/lib/db'
import { loadConnection } from './connections'
import type { VehicleLookupKey, VehicleLookupQuery, VehicleLookupResult } from './types'

/**
 * Plate and VIN lookups against whichever vehicle registry the workshop has
 * connected. Actions ask here rather than knowing about connectors, so a
 * second country's registry is a new folder under src/integrations and
 * nothing else.
 */

export const LOOKUP_CAPABILITY = 'vehicle.lookup'

/**
 * How many lookups an organisation may make per minute. A registry key has a
 * daily quota that belongs to the workshop, and some registries bill per
 * call, so one stuck retry loop or a pasted spreadsheet should not spend it.
 * Generous for a person at a form.
 */
const LOOKUPS_PER_MINUTE = 30
const budgets = new Map<string, { count: number; resetAt: number }>()

export function withinLookupBudget(organizationId: string): boolean {
  const now = Date.now()
  const entry = budgets.get(organizationId)
  if (!entry || entry.resetAt <= now) {
    budgets.set(organizationId, { count: 1, resetAt: now + 60_000 })
    return true
  }
  entry.count += 1
  return entry.count <= LOOKUPS_PER_MINUTE
}

/** What the connector answers to; plate only unless its manifest says otherwise. */
export function lookupKeys(connectorId: string): VehicleLookupKey[] {
  return getManifest(connectorId)?.lookupBy ?? ['plate']
}

/**
 * Calling codes of the countries a registry serves. The workshop's country
 * is only known from its default phone prefix ("+44"), while registries list
 * the countries they serve as ISO codes ("GB"), so this joins the two.
 */
const DIAL_CODES: Record<string, string[]> = {
  '1': ['US'],
  '31': ['NL'],
  '33': ['FR'],
  '34': ['ES'],
  '36': ['HU'],
  '39': ['IT'],
  '44': ['GB'],
  '45': ['DK'],
  '46': ['SE'],
  '47': ['NO'],
  '61': ['AU'],
  '64': ['NZ'],
  '351': ['PT'],
  '353': ['IE'],
  '358': ['FI'],
  '372': ['EE'],
  '385': ['HR'],
  '420': ['CZ'],
  '421': ['SK'],
}

/** The countries a "+44", "44" or "0044" prefix belongs to; none when unset or unknown. */
export function countriesForDialCode(value: string | null | undefined): string[] {
  const digits = value?.replace(/\D/g, '').replace(/^00/, '') ?? ''
  return DIAL_CODES[digits] ?? []
}

/**
 * The active connection that can answer a plate or a VIN, preferring one for
 * the workshop's own country when more than one registry is connected, and
 * the newest when two serve the same country.
 */
export async function findLookupConnection(
  organizationId: string,
  by: VehicleLookupKey = 'plate'
): Promise<{ id: string; connectorId: string } | null> {
  const [rows, countrySetting] = await Promise.all([
    db.integrationConnection.findMany({
      where: { organizationId, status: 'active' },
      select: { id: true, connectorId: true },
      // Newest first: a workshop that connects a second registry for the
      // same country is switching to it.
      orderBy: { createdAt: 'desc' },
    }),
    db.appSetting.findUnique({
      where: {
        organizationId_key: { organizationId, key: SETTING_KEYS.WORKSHOP_DEFAULT_COUNTRY_CODE },
      },
      select: { value: true },
    }),
  ])
  const countries = countriesForDialCode(countrySetting?.value)
  const candidates = rows.filter(
    (r) =>
      getManifest(r.connectorId)?.capabilities.includes(LOOKUP_CAPABILITY) &&
      lookupKeys(r.connectorId).includes(by)
  )
  if (candidates.length === 0) return null
  const local = candidates.find((r) => {
    const served = getManifest(r.connectorId)?.countries
    return Array.isArray(served) && served.some((c) => countries.includes(c))
  })
  return local ?? candidates[0]
}

export interface RegistryAnswer {
  result: VehicleLookupResult | null
  /** Registry name for the attribution line, such as "Statens vegvesen". */
  source: string
  connectorId: string
}

/** One lookup through the given connection. Throws with the connector's own reason when it fails. */
export async function askRegistry(
  connectionId: string,
  query: VehicleLookupQuery
): Promise<RegistryAnswer> {
  const { ctx, server } = await loadConnection(connectionId)
  if (!server.lookupVehicle) throw new Error('This integration cannot look up vehicles')
  const result = await server.lookupVehicle(ctx, query)
  return { result, source: server.manifest.name, connectorId: server.manifest.id }
}
