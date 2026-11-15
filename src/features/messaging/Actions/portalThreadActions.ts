'use server'

import { z } from 'zod'
import {
  PORTAL_MESSAGE_SELECT,
  isPortalChatOpen,
  workshopPortalUpload,
} from '@/features/portal/Lib/chat.server'
import {
  PORTAL_MESSAGE_MAX_LENGTH,
  PORTAL_MESSAGE_MAX_PHOTOS,
} from '@/features/portal/Lib/chatTypes'
import { db } from '@/lib/db'
import { demoGuard } from '@/lib/demo'
import { releaseFiles } from '@/lib/files/manager'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'

/**
 * The workshop's side of the customer portal's chat: reading one customer's
 * thread, answering it, marking what was read, and removing it. The list of
 * threads, and marking one unread, are in inboxActions with every other
 * channel.
 *
 * Permissions follow the other channels: reading a conversation is what
 * reading customers grants, answering needs to update them, deleting to
 * delete them.
 */

export interface PortalInboxMessage {
  id: string
  /** 'inbound' was written by the customer, 'outbound' by the workshop. */
  direction: 'inbound' | 'outbound'
  body: string
  /** Stored file urls, as staff read them through the protected files route. */
  attachments: { url: string; kind: 'image' | 'video' | 'file' }[]
  /** Who at the workshop wrote an outbound message. */
  authorName: string | null
  createdAt: string
  /** When the other side first saw it. */
  readAt: string | null
}

/** The most messages one "seen" names: more than a conversation loads in many pages. */
const SEEN_AT_ONCE = 500

const IMAGE = /\.(jpe?g|png|webp|avif|gif|heic)$/i
const VIDEO = /\.(mp4|mov|webm|m4v)$/i

function toInboxMessage(row: {
  id: string
  direction: string
  body: string
  attachments: string[]
  readAt: Date | null
  createdAt: Date
  author: { name: string | null } | null
}): PortalInboxMessage {
  return {
    id: row.id,
    direction: row.direction === 'outbound' ? 'outbound' : 'inbound',
    body: row.body,
    attachments: row.attachments.filter(Boolean).map((url) => ({
      url,
      kind: IMAGE.test(url) ? 'image' : VIDEO.test(url) ? 'video' : 'file',
    })),
    authorName: row.direction === 'outbound' ? (row.author?.name ?? null) : null,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt ? row.readAt.toISOString() : null,
  }
}

/**
 * One customer's thread, a page at a time from the newest, and whether the
 * workshop can still answer in it: not once the portal or its chat has been
 * turned off, though what was written stays readable.
 */
export async function getPortalConversation(customerId: string, cursor?: string, limit = 50) {
  return withAuth(
    async ({ organizationId }) => {
      const take = Math.min(Math.max(limit, 1), 100)
      const [customer, rows, canReply] = await Promise.all([
        db.customer.findFirst({
          where: { id: customerId, organizationId },
          select: { name: true },
        }),
        db.portalMessage.findMany({
          where: { organizationId, customerId },
          orderBy: { createdAt: 'desc' },
          take: take + 1,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          select: PORTAL_MESSAGE_SELECT,
        }),
        isPortalChatOpen(organizationId).catch(() => false),
      ])
      if (!customer) throw new Error('Customer not found')

      const hasMore = rows.length > take
      const page = hasMore ? rows.slice(0, take) : rows
      return {
        messages: page.reverse().map(toInboxMessage),
        // The page is oldest first now, so the cursor is its first row.
        nextCursor: hasMore ? (page[0]?.id ?? null) : null,
        customerName: customer.name,
        canReply,
      }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.CUSTOMERS },
      ],
    }
  )
}

const replySchema = z.object({
  customerId: z.string().min(1),
  body: z.string().trim().max(PORTAL_MESSAGE_MAX_LENGTH).default(''),
  attachments: z.array(z.string().max(300)).max(PORTAL_MESSAGE_MAX_PHOTOS).default([]),
})

/**
 * The workshop answers a customer in the portal's chat. The customer reads
 * it in their portal, where the Messages tab counts it until they open it.
 *
 * Nothing is sent to the customer's phone or mailbox: a customer who is not
 * looking at the portal learns of the answer when they next open it.
 */
export async function sendPortalReply(input: unknown) {
  return withAuth(
    async ({ organizationId, userId }) => {
      demoGuard()
      const data = replySchema.parse(input)
      if (!data.body && data.attachments.length === 0) throw new Error('Write a message first')

      const attachments = data.attachments.map((url) => {
        const stored = workshopPortalUpload(organizationId, url)
        if (!stored) throw new Error('A file in this message is not an upload of this workshop')
        return stored
      })

      const customer = await db.customer.findFirst({
        where: { id: data.customerId, organizationId },
        select: { id: true, name: true },
      })
      if (!customer) throw new Error('Customer not found')
      if (!(await isPortalChatOpen(organizationId))) {
        throw new Error('Messages in the customer portal are turned off')
      }

      const row = await db.portalMessage.create({
        data: {
          direction: 'outbound',
          body: data.body,
          attachments,
          authorUserId: userId,
          organizationId,
          customerId: customer.id,
        },
        select: PORTAL_MESSAGE_SELECT,
      })
      // Answering a thread is having read it.
      await db.portalMessage.updateMany({
        where: { organizationId, customerId: customer.id, direction: 'inbound', readAt: null },
        data: { readAt: new Date() },
      })

      return { message: toInboxMessage(row), customerName: customer.name }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.CUSTOMERS },
      ],
      audit: ({ result }) => ({
        action: 'portal.send',
        entity: 'PortalMessage',
        entityId: result.message.id,
        details: { key: 'portal_send', params: { name: result.customerName } },
        metadata: { messageId: result.message.id },
      }),
    }
  )
}

const seenSchema = z.object({
  customerId: z.string().min(1),
  /** The customer's messages on screen that were not read yet. */
  ids: z.array(z.string().min(1).max(64)).min(1).max(SEEN_AT_ONCE),
})

/**
 * The workshop has these messages of a customer's thread on screen: each is
 * stamped read. The conversation calls it with the unread messages it is
 * showing, once it has loaded them.
 *
 * Only the messages named are marked, never the whole thread: one the
 * customer wrote after the conversation was last read from the server, or an
 * older one above the page that is loaded, has not been seen, stays counted
 * in the inbox and on the sidebar, and the customer is not told "Seen".
 *
 * Reading a conversation is what the customers permission already grants,
 * as for every other channel (inboxActions.markThreadRead).
 */
export async function markPortalMessagesSeen(input: unknown) {
  return withAuth(
    async ({ organizationId }): Promise<{ marked: number }> => {
      const { customerId, ids } = seenSchema.parse(input)
      const result = await db.portalMessage.updateMany({
        where: {
          id: { in: [...new Set(ids)] },
          organizationId,
          customerId,
          direction: 'inbound',
          readAt: null,
        },
        data: { readAt: new Date() },
      })
      return { marked: result.count }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.CUSTOMERS },
      ],
    }
  )
}

/**
 * Removes a customer's whole thread. Unlike a text message, there is no copy
 * on the customer's phone: the thread is gone from their portal too. The
 * photos go with it, through the file manager, once no row mentions them.
 */
export async function deletePortalConversation(customerId: string) {
  return withAuth(
    async ({ organizationId }) => {
      const customer = await db.customer.findFirst({
        where: { id: customerId, organizationId },
        select: { id: true },
      })
      if (!customer) throw new Error('Customer not found')

      const withFiles = await db.portalMessage.findMany({
        where: { organizationId, customerId, NOT: { attachments: { isEmpty: true } } },
        select: { attachments: true },
      })
      const { count } = await db.portalMessage.deleteMany({ where: { organizationId, customerId } })
      // After the rows are gone, and only files nothing else mentions (a
      // photo may also be on a service request).
      await releaseFiles(
        withFiles.flatMap((row) => row.attachments),
        { organizationId, reason: 'portal conversation deleted' }
      )
      return { deleted: count }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.DELETE, subject: PermissionSubject.CUSTOMERS },
      ],
    }
  )
}
