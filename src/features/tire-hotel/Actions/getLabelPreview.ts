'use server'

import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { requireTireHotel } from '../Lib/tireHotelSettings'

export type LabelPreview = {
  reference: string | null
  plate: string | null
  customer: string | null
  season: string
  size: string | null
  brand: string | null
  quantity: number
  withRims: boolean
  hasTpms: boolean
  studded: boolean
  shopName: string
}

/**
 * The same fields the printed label uses, for the on-screen preview.
 *
 * Read from the record rather than passed down from whatever page opened the
 * dialog, so the preview cannot drift from what actually prints. The QR is
 * not included: the browser draws its own from the set's URL, which avoids a
 * round trip every time the format changes.
 */
export async function getLabelPreview(tireSetId: string) {
  return withAuth(
    async ({ organizationId }) => {
      await requireTireHotel(organizationId)

      const [set, org] = await Promise.all([
        db.tireSet.findFirst({
          where: { id: tireSetId, organizationId },
          select: {
            reference: true,
            season: true,
            size: true,
            brand: true,
            quantity: true,
            withRims: true,
            hasTpms: true,
            studded: true,
            customer: { select: { name: true } },
            vehicle: { select: { licensePlate: true } },
          },
        }),
        db.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
      ])
      if (!set) throw new Error('Tire set not found')

      return {
        reference: set.reference,
        plate: set.vehicle?.licensePlate ?? null,
        customer: set.customer?.name ?? null,
        season: set.season,
        size: set.size,
        brand: set.brand,
        quantity: set.quantity,
        withRims: set.withRims,
        hasTpms: set.hasTpms,
        studded: set.studded,
        shopName: org?.name ?? '',
      } satisfies LabelPreview
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.TIRE_HOTEL },
      ],
    }
  )
}
