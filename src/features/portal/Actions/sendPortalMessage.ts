'use server'

import { z } from 'zod'
import {
  PORTAL_MESSAGE_SELECT,
  isPortalChatOpen,
  ownPortalUpload,
  portalSendAllowed,
  toPortalChatMessage,
} from '@/features/portal/Lib/chat.server'
import {
  PORTAL_MESSAGE_MAX_LENGTH,
  PORTAL_MESSAGE_MAX_PHOTOS,
  type PortalChatError,
  type PortalChatMessage,
} from '@/features/portal/Lib/chatTypes'
import { type PortalResult, withPortalAuth } from '@/features/portal/Lib/portalAuth'
import { db } from '@/lib/db'
import { notify } from '@/lib/notify'

const schema = z.object({
  body: z.string().trim().max(PORTAL_MESSAGE_MAX_LENGTH).default(''),
  /** Stored urls, as the portal's upload route answered them. */
  attachments: z.array(z.string().max(300)).max(PORTAL_MESSAGE_MAX_PHOTOS).default([]),
})

/** A refusal the chat knows how to say; anything else reads as "could not send". */
const refuse = (code: PortalChatError) => new Error(code)

/**
 * The signed-in customer writes to the workshop: text, photos, or both.
 *
 * Who writes and to which workshop come from the session, never from the
 * input. The message is refused when the workshop has turned the chat off (or
 * the portal itself), when it is empty, when a file in it is not an upload in
 * this workshop's portal folder, and when the customer is sending faster
 * than a person types. The workshop is told the way it is told about a text
 * message: a notification that opens the thread in its inbox.
 */
export async function sendPortalMessage(input: unknown): Promise<PortalResult<PortalChatMessage>> {
  return withPortalAuth(async ({ customerId, organizationId }) => {
    const data = schema.parse(input)
    if (!data.body && data.attachments.length === 0) throw refuse('empty')

    const attachments = data.attachments.map((url) => {
      const stored = ownPortalUpload(organizationId, url)
      if (!stored) throw refuse('not_yours')
      return stored
    })

    if (!(await isPortalChatOpen(organizationId))) throw refuse('chat_off')
    if (!(await portalSendAllowed(organizationId, customerId))) throw refuse('too_fast')

    // The session outlives a customer who was removed; their message must not.
    const customer = await db.customer.findFirst({
      where: { id: customerId, organizationId },
      select: { id: true, name: true },
    })
    if (!customer) throw new Error('Not authenticated')

    const row = await db.portalMessage.create({
      data: {
        direction: 'inbound',
        body: data.body,
        attachments,
        organizationId,
        customerId: customer.id,
      },
      select: PORTAL_MESSAGE_SELECT,
    })

    // notify never throws: a workshop that cannot be told still has the
    // message waiting in its inbox, counted on the sidebar.
    await notify({
      organizationId,
      type: 'portal_inbound',
      title: 'New message in the customer portal',
      message: `${customer.name}: ${data.body ? data.body.slice(0, 100) : '[photo]'}`,
      entityType: 'portal_message',
      entityId: row.id,
      entityUrl: `/messages?channel=portal&customerId=${customer.id}`,
    })

    return toPortalChatMessage(organizationId, row)
  })
}
