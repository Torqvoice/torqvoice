'use server'

import { isCloudInstance } from '@/lib/cloud-instance'
import { getFeatures } from '@/lib/features'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { getOrgSmsProvider } from '@/lib/sms'
import { withAuth } from '@/lib/with-auth'

/**
 * Why a channel can or cannot carry a share link right now. The plan comes
 * first: a workshop whose plan has no SMS gains nothing from being told to
 * connect a provider.
 */
export type ShareChannelStatus = 'ready' | 'not_connected' | 'not_in_plan'

/**
 * What the share dialogs need to draw their channels: every channel is shown,
 * and one that cannot send says why instead of being left out, so a workshop
 * learns the option exists and where to turn it on.
 */
export async function getShareChannels() {
  return withAuth(
    async ({ organizationId }) => {
      const features = await getFeatures(organizationId)

      let sms: ShareChannelStatus = 'not_in_plan'
      if (features.sms) {
        const provider = await getOrgSmsProvider(organizationId).catch(() => null)
        sms = provider ? 'ready' : 'not_connected'
      }

      return { sms, isCloud: isCloudInstance() }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.CUSTOMERS },
      ],
    }
  )
}
