import { z } from 'zod'
import { logAudit } from '@/lib/audit'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { apiError, apiOk, withApiAuth } from '@/lib/with-api-auth'
import { checkinJobFor } from '@/features/condition-map/Lib/checkinAccess.server'
import { equipmentEnabled } from '@/features/equipment/Lib/equipmentGate.server'
import { appJobEquipment, writeJobWorkOn } from '@/features/equipment/Lib/jobWorkOn.server'
import { MAX_WORK_ON } from '@/features/equipment/Schema/equipmentSchema'

/**
 * The equipment fitted to a job's vehicle (a crane, a tail lift) and which of
 * it the job works on, for the technician app. Named `vehicle-equipment` in
 * `src/lib/tech-api-features.ts`.
 *
 * GET answers `{ equipment }`, the same as the job: null while the workshop
 * records no equipment, else `{ items, workOn }`.
 * PUT takes `{ itemIds }`, the whole list the job works on (empty for none),
 * and answers `{ equipment }` as it now is. An item taken off the list takes
 * this job's readings of its meters with it, as on the web. The meters of the
 * items the job works on are read and written through `/jobs/:id/meters`.
 */

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiAuth(
    request,
    async (ctx) => {
      const { id } = await params
      const job = await checkinJobFor(ctx, id)
      if (!job) return apiError(404, 'not_found', 'That job is not on your list.')
      const equipment = await appJobEquipment(ctx.organizationId, job)
      return apiOk({ equipment })
    },
    {
      requireTechnician: true,
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SERVICES }],
    }
  )
}

const putSchema = z.object({
  itemIds: z.array(z.string().min(1)).max(MAX_WORK_ON),
})

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiAuth(
    request,
    async (ctx) => {
      const { id } = await params
      const job = await checkinJobFor(ctx, id)
      if (!job) return apiError(404, 'not_found', 'That job is not on your list.')
      if (!(await equipmentEnabled(ctx.organizationId))) {
        return apiError(404, 'not_found', 'This workshop does not record equipment.')
      }
      const parsed = putSchema.safeParse(await request.json().catch(() => null))
      if (!parsed.success) {
        return apiError(400, 'invalid_request', 'Send itemIds: the equipment the job works on.')
      }
      let result
      try {
        result = await writeJobWorkOn({
          organizationId: ctx.organizationId,
          jobId: job.id,
          itemIds: parsed.data.itemIds,
        })
      } catch (error) {
        const name = error instanceof Error ? error.name : ''
        if (name === 'DocumentLockedError') {
          return apiError(409, 'document_locked', (error as Error).message)
        }
        // An item that is not on this job's vehicle, or one removed from it.
        if (error instanceof Error && error.message === 'Equipment not found') {
          return apiError(404, 'not_found', 'That equipment is not on this job’s vehicle.')
        }
        throw error
      }
      await logAudit(ctx, {
        action: 'service.update',
        entity: 'ServiceRecord',
        entityId: result.jobId,
        details: { key: 'service_update', params: { ref: result.jobRef } },
        metadata: {
          serviceRecordId: result.jobId,
          via: 'tech-equipment',
          equipmentItemIds: result.itemIds,
        },
      })
      return apiOk({ equipment: await appJobEquipment(ctx.organizationId, job) })
    },
    {
      requireTechnician: true,
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
    }
  )
}
