'use server'

import { db } from '@/lib/db'
import { getFeatures } from '@/lib/features'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'
import { recordRegistryAnswer } from '../Lib/inspection-sync'
import type { VehicleLookupKey, VehicleLookupResult } from '../Lib/types'
import {
  askRegistry,
  findLookupConnection,
  lookupKeys,
  withinLookupBudget,
} from '../Lib/vehicle-lookup'

/**
 * The form's plate and VIN lookups. The registry logic lives in
 * Lib/vehicle-lookup so the header's plate palette can ask the same way.
 */

const READ_VEHICLES = [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }]

export interface VehicleLookup extends VehicleLookupResult {
  /** Registry name for the attribution line, such as "Statens vegvesen". */
  source: string
}

/**
 * Which lookups the form should offer: plan on, and a connected registry that
 * answers to a plate, a VIN, or both.
 */
export async function isVehicleLookupAvailable() {
  return withAuth(
    async ({ organizationId }): Promise<Record<VehicleLookupKey, boolean>> => {
      const features = await getFeatures(organizationId)
      if (!features.integrations) return { plate: false, vin: false }
      const [plate, vin] = await Promise.all([
        findLookupConnection(organizationId, 'plate'),
        findLookupConnection(organizationId, 'vin'),
      ])
      return { plate: plate !== null, vin: vin !== null }
    },
    { requiredPermissions: READ_VEHICLES }
  )
}

/**
 * One lookup for the form, by plate or by VIN, sent to a registry that
 * answers to it. When the vehicle already exists and is this organisation's,
 * what the registry said is also recorded on it, so the inspection date
 * lands without waiting for the next scheduled pass.
 */
export async function lookupVehicle(query: {
  by: VehicleLookupKey
  value: string
  vehicleId?: string
}) {
  return withAuth(
    async ({ organizationId }): Promise<VehicleLookup | null> => {
      const by: VehicleLookupKey = query.by === 'vin' ? 'vin' : 'plate'
      const value = query.value?.trim() ?? ''
      if (!value) throw new Error(by === 'vin' ? 'A VIN is required' : 'A plate is required')
      if (value.length > (by === 'vin' ? 32 : 16))
        throw new Error(
          by === 'vin' ? 'That does not look like a VIN' : 'That does not look like a plate'
        )
      const features = await getFeatures(organizationId)
      if (!features.integrations) throw new Error('Integrations are not included in your plan')
      const target = await findLookupConnection(organizationId, by)
      if (!target)
        throw new Error(
          by === 'vin'
            ? 'No connected integration decodes VINs'
            : 'No vehicle registry is connected'
        )
      if (!withinLookupBudget(organizationId))
        throw new Error('Too many lookups, wait a minute and try again')

      const answer = await askRegistry(target.id, { [by]: value })
      // A VIN decoder such as NHTSA knows the model, not this vehicle's
      // registration, so it has no inspection status to record, and must not
      // replace the one a registry wrote.
      if (query.vehicleId && lookupKeys(target.connectorId).includes('plate')) {
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
