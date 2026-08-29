import { z } from 'zod'
import { db } from '@/lib/db'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { apiError, apiOk, withApiAuth } from '@/lib/with-api-auth'

/**
 * Appends to the job's internal notes.
 *
 * Appends rather than replaces, deliberately. These notes are shared: the
 * office writes in them too, and a phone that sends the whole field back would
 * silently overwrite whatever was added while the technician had the screen
 * open. Losing a colleague's note is worse than an untidy one.
 *
 * `diagnosticNotes` is the internal field, not `invoiceNotes`, because a
 * technician writing "customer says the noise only happens when cold" is
 * recording something for the shop. Whether any of it reaches the customer is
 * the office's decision, made on the web.
 */
const bodySchema = z.object({
  note: z.string().min(1).max(2000),
})

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiAuth(
    request,
    async (ctx) => {
      const { id } = await params
      const { note } = bodySchema.parse(await request.json())

      const job = await db.serviceRecord.findFirst({
        where: {
          id,
          organizationId: ctx.organizationId,
          ...(ctx.isAdmin ? {} : { technicianId: { in: ctx.technicianIds } }),
        },
        select: { id: true, diagnosticNotes: true },
      })
      if (!job) return apiError(404, 'not_found', 'That job is not on your list.')

      const technician = await db.technician.findFirst({
        where: { id: { in: ctx.technicianIds } },
        select: { name: true },
      })

      // Stamped, because a shared field with several authors and no
      // attribution becomes unreadable within a week. The web editor stores
      // HTML, so this matches rather than injecting bare newlines into it.
      const stamp = new Date().toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
      })
      const line = `<p><strong>${technician?.name ?? 'Technician'}, ${stamp}:</strong> ${escapeHtml(note.trim())}</p>`

      const updated = await db.serviceRecord.update({
        where: { id: job.id },
        data: { diagnosticNotes: job.diagnosticNotes ? `${job.diagnosticNotes}${line}` : line },
        select: { id: true, diagnosticNotes: true },
      })

      return apiOk({ diagnosticNotes: updated.diagnosticNotes }, 201)
    },
    {
      requireTechnician: true,
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
    }
  )
}

/**
 * The note is typed by a person and stored in a field the web renders as HTML,
 * so it has to be escaped on the way in. Otherwise a technician writing
 * "pads < 2mm" produces markup nobody can see and a bug nobody can explain.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
