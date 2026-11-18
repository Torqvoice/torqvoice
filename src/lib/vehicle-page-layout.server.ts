import 'server-only'

import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import {
  VEHICLE_PAGE_LAYOUT_COOKIE,
  parseVehiclePageLayout,
  type VehiclePageLayout,
} from './vehicle-page-layout'

export interface VehiclePageLayoutChoice {
  layout: VehiclePageLayout
  /**
   * Whether somebody picked it in this browser, as opposed to getting it from
   * the workshop's age. A workshop still on the classic page because nobody
   * has tried the new one is a different thing from one that went back.
   */
  chosen: boolean
}

/** The vehicle page this browser should get, and why; see lib/vehicle-page-layout.ts. */
export async function resolveVehiclePageLayout(
  organizationId: string | null | undefined
): Promise<VehiclePageLayoutChoice> {
  const store = await cookies()
  const chosen = store.get(VEHICLE_PAGE_LAYOUT_COOKIE)?.value
  // An explicit choice needs no lookup.
  if (chosen === 'classic' || chosen === 'modern') return { layout: chosen, chosen: true }
  const workshop = organizationId
    ? await db.organization.findUnique({
        where: { id: organizationId },
        select: { createdAt: true },
      })
    : null
  return { layout: parseVehiclePageLayout(chosen, workshop?.createdAt ?? null), chosen: false }
}
