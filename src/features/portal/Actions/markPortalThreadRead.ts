'use server'

import { type PortalResult, withPortalAuth } from '@/features/portal/Lib/portalAuth'
import { db } from '@/lib/db'

/**
 * The signed-in customer has the thread in front of them: every message from
 * the workshop they had not opened is stamped read. The chat calls it when
 * the thread is on screen, never while it is hidden. Takes nothing: whose
 * thread it is comes from the session.
 */
export async function markPortalThreadRead(): Promise<PortalResult<{ marked: number }>> {
  return withPortalAuth(async ({ customerId, organizationId }) => {
    const result = await db.portalMessage.updateMany({
      where: { organizationId, customerId, direction: 'outbound', readAt: null },
      data: { readAt: new Date() },
    })
    return { marked: result.count }
  })
}
