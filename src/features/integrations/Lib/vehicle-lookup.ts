import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { getManifest } from '@/integrations/registry'
import { db } from '@/lib/db'
import { loadConnection } from './connections'
import type { VehicleLookupQuery, VehicleLookupResult } from './types'

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

/**
 * The active connection that can answer, preferring one for the workshop's
 * own country when more than one registry is connected.
 */
export async function findLookupConnection(
  organizationId: string
): Promise<{ id: string; connectorId: string } | null> {
  const [rows, countrySetting] = await Promise.all([
    db.integrationConnection.findMany({
      where: { organizationId, status: 'active' },
      select: { id: true, connectorId: true },
    }),
    db.appSetting.findUnique({
      where: {
        organizationId_key: { organizationId, key: SETTING_KEYS.WORKSHOP_DEFAULT_COUNTRY_CODE },
      },
      select: { value: true },
    }),
  ])
  const country = countrySetting?.value?.toUpperCase() ?? null
  const candidates = rows.filter((r) =>
    getManifest(r.connectorId)?.capabilities.includes(LOOKUP_CAPABILITY)
  )
  if (candidates.length === 0) return null
  const local = candidates.find((r) => {
    const countries = getManifest(r.connectorId)?.countries
    return country && Array.isArray(countries) && countries.includes(country)
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
