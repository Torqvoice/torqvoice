import 'server-only'

import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import {
  VEHICLE_PAGE_LAYOUT_COOKIE,
  parseVehiclePageLayout,
  type VehiclePageLayout,
} from './vehicle-page-layout'

/** The vehicle page this browser should get; see lib/vehicle-page-layout.ts. */
export async function resolveVehiclePageLayout(
  organizationId: string | null | undefined
): Promise<VehiclePageLayout> {
  const store = await cookies()
  const chosen = store.get(VEHICLE_PAGE_LAYOUT_COOKIE)?.value
  // An explicit choice needs no lookup.
  if (chosen === 'classic' || chosen === 'modern') return chosen
  const workshop = organizationId
    ? await db.organization.findUnique({
        where: { id: organizationId },
        select: { createdAt: true },
      })
    : null
  return parseVehiclePageLayout(chosen, workshop?.createdAt ?? null)
}
