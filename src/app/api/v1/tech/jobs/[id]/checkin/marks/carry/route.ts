import { logAudit } from '@/lib/audit'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { apiError, apiOk, withApiAuth } from '@/lib/with-api-auth'
import { carryMarks } from '@/features/condition-map/Lib/markStore.server'
import { checkinMarkList } from '@/features/condition-map/Lib/checkin.server'
import {
  answeringRefusals,
  appLocale,
  checkinJobFor,
} from '@/features/condition-map/Lib/checkinAccess.server'

/**
 * Every mark still open from an earlier visit, confirmed as still there:
 * each is recorded again on this job's check-in and the earlier one closed,
 * as the web's "Still there" does. Safe to send twice.
 *
 * The job's right covers it here, as with clearing a mark: the technician
 * is checking in a job they are on, and only that job's vehicle is touched.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiAuth(
    request,
    async (ctx) => {
      const { id } = await params
      const job = await checkinJobFor(ctx, id)
      if (!job) return apiError(404, 'not_found', 'That job is not on your list.')

      return answeringRefusals(async () => {
        const { marks: created } = await carryMarks(ctx.organizationId, ctx.userId, {
          vehicleId: job.vehicleId,
          serviceRecordId: job.id,
        })
        if (created.length > 0) {
          await logAudit(ctx, {
            action: 'conditionMark.carry',
            entity: 'Vehicle',
            entityId: job.vehicleId,
            details: { key: 'condition_mark_carry', params: { count: created.length } },
            metadata: { vehicleId: job.vehicleId, serviceRecordId: job.id, via: 'tech-checkin' },
          })
        }
        const marks = await checkinMarkList(
          ctx.organizationId,
          job.vehicleId,
          job.scope,
          await appLocale(request, ctx.organizationId)
        )
        return apiOk({ carried: created.length, marks })
      })
    },
    {
      requireTechnician: true,
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
    }
  )
}
