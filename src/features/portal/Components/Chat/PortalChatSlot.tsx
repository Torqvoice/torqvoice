import { getCustomerSession } from '@/lib/customer-session'
import { getPortalThreadEvents, portalEventsSince } from '../../Lib/chat.server'
import {
  PORTAL_THREAD_STEP,
  type PortalChatEvent,
  type PortalChatMessage,
} from '../../Lib/chatTypes'
import { portalClock } from '../../Lib/workshop.server'
import { PortalChatPanel } from './PortalChatPanel'

/**
 * The chat, ready to place: the server half that reads how the workshop
 * prints its times and hands the thread to the panel. The home page passes
 * the result to the theme's Home as its `chat` slot; the Messages page fills
 * the screen with it.
 *
 * It also reads what happened around those messages (work started, an
 * update, a quote, an invoice) for the signed-in customer, so the thread is
 * whole on first paint. If that read fails the thread is drawn without them
 * and the chat's first poll brings them.
 */
export async function PortalChatSlot({
  orgParam,
  organizationId,
  workshopName,
  callHref,
  enabled,
  messages,
  variant = 'panel',
}: {
  orgParam: string
  organizationId: string
  workshopName: string
  callHref: string | null
  enabled: boolean
  messages: PortalChatMessage[]
  variant?: 'panel' | 'page'
}) {
  const [clock, events] = await Promise.all([
    portalClock(organizationId),
    threadEvents(organizationId, orgParam, messages),
  ])
  return (
    <PortalChatPanel
      orgParam={orgParam}
      workshopName={workshopName}
      callHref={callHref}
      enabled={enabled}
      initialMessages={messages}
      initialEvents={events}
      clock={clock}
      variant={variant}
    />
  )
}

/** The thread's events for whoever is signed in to this workshop; none for anyone else. */
async function threadEvents(
  organizationId: string,
  orgParam: string,
  messages: PortalChatMessage[]
): Promise<PortalChatEvent[] | undefined> {
  try {
    const session = await getCustomerSession()
    if (!session || session.organizationId !== organizationId) return undefined
    return await getPortalThreadEvents(organizationId, session.customerId, orgParam, {
      // Whether older messages exist is not known here; a full page says "probably".
      since: portalEventsSince(messages, { moreMessages: messages.length >= PORTAL_THREAD_STEP }),
    })
  } catch (error) {
    console.error('[portal chat] events for the first paint:', error)
    return undefined
  }
}
