import { unlink } from 'node:fs/promises'
import path from 'node:path'
import { db } from '@/lib/db'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { apiError, apiOk, withApiAuth } from '@/lib/with-api-auth'

/**
 * Removes a photo from a job.
 *
 * A technician photographing a dark wheel arch takes three before one is
 * usable, and without this the other two stay on the job forever and end up
 * in front of the customer. Being able to take a photo and not being able to
 * remove it is a worse position than not taking one.
 *
 * The row goes first and the file second. A row without its file renders as a
 * broken image the technician can at least delete again; a file without its
 * row is invisible and stays on disk forever.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  return withApiAuth(
    request,
    async (ctx) => {
      const { id, attachmentId } = await params

      // Scoped through the job, so an id from another workshop finds nothing
      // rather than deleting somebody else's evidence.
      const attachment = await db.serviceAttachment.findFirst({
        where: {
          id: attachmentId,
          serviceRecord: {
            id,
            organizationId: ctx.organizationId,
            ...(ctx.isAdmin ? {} : { technicianId: { in: ctx.technicianIds } }),
          },
        },
        select: { id: true, fileUrl: true },
      })
      if (!attachment) return apiError(404, 'not_found', 'That photo is not on this job.')

      await db.serviceAttachment.delete({ where: { id: attachment.id } })

      // Best effort. The photo is already gone as far as anyone can tell, and
      // failing the request over a file that could not be unlinked would leave
      // the technician retrying a deletion that already happened.
      const filename = attachment.fileUrl.split('/').pop()
      if (filename && !filename.includes('..') && !filename.includes('/')) {
        await unlink(
          path.join(process.cwd(), 'data', 'uploads', ctx.organizationId, 'services', filename)
        ).catch(() => {
          /* already gone, or never written */
        })
      }

      return apiOk({ deleted: true })
    },
    {
      requireTechnician: true,
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
    }
  )
}
