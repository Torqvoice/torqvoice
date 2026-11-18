'use server'

import { getTranslations } from 'next-intl/server'
import { connectorName } from '@/features/integrations/Lib/display-name'
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
      const ti = await getTranslations('integrations')
      const sourceManifest = getManifest(cached.report.source)
      return {
        report: cached.report,
        source: sourceManifest ? connectorName(ti, sourceManifest) : cached.report.source,
        fetchedAt: cached.fetchedAt.toISOString(),
        stale: cached.stale,
      }
    },
    { requiredPermissions: READ_VEHICLES }
  )
}
