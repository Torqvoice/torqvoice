'use server'

import { db } from '@/lib/db'
import { getFeatures } from '@/lib/features'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { getManifest } from '@/integrations/registry'
import { loadConnection } from '../Lib/connections'
import { recordRegistryAnswer } from '../Lib/inspection-sync'
import type { VehicleLookupResult } from '../Lib/types'

/**
 * Plate and VIN lookups against whichever vehicle registry the workshop has
 * connected. The form asks here rather than knowing about connectors, so a
 * second country's registry is a new folder under src/integrations and
 * nothing else.
 */

const CAPABILITY = 'vehicle.lookup'
const READ_VEHICLES = [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }]

/**
 * How many lookups an organisation may make per minute. A registry key has a
 * daily quota that belongs to the workshop, and one stuck retry loop or a
 * pasted spreadsheet should not spend it. Generous for a person at a form.
 */
const LOOKUPS_PER_MINUTE = 30
const budgets = new Map<string, { count: number; resetAt: number }>()

function withinBudget(organizationId: string): boolean {
  const now = Date.now()
  const entry = budgets.get(organizationId)
  if (!entry || entry.resetAt <= now) {
    budgets.set(organizationId, { count: 1, resetAt: now + 60_000 })
    return true
  }
  entry.count += 1
  return entry.count <= LOOKUPS_PER_MINUTE
}

export interface VehicleLookup extends VehicleLookupResult {
  /** Registry name for the attribution line, such as "Statens vegvesen". */
  source: string
}

/**
 * The active connection that can answer, preferring one for the workshop's
 * own country when more than one registry is connected.
 */
async function lookupConnection(
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
    getManifest(r.connectorId)?.capabilities.includes(CAPABILITY)
  )
  if (candidates.length === 0) return null
  const local = candidates.find((r) => {
    const countries = getManifest(r.connectorId)?.countries
    return country && Array.isArray(countries) && countries.includes(country)
  })
  return local ?? candidates[0]
}

/** Whether the form should offer a lookup at all: plan on, registry connected. */
export async function isVehicleLookupAvailable() {
  return withAuth(
    async ({ organizationId }) => {
      const features = await getFeatures(organizationId)
      if (!features.integrations) return false
      return (await lookupConnection(organizationId)) !== null
    },
    { requiredPermissions: READ_VEHICLES }
  )
}

/**
 * One lookup for the form. When the vehicle already exists and is this
 * organisation's, what the registry said is also recorded on it, so the
 * inspection date lands without waiting for the next scheduled pass.
 */
export async function lookupVehicle(query: { plate?: string; vin?: string; vehicleId?: string }) {
  return withAuth(
    async ({ organizationId }): Promise<VehicleLookup | null> => {
      const plate = query.plate?.trim() ?? ''
      const vin = query.vin?.trim() ?? ''
      if (!plate && !vin) throw new Error('A plate or VIN is required')
      if (plate.length > 16 || vin.length > 32)
        throw new Error('That does not look like a plate or VIN')
      const features = await getFeatures(organizationId)
      if (!features.integrations) throw new Error('Integrations are not included in your plan')
      const target = await lookupConnection(organizationId)
      if (!target) throw new Error('No vehicle registry is connected')
      if (!withinBudget(organizationId))
        throw new Error('Too many lookups, wait a minute and try again')

      const { ctx, server } = await loadConnection(target.id)
      if (!server.lookupVehicle) throw new Error('This integration cannot look up vehicles')
      const result = await server.lookupVehicle(ctx, {
        plate: plate || undefined,
        vin: vin || undefined,
      })
      if (query.vehicleId) {
        const owned = await db.vehicle.findFirst({
          where: { id: query.vehicleId, organizationId },
          select: { id: true },
        })
        if (owned) {
          await recordRegistryAnswer({
            organizationId,
            vehicleId: owned.id,
            source: target.connectorId,
            result,
          })
        }
      }
      if (!result) return null
      return { ...result, source: server.manifest.name }
    },
    { requiredPermissions: READ_VEHICLES }
  )
}
