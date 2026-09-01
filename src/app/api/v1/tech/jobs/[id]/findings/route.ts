import { z } from 'zod'
import { db } from '@/lib/db'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { apiError, apiOk, withApiAuth } from '@/lib/with-api-auth'

/**
 * Records something the technician noticed that is not part of this job.
 *
 * A worn belt spotted while doing a clutch is the most perishable information
 * in a workshop: it is known for about ten seconds, by one person, with their
 * hands full. Anything that makes recording it slower than forgetting it means
 * it gets forgotten, which is why this takes a sentence and nothing else.
 *
 * The finding hangs off the vehicle, not the job, because it outlives the job.
 * `serviceRecordId` records where it was spotted so the history reads properly
 * later.
 */
const bodySchema = z.object({
  description: z.string().min(1).max(1000),
  severity: z.enum(['monitor', 'needs_work', 'urgent']).default('needs_work'),
  notes: z.string().max(2000).optional(),
})

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiAuth(
    request,
    async (ctx) => {
      const { id } = await params
      const body = bodySchema.parse(await request.json())

      const job = await db.serviceRecord.findFirst({
        where: {
          id,
          organizationId: ctx.organizationId,
          ...(ctx.isAdmin ? {} : { technicianId: { in: ctx.technicianIds } }),
        },
        select: { id: true, vehicleId: true },
      })
      if (!job) return apiError(404, 'not_found', 'That job is not on your list.')

      // A counter sale has no vehicle, and a finding with nothing to hang off
      // would be an orphan nobody ever sees again.
      if (!job.vehicleId) {
        return apiError(
          409,
          'conflict',
          'This job has no vehicle to record an observation against.'
        )
      }

      const finding = await db.vehicleFinding.create({
        data: {
          description: body.description,
          severity: body.severity,
          notes: body.notes,
          vehicleId: job.vehicleId,
          serviceRecordId: job.id,
        },
        select: {
          id: true,
          description: true,
          severity: true,
          status: true,
          notes: true,
          createdAt: true,
        },
      })

      return apiOk({ finding }, 201)
    },
    {
      requireTechnician: true,
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
    }
  )
}
