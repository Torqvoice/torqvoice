import { logAudit } from '@/lib/audit'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { apiError, apiOk, withApiAuth } from '@/lib/with-api-auth'
import { markPatchSchema } from '@/features/condition-map/Lib/marks'
import { deleteMark, patchMark } from '@/features/condition-map/Lib/markStore.server'
import { checkinMarkList } from '@/features/condition-map/Lib/checkin.server'
import {
  answeringRefusals,
  appLocale,
  checkinJobFor,
  editableMark,
} from '@/features/condition-map/Lib/checkinAccess.server'

type Params = { params: Promise<{ id: string; markId: string }> }

/**
 * Change or remove a mark this job's check-in drew. A mark from an earlier
 * visit is that visit's record and is not changed from here: it is confirmed
 * as still there (carry) or cleared as repaired (resolve).
 */

const UPDATE_SERVICES = [{ action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES }]

export async function PATCH(request: Request, { params }: Params) {
  return withApiAuth(
    request,
    async (ctx) => {
      const { id, markId } = await params
      const job = await checkinJobFor(ctx, id)
      if (!job) return apiError(404, 'not_found', 'That job is not on your list.')
      if (!(await editableMark(ctx.organizationId, job, markId))) {
        return apiError(404, 'not_found', 'That mark is not on this check-in.')
      }
      const parsed = markPatchSchema.safeParse(await request.json().catch(() => null))
      if (!parsed.success) return apiError(400, 'invalid_request', 'That change is not valid.')

      return answeringRefusals(async () => {
        await patchMark(ctx.organizationId, markId, parsed.data)
        const marks = await checkinMarkList(
          ctx.organizationId,
          job.vehicleId,
          job.scope,
          await appLocale(request, ctx.organizationId)
        )
        return apiOk({ marks })
      })
    },
    { requireTechnician: true, requiredPermissions: UPDATE_SERVICES }
  )
}

export async function DELETE(request: Request, { params }: Params) {
  return withApiAuth(
    request,
    async (ctx) => {
      const { id, markId } = await params
      const job = await checkinJobFor(ctx, id)
      if (!job) return apiError(404, 'not_found', 'That job is not on your list.')
      if (!(await editableMark(ctx.organizationId, job, markId))) {
        return apiError(404, 'not_found', 'That mark is not on this check-in.')
      }

      return answeringRefusals(async () => {
        const mark = await deleteMark(ctx.organizationId, markId)
        await logAudit(ctx, {
          action: 'conditionMark.remove',
          entity: 'ConditionMark',
          entityId: mark.id,
          details: { key: 'condition_mark_remove' },
          metadata: { vehicleId: mark.vehicleId, serviceRecordId: job.id, via: 'tech-checkin' },
        })
        const marks = await checkinMarkList(
          ctx.organizationId,
          job.vehicleId,
          job.scope,
          await appLocale(request, ctx.organizationId)
        )
        return apiOk({ marks })
      })
    },
    { requireTechnician: true, requiredPermissions: UPDATE_SERVICES }
  )
}
