'use server'

import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { revalidatePath } from 'next/cache'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { releaseFiles } from '@/lib/files/manager'

export async function deleteQuoteAttachment(attachmentId: string) {
  return withAuth(
    async ({ organizationId }) => {
      const attachment = await db.quoteAttachment.findFirst({
        where: {
          id: attachmentId,
          quote: { organizationId },
        },
        include: {
          quote: { select: { id: true } },
        },
      })
      if (!attachment) throw new Error('Attachment not found')

      await db.quoteAttachment.delete({ where: { id: attachmentId } })
      // The file once its row is gone, unless something still uses it.
      await releaseFiles([attachment.fileUrl], {
        organizationId,
        reason: 'quote attachment deleted',
      })

      revalidatePath(`/quotes/${attachment.quote.id}`)
      return { deleted: true }
    },
    {
      requiredPermissions: [
        {
          action: PermissionAction.UPDATE,
          subject: PermissionSubject.QUOTES,
        },
      ],
    }
  )
}
