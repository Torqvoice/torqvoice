import { z } from 'zod'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { apiError, apiOk, withApiAuth } from '@/lib/with-api-auth'
import { stopEntry, TimeEntryError } from '@/features/time-tracking/Lib/timeEntries'

const bodySchema = z.object({
  note: z.string().max(500).optional(),
})

/** Stop whatever this technician has running. */
export async function POST(request: Request) {
  return withApiAuth(
    request,
    async (ctx) => {
      // A stop with no body is the common case: the button sends nothing.
      const raw = await request.text()
      const { note } = bodySchema.parse(raw ? JSON.parse(raw) : {})

      try {
        const entry = await stopEntry({
          organizationId: ctx.organizationId,
          technicianIds: ctx.technicianIds,
          note,
        })
        return apiOk({ entry })
      } catch (err) {
        if (err instanceof TimeEntryError && err.code === 'not_running') {
          // Not an error worth a red screen: the app and the server simply
          // disagreed about a clock that is already stopped either way.
          return apiError(409, 'conflict', err.message)
        }
        throw err
      }
    },
    {
      requireTechnician: true,
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
    }
  )
}
