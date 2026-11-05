'use server'

import { createFixHandoffToken } from '@/lib/photo-handoff'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'
import { fixPhoneLinkSchema } from '../Schema/faultCodeSchema'

/**
 * The phone code in the share dialog: a signed link, good for 30 minutes,
 * that lets a phone add photos to this fix's draft without signing in.
 */
export async function createFixPhoneLink(input: unknown) {
  return withAuth(
    async ({ organizationId, userId }) => {
      const data = fixPhoneLinkSchema.parse(input)
      const { token, expiresAt } = createFixHandoffToken({
        organizationId,
        code: data.code,
        draftId: data.draftId,
        userId,
      })
      return { token, expiresAt: expiresAt.toISOString() }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES },
      ],
    }
  )
}
