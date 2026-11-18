'use server'

import { withPortalAuth } from '@/features/portal/Lib/portalAuth'
import { gateTypeKey, isTypeKeyEnabled } from '@/features/vehicles/Lib/typeKeySetting'
import { db } from '@/lib/db'

/**
 * One inspection for the signed-in customer: one on their own vehicle in this
 * workshop, the same rule as the portal's list. Anyone else's is null.
 *
 * Photos are left out. They are served to a customer only through the shared
 * link's token route (/api/public/files/<token>/...), and a signed-in customer
 * has no token to open them with.
 */
export async function getPortalInspection(inspectionId: string) {
  return withPortalAuth(async ({ customerId, organizationId }) => {
    const inspection = await db.inspection.findFirst({
      where: {
        id: inspectionId,
        organizationId,
        vehicle: { customerId, organizationId },
      },
      select: {
        id: true,
        status: true,
        mileage: true,
        notes: true,
        completedAt: true,
        createdAt: true,
        publicToken: true,
        severityScale: true,
        country: true,
        nextTestDue: true,
        certificateNumber: true,
        vehicle: {
          select: {
            make: true,
            model: true,
            year: true,
            vin: true,
            licensePlate: true,
            hsn: true,
            tsn: true,
          },
        },
        template: { select: { name: true, severityScale: true, country: true } },
        items: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            name: true,
            section: true,
            sectionCode: true,
            code: true,
            sortOrder: true,
            condition: true,
            notes: true,
            inputType: true,
            unit: true,
            minValue: true,
            maxValue: true,
            measuredValue: true,
            textValue: true,
          },
        },
      },
    })
    if (!inspection) return null

    const [typeKeyEnabled, serviceTypeRow] = await Promise.all([
      isTypeKeyEnabled(organizationId),
      db.appSetting.findFirst({
        where: { organizationId, key: 'workshop.serviceType' },
        select: { value: true },
      }),
    ])
    return {
      ...inspection,
      serviceType: (serviceTypeRow?.value === 'marine' ? 'marine' : 'automotive') as
        | 'automotive'
        | 'marine',
      completedAt: inspection.completedAt?.toISOString() ?? null,
      createdAt: inspection.createdAt.toISOString(),
      nextTestDue: inspection.nextTestDue?.toISOString() ?? null,
      vehicle: gateTypeKey(inspection.vehicle, typeKeyEnabled),
    }
  })
}
