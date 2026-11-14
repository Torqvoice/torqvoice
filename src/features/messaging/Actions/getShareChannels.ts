'use server'

import { canEmailCustomers } from '@/features/email/Lib/emailAllowance'
import { isCloudInstance } from '@/lib/cloud-instance'
import { getFeatures } from '@/lib/features'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { getOrgSmsProvider } from '@/lib/sms'
import { isWhatsappConfigured } from '@/lib/whatsapp'
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

      let whatsapp: ShareChannelStatus = 'not_in_plan'
      if (features.whatsapp) {
        const configured = await isWhatsappConfigured(organizationId).catch(() => false)
        whatsapp = configured ? 'ready' : 'not_connected'
      }

      // Every plan may mail its customers. The one refusal is a workshop that
      // connected its own mail provider on a plan that no longer includes it.
      const email: ShareChannelStatus = (await canEmailCustomers(organizationId))
        ? 'ready'
        : 'not_in_plan'

      return { email, sms, whatsapp, isCloud: isCloudInstance() }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.CUSTOMERS },
      ],
    }
  )
}
