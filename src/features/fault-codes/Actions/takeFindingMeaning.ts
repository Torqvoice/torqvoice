'use server'

import { revalidatePath } from 'next/cache'
import { resolveDocumentLocale } from '@/i18n/locale-from-request'
import { db } from '@/lib/db'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'
import { faultLine } from '../Lib/codes'
import { findingWebhookFields } from '../Lib/findings'
import { lookupMeanings, vehicleForCodes } from '../Lib/service.server'
import { takeFindingMeaningSchema } from '../Schema/faultCodeSchema'

/**
 * One tap on "Updated meaning": the finding takes the code's meaning as it
 * reads now. A description the technician wrote in their own words is left
 * as it is; only the one the app wrote from the code and the old meaning
 * follows.
 */
export async function takeFindingMeaning(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const { findingId } = takeFindingMeaningSchema.parse(input)
      const finding = await db.vehicleFinding.findFirst({
        where: { id: findingId, vehicle: { organizationId }, faultCode: { not: null } },
        select: {
          id: true,
          vehicleId: true,
          description: true,
          faultCode: true,
          faultMeaning: true,
        },
      })
      if (!finding?.faultCode) throw new Error('Finding not found')
      const [vehicle, locale] = await Promise.all([
        vehicleForCodes(organizationId, finding.vehicleId),
        resolveDocumentLocale(organizationId),
      ])
      const { results } = await lookupMeanings(organizationId, [finding.faultCode], vehicle, locale)
      const now = results[0]
      if (now?.state !== 'found' || !now.title) {
        throw new Error('The meaning is not available right now')
      }
      const ownWords =
        finding.description !== finding.faultCode &&
        finding.description !== faultLine(finding.faultCode, finding.faultMeaning)
      const updated = await db.vehicleFinding.update({
        where: { id: finding.id },
        data: {
          faultMeaning: now.title,
          faultMeaningSource: now.source,
          ...(ownWords ? {} : { description: faultLine(finding.faultCode, now.title) }),
        },
      })
      revalidatePath(`/vehicles/${finding.vehicleId}`)
      return updated
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES },
      ],
      audit: ({ result }) => ({
        action: 'finding.update',
        entity: 'VehicleFinding',
        entityId: result.id,
        details: { key: 'finding_update', params: { description: result.description } },
        metadata: {
          findingId: result.id,
          vehicleId: result.vehicleId,
          ...findingWebhookFields(result),
        },
      }),
    }
  )
}
