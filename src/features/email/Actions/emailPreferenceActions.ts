'use server'

import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { attachPdfDefault } from '@/features/email/Lib/documentEmail'

/**
 * What the send dialogs start with: the workshop's own answer to "attach the
 * PDF, or send the link". Read when a dialog opens rather than threaded down
 * through every page that can send a document.
 */
export async function getAttachPdfDefault() {
  return withAuth(
    async ({ organizationId }) => {
      const setting = await db.appSetting.findFirst({
        where: { organizationId, key: SETTING_KEYS.EMAIL_ATTACH_PDF },
        select: { value: true },
      })
      return {
        attachPdf: attachPdfDefault(
          setting ? { [SETTING_KEYS.EMAIL_ATTACH_PDF]: setting.value } : {}
        ),
      }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.CUSTOMERS },
      ],
    }
  )
}
