'use server'

import { z } from 'zod'
import {
  PORTAL_MESSAGE_SELECT,
  isPortalChatOpen,
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
import { ownPortalUploadUrl } from '@/features/portal/Lib/portalUploadOwner.server'
import { isRestoring } from '@/lib/backup/freeze'
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
 * the portal itself), when it is empty, when a file in it is not one this
 * customer uploaded themselves, while the workshop is being restored from a
 * backup, and when the customer is sending faster than a person types. The workshop is told the way it is told about a text
 * message: a notification that opens the thread in its inbox.
 */
export async function sendPortalMessage(input: unknown): Promise<PortalResult<PortalChatMessage>> {
  return withPortalAuth(async ({ customerId, organizationId }) => {
    // While a restore replaces this workshop's rows, nothing is written: the
    // message would be lost under it. Said with a code of the chat's own, so
    // the customer reads why in their language and can send it again.
    if (isRestoring(organizationId)) throw refuse('restoring')

    const data = schema.parse(input)
    if (!data.body && data.attachments.length === 0) throw refuse('empty')

    // Only files this customer uploaded themselves. A file of the workshop's
    // portal folder is not enough: the file route serves a file to whoever
    // has a message that mentions it, so attaching someone else's upload
    // would be a way to read it.
    const attachments = data.attachments.map((url) => {
      const stored = ownPortalUploadUrl(url, organizationId, customerId)
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
