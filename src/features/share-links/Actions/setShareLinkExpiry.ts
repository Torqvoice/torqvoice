'use server'

import { revalidatePath } from 'next/cache'
import { auditDetails } from '@/lib/audit'
import { PermissionAction } from '@/lib/permissions'
import { type ActionResult, withAuth } from '@/lib/with-auth'
import { endOfWorkshopDay } from '@/lib/workshop-datetime'
import {
  loadShareLinkTarget,
  SHARE_KIND_ENTITY,
  shareKindPermission,
  toExpiryView,
  writeShareLinkColumns,
} from '../Lib/shareLinkDocument.server'
import { type ShareExpiryView, setShareLinkExpirySchema } from '../Schema/shareLinkSchema'

/**
 * Sets when one document's share link expires: by the workshop's rule, never,
 * or at the end of a day. The day is one on the workshop's calendar, and the
 * link works for the whole of it.
 *
 * Going back to the workshop's rule also starts that rule counting from now.
 * It is what "open again" on an expired link does, and without it a link
 * whose days had already run out would stay closed.
 */
export async function setShareLinkExpiry(input: unknown): Promise<ActionResult<ShareExpiryView>> {
  const data = setShareLinkExpirySchema.parse(input)
  return withAuth<ShareExpiryView>(
    async ({ organizationId }) => {
      const target = await loadShareLinkTarget(data.kind, data.id, organizationId)
      if (!target?.hasLink) throw new Error('Share link not found')

      if (data.choice === 'never') {
        await writeShareLinkColumns(data.kind, data.id, organizationId, {
          shareNeverExpires: true,
          shareExpiresAt: null,
        })
      } else if (data.choice === 'date') {
        const at = endOfWorkshopDay(data.date, target.timeZone)
        if (!at) throw new Error('Choose a date')
        if (at.getTime() < Date.now()) throw new Error('Choose a date that has not passed')
        await writeShareLinkColumns(data.kind, data.id, organizationId, {
          shareNeverExpires: false,
          shareExpiresAt: at,
        })
      } else {
        await writeShareLinkColumns(data.kind, data.id, organizationId, {
          shareNeverExpires: false,
          shareExpiresAt: null,
          shareRenewedAt: new Date(),
        })
      }

      const after = await loadShareLinkTarget(data.kind, data.id, organizationId)
      if (!after) throw new Error('Share link not found')
      revalidatePath(after.path)
      revalidatePath('/settings/share-links')
      return toExpiryView(after.expiry, after.rule, after.timeZone)
    },
    {
      requiredPermissions: shareKindPermission(data.kind, PermissionAction.UPDATE),
      audit: () => ({
        action: 'shareLink.expiry',
        entity: SHARE_KIND_ENTITY[data.kind],
        entityId: data.id,
        details:
          data.choice === 'date'
            ? auditDetails('share_link_expiry_date', { date: data.date ?? '' })
            : data.choice === 'never'
              ? auditDetails('share_link_expiry_never')
              : auditDetails('share_link_expiry_workshop'),
        metadata: { kind: data.kind, choice: data.choice, date: data.date ?? null },
      }),
    }
  )
}
