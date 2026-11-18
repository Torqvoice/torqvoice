'use server'

import { resolveDocumentLocale } from '@/i18n/locale-from-request'
import { db } from '@/lib/db'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'
import { lookupMeanings, vehicleForCodes } from '../Lib/service.server'
import { checkFindingMeaningsSchema } from '../Schema/faultCodeSchema'

/**
 * For the job's code findings, what each code means now against what the
 * finding saved when it was added. A finding whose meaning has changed since
 * (or that was added while the service was away) gets an "Updated meaning"
 * chip on an open job; the saved text itself never changes on its own.
 */
export async function checkFindingMeanings(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const { serviceRecordId } = checkFindingMeaningsSchema.parse(input)
      const job = await db.serviceRecord.findFirst({
        where: { id: serviceRecordId, organizationId },
        select: { id: true, vehicleId: true },
      })
      if (!job?.vehicleId) return { available: false, findings: [] }
      const findings = await db.vehicleFinding.findMany({
        where: {
          serviceRecordId: job.id,
          vehicle: { organizationId },
          faultCode: { not: null },
          status: { not: 'resolved' },
        },
        select: { id: true, faultCode: true, faultMeaning: true },
      })
      if (findings.length === 0) return { available: true, findings: [] }
      const [vehicle, locale] = await Promise.all([
        vehicleForCodes(organizationId, job.vehicleId),
        resolveDocumentLocale(organizationId),
      ])
      const { available, results } = await lookupMeanings(
        organizationId,
        findings.map((f) => f.faultCode as string),
        vehicle,
        locale
      )
      const byCode = new Map(results.map((r) => [r.code, r]))
      return {
        available,
        findings: findings.map((f) => {
          const now = byCode.get(f.faultCode as string)
          const current = now?.state === 'found' ? now.title : null
          return {
            findingId: f.id,
            code: f.faultCode as string,
            current,
            source: now?.source ?? null,
            changed: current !== null && current !== (f.faultMeaning ?? null),
          }
        }),
      }
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }],
    }
  )
}
