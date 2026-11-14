'use server'

import { canEmailCustomers } from '@/features/email/Lib/emailAllowance'
import { isCloudInstance } from '@/lib/cloud-instance'
import { db } from '@/lib/db'
import { getFeatures } from '@/lib/features'
import { getOrgSmsProvider } from '@/lib/sms'
import { isWhatsappConfigured } from '@/lib/whatsapp'
import { withAuth } from '@/lib/with-auth'

/**
 * Why a channel can or cannot carry a share link right now. The plan comes
 * first: a workshop whose plan has no SMS gains nothing from being told to
 * connect a provider.
 */
export type ShareChannelStatus = 'ready' | 'not_connected' | 'not_in_plan' | 'turned_off'

/**
 * What the share dialogs need to draw their channels: every channel is shown,
 * and one that cannot send says why instead of being left out, so a workshop
 * learns the option exists and where to turn it on.
 *
 * Open to every member: it says only what the workshop has set up, nothing
 * about any customer, and someone allowed to send a quote must be able to
 * see which ways it can go.
 */
export async function getShareChannels() {
  return withAuth(async ({ organizationId }) => {
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
    // The workshop's own switch is asked first: with email turned off the
    // send is refused whatever the plan says.
    const emailSwitch = await db.appSetting.findUnique({
      where: { organizationId_key: { organizationId, key: 'workshop.emailEnabled' } },
      select: { value: true },
    })
    const email: ShareChannelStatus =
      emailSwitch?.value === 'false'
        ? 'turned_off'
        : (await canEmailCustomers(organizationId))
          ? 'ready'
          : 'not_in_plan'

    return { email, sms, whatsapp, isCloud: isCloudInstance() }
  })
}
