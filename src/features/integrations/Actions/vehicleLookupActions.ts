'use server'

import { db } from '@/lib/db'
import { getFeatures } from '@/lib/features'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'
import { recordRegistryAnswer } from '../Lib/inspection-sync'
import type { VehicleLookupResult } from '../Lib/types'
import { askRegistry, findLookupConnection, withinLookupBudget } from '../Lib/vehicle-lookup'

/**
 * The form's plate and VIN lookups. The registry logic lives in
 * Lib/vehicle-lookup so the header's plate palette can ask the same way.
 */

const READ_VEHICLES = [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }]

export interface VehicleLookup extends VehicleLookupResult {
  /** Registry name for the attribution line, such as "Statens vegvesen". */
  source: string
}

/** Whether the form should offer a lookup at all: plan on, registry connected. */
export async function isVehicleLookupAvailable() {
  return withAuth(
    async ({ organizationId }) => {
      const features = await getFeatures(organizationId)
      if (!features.integrations) return false
      return (await findLookupConnection(organizationId)) !== null
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
      const target = await findLookupConnection(organizationId)
      if (!target) throw new Error('No vehicle registry is connected')
      if (!withinLookupBudget(organizationId))
        throw new Error('Too many lookups, wait a minute and try again')

      const answer = await askRegistry(target.id, {
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
            source: answer.connectorId,
            result: answer.result,
          })
        }
      }
      if (!answer.result) return null
      return { ...answer.result, source: answer.source }
    },
    { requiredPermissions: READ_VEHICLES }
  )
}
