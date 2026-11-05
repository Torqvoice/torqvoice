'use server'

import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'
import { draftPhotoUrl, listDraftPhotos } from '../Lib/fixDrafts.server'
import { fixDraftSchema } from '../Schema/faultCodeSchema'

/** The photos a phone has added to this fix's draft, for the dialog to show. */
export async function listFixDraftPhotos(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = fixDraftSchema.parse(input)
      const names = await listDraftPhotos(organizationId, data.draftId)
      return names.map((name) => ({ id: name, url: draftPhotoUrl(organizationId, name) }))
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES },
      ],
    }
  )
}
