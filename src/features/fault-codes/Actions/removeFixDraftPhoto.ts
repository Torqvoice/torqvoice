'use server'

import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'
import { removeDraftPhoto } from '../Lib/fixDrafts.server'
import { fixDraftPhotoSchema } from '../Schema/faultCodeSchema'

/** Takes one phone photo out of the fix's draft before it is shared. */
export async function removeFixDraftPhoto(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = fixDraftPhotoSchema.parse(input)
      await removeDraftPhoto(organizationId, data.draftId, data.photoId)
      return { removed: true }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES },
      ],
    }
  )
}
