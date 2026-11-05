'use server'

import { revalidatePath } from 'next/cache'
import { resolveDocumentLocale } from '@/i18n/locale-from-request'
import { logAudit } from '@/lib/audit'
import { db } from '@/lib/db'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'
import { faultLine } from '../Lib/codes'
import { findingWebhookFields } from '../Lib/findings'
import { lookupMeanings, vehicleForCodes } from '../Lib/service.server'
import { addFaultCodeFindingsSchema } from '../Schema/faultCodeSchema'

/**
 * Typed or pasted codes become findings on the job's vehicle, one each, with
 * the meaning as it reads right now saved on the finding in the workshop's
 * language, so prints and history never wait on the code service. When the
 * service does not answer, the codes are saved all the same and their
 * meaning can be taken later. A code already on this job is not added twice.
 */
export async function addFaultCodeFindings(input: unknown) {
  return withAuth(
    async (ctx) => {
      const { organizationId } = ctx
      const data = addFaultCodeFindingsSchema.parse(input)
      const job = await db.serviceRecord.findFirst({
        where: { id: data.serviceRecordId, organizationId },
        select: { id: true, vehicleId: true },
      })
      if (!job) throw new Error('Work order not found')
      if (!job.vehicleId) throw new Error('This job has no vehicle to record a fault code against')
      if (data.concernId) {
        const concern = await db.serviceConcern.findFirst({
          where: { id: data.concernId, serviceRecordId: job.id, serviceRecord: { organizationId } },
          select: { id: true },
        })
        if (!concern) throw new Error('Concern not found')
      }

      // One row per code, the first status and module given for it kept.
      const wanted = new Map<string, { status: string | null; module: string | null }>()
      for (const c of data.codes) {
        if (!wanted.has(c.code))
          wanted.set(c.code, { status: c.status ?? null, module: c.module || null })
      }
      const already = await db.vehicleFinding.findMany({
        where: {
          serviceRecordId: job.id,
          vehicle: { organizationId },
          faultCode: { in: [...wanted.keys()] },
        },
        select: { faultCode: true },
      })
      for (const row of already) if (row.faultCode) wanted.delete(row.faultCode)
      if (wanted.size === 0) return { added: 0, skipped: data.codes.length, findings: [] }

      const [vehicle, locale] = await Promise.all([
        vehicleForCodes(organizationId, job.vehicleId),
        resolveDocumentLocale(organizationId),
      ])
      const { results } = await lookupMeanings(organizationId, [...wanted.keys()], vehicle, locale)
      const meanings = new Map(results.map((r) => [r.code, r]))

      const findings = await db.$transaction(
        [...wanted].map(([code, extra]) => {
          const view = meanings.get(code)
          const meaning = view?.state === 'found' ? view.title : null
          return db.vehicleFinding.create({
            data: {
              description: faultLine(code, meaning),
              severity: data.severity,
              vehicleId: job.vehicleId as string,
              serviceRecordId: job.id,
              concernId: data.concernId ?? null,
              faultCode: code,
              faultStatus: extra.status,
              faultModule: extra.module,
              faultMeaning: meaning,
              faultMeaningSource: meaning ? (view?.source ?? null) : null,
            },
          })
        })
      )

      // One audit row, and one finding.create webhook, per finding, the same
      // as adding them one at a time.
      for (const finding of findings) {
        void logAudit(ctx, {
          action: 'finding.create',
          entity: 'VehicleFinding',
          entityId: finding.id,
          details: {
            key: 'finding_create',
            params: { description: finding.description, vehicleId: finding.vehicleId },
          },
          metadata: {
            findingId: finding.id,
            vehicleId: finding.vehicleId,
            ...findingWebhookFields(finding),
          },
        })
      }
      revalidatePath(`/vehicles/${job.vehicleId}`)
      revalidatePath('/')
      return {
        added: findings.length,
        skipped: data.codes.length - findings.length,
        findings: findings.map((f) => ({ id: f.id, code: f.faultCode, meaning: f.faultMeaning })),
      }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES },
      ],
    }
  )
}
