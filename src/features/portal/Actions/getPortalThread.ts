'use server'

import { z } from 'zod'
import {
  getPortalThreadEvents,
  getPortalThreadPreview,
  isPortalChatOpen,
  portalEventsSince,
} from '@/features/portal/Lib/chat.server'
import {
  PORTAL_EVENT_DAYS,
  PORTAL_EVENT_MAX_DAYS,
  PORTAL_THREAD_MAX,
  PORTAL_THREAD_STEP,
  type PortalThread,
} from '@/features/portal/Lib/chatTypes'
import { type PortalResult, withPortalAuth } from '@/features/portal/Lib/portalAuth'
import { db } from '@/lib/db'
import { resolvePortalOrg } from '@/lib/portal-slug'

const schema = z.string().min(1).max(100)
/** How many of the latest messages to read: it grows as the customer asks for earlier ones. */
const limitSchema = z.number().int().min(1).max(PORTAL_THREAD_MAX).optional()

/**
 * The signed-in customer's own thread with the workshop: the latest
 * messages, what happened to their cars and papers around them, and how many
 * messages from the workshop they have not opened. The chat asks for it every
 * few seconds while it is on screen.
 *
 * Whose thread is read comes from the session alone. `orgParam` is only what
 * the links inside it are written with, and it must name the session's own
 * workshop. Reading marks nothing read: `markPortalThreadRead` does that,
 * once the customer has the thread in front of them.
 */
export async function getPortalThread(
  orgParam: unknown,
  limit?: unknown
): Promise<PortalResult<PortalThread>> {
  return withPortalAuth(async ({ customerId, organizationId }) => {
    const param = schema.parse(orgParam)
    const org = await resolvePortalOrg(param)
    if (!org || org.id !== organizationId) throw new Error('Not authenticated')

    const take = limitSchema.parse(limit)
    const [preview, total, enabled] = await Promise.all([
      getPortalThreadPreview(organizationId, customerId, take),
      db.portalMessage.count({ where: { organizationId, customerId } }),
      isPortalChatOpen(organizationId),
    ])
    const moreMessages = total > preview.messages.length
    // Each "Show earlier" brings a page of messages and a month of events.
    const days = Math.min(
      Math.ceil((take ?? PORTAL_THREAD_STEP) / PORTAL_THREAD_STEP) * PORTAL_EVENT_DAYS,
      PORTAL_EVENT_MAX_DAYS
    )
    const now = new Date()
    const since = portalEventsSince(preview.messages, { moreMessages, days, now })
    // Read to the furthest the thread ever goes, to know whether anything
    // waits behind "Show earlier"; only what is inside the window is drawn.
    const all = await getPortalThreadEvents(organizationId, customerId, param, {
      since: new Date(now.getTime() - PORTAL_EVENT_MAX_DAYS * 86_400_000),
      now,
    })
    const events = all.filter((event) => new Date(event.at) >= since)
    const hasEarlier = moreMessages || events.length < all.length
    return {
      enabled,
      unread: preview.unread,
      messages: preview.messages,
      events,
      hasEarlier,
    }
  })
}
