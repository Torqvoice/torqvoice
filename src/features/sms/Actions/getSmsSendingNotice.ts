'use server'

import { getPlatformSmsAllowance } from '@/lib/sms'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'

/**
 * What a compose dialog should say before a text goes out: when the workshop
 * sends from the platform's shared number, how many texts a day that is.
 * Null when it has its own provider, or no SMS at all.
 */
export async function getSmsSendingNotice() {
  return withAuth(
    async ({ organizationId }) => ({
      platformSmsPerDay: await getPlatformSmsAllowance(organizationId),
    }),
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.CUSTOMERS },
      ],
    }
  )
}
