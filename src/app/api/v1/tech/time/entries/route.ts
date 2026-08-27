import { z } from 'zod'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { apiOk, withApiAuth } from '@/lib/with-api-auth'
import { listEntries } from '@/features/time-tracking/Lib/timeEntries'

const querySchema = z.object({
  // The phone sends the range because it knows the technician's timezone and
  // the server does not. A shift starting at 22:00 belongs to whichever day
  // the person working it says it does.
  from: z.iso.datetime(),
  to: z.iso.datetime(),
})

/** What this technician clocked in a window, for the app's day summary. */
export async function GET(request: Request) {
  return withApiAuth(
    request,
    async (ctx) => {
      const url = new URL(request.url)
      const { from, to } = querySchema.parse({
        from: url.searchParams.get('from'),
        to: url.searchParams.get('to'),
      })

      const entries = await listEntries({
        organizationId: ctx.organizationId,
        technicianIds: ctx.technicianIds,
        from: new Date(from),
        to: new Date(to),
      })

      const totalMinutes = entries.reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0)

      return apiOk({ entries, totalMinutes })
    },
    {
      requireTechnician: true,
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SERVICES }],
    }
  )
}
