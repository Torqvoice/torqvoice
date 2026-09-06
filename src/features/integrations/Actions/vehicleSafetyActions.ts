'use server'

import { withAuth } from '@/lib/with-auth'
import { getFeatures } from '@/lib/features'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import type { VehicleSafetyReport } from '../Lib/types'
import { findSafetyConnection, vehicleSafetyReport } from '../Lib/vehicle-safety'

const READ_VEHICLES = [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }]

export interface VehicleSafetyView {
  report: VehicleSafetyReport
  /** Vendor's product name for the attribution line. */
  source: string
  fetchedAt: string
  /** The authority could not be reached; this is the last report it gave. */
  stale: boolean
}

/** Whether a vehicle page should show the safety panel at all. */
export async function isVehicleSafetyAvailable() {
  return withAuth(
    async ({ organizationId }) => {
      const features = await getFeatures(organizationId)
      if (!features.integrations) return false
      return (await findSafetyConnection(organizationId)) !== null
    },
    { requiredPermissions: READ_VEHICLES }
  )
}

/**
 * Recalls, complaints and ratings for one vehicle: from the weekly cache
 * when it is fresh, from the authority otherwise. Null when the vehicle has
 * no make, model and year to ask about, or no safety source is connected.
 */
export async function getVehicleSafety(vehicleId: string, options: { refresh?: boolean } = {}) {
  return withAuth(
    async ({ organizationId }): Promise<VehicleSafetyView | null> => {
      const features = await getFeatures(organizationId)
      if (!features.integrations) return null
      const cached = await vehicleSafetyReport(organizationId, vehicleId, options)
      if (!cached) return null
      const { getManifest } = await import('@/integrations/registry')
      return {
        report: cached.report,
        source: getManifest(cached.report.source)?.name ?? cached.report.source,
        fetchedAt: cached.fetchedAt.toISOString(),
        stale: cached.stale,
      }
    },
    { requiredPermissions: READ_VEHICLES }
  )
}
