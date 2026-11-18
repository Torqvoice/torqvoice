'use server'

import { countPortalUnread } from '@/features/portal/Lib/chat.server'
import { type PortalResult, withPortalAuth } from '@/features/portal/Lib/portalAuth'

/**
 * How many messages from the workshop the signed-in customer has not opened:
 * the number on the Messages tab, asked for now and then on every portal
 * page. Takes nothing: whose count it is comes from the session.
 */
export async function getPortalUnread(): Promise<PortalResult<{ unread: number }>> {
  return withPortalAuth(async ({ customerId, organizationId }) => ({
    unread: await countPortalUnread(organizationId, customerId),
  }))
}
