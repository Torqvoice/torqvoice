'use server'

import { z } from 'zod'
import { countPortalUnread } from '@/features/portal/Lib/chat.server'
import { PORTAL_THREAD_MAX } from '@/features/portal/Lib/chatTypes'
import { type PortalResult, withPortalAuth } from '@/features/portal/Lib/portalAuth'
import { db } from '@/lib/db'

const schema = z.object({
  /** The workshop's messages on the customer's screen that were not read yet. */
  ids: z.array(z.string().min(1).max(64)).min(1).max(PORTAL_THREAD_MAX),
})

/**
 * The signed-in customer has these messages from the workshop in front of
 * them: each is stamped read. The chat calls it with the unread messages it
 * is showing, when the thread is on screen, never while it is hidden.
 *
 * Only the messages named are marked, never "everything unread": a reply
 * that arrived after the customer's last read of the thread, or an older one
 * they have not scrolled back to, has not been seen and stays counted on the
 * Messages tab. Whose thread it is comes from the session, so an id of
 * another customer's message, or of one the customer wrote themselves,
 * matches nothing.
 *
 * Answers how many were marked and how many are still unread, which is what
 * the badge then shows.
 */
export async function markPortalMessagesRead(
  input: unknown
): Promise<PortalResult<{ marked: number; unread: number }>> {
  return withPortalAuth(
    async ({ customerId, organizationId }) => {
      const { ids } = schema.parse(input)
      const result = await db.portalMessage.updateMany({
        where: {
          id: { in: [...new Set(ids)] },
          organizationId,
          customerId,
          direction: 'outbound',
          readAt: null,
        },
        data: { readAt: new Date() },
      })
      return { marked: result.count, unread: await countPortalUnread(organizationId, customerId) }
    },
    { writes: true }
  )
}
