'use server'

import { PermissionAction } from '@/lib/permissions'
import { type ActionResult, withAuth } from '@/lib/with-auth'
import {
  loadShareLinkTarget,
  shareKindPermission,
  toExpiryView,
} from '../Lib/shareLinkDocument.server'
import { type ShareExpiryView, shareLinkRefSchema } from '../Schema/shareLinkSchema'

/**
 * When one document's share link expires, for the link card. Worked out on
 * the server because the workshop's rule and its clock decide it.
 */
export async function getShareLinkExpiry(input: unknown): Promise<ActionResult<ShareExpiryView>> {
  const ref = shareLinkRefSchema.parse(input)
  return withAuth<ShareExpiryView>(
    async ({ organizationId }) => {
      const target = await loadShareLinkTarget(ref.kind, ref.id, organizationId)
      if (!target?.hasLink) throw new Error('Share link not found')
      return toExpiryView(target.expiry, target.rule, target.timeZone)
    },
    { requiredPermissions: shareKindPermission(ref.kind, PermissionAction.READ) }
  )
}
