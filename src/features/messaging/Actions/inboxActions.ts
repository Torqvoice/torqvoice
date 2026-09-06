'use server'

import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { getFeatures } from '@/lib/features'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { getOrgSmsProvider } from '@/lib/sms'
import { getOrgTelegramBotToken } from '@/lib/telegram'
import { isWhatsappConfigured } from '@/lib/whatsapp'
import { mergeChannelPages } from '../Lib/mergeChannelPages'

/**
 * One inbox across every channel.
 *
 * A workshop thinks in conversations with people, not in transports. Keeping
 * SMS, WhatsApp and Telegram in separate lists made the channel the first
 * thing you had to know and the last thing you care about, so they are merged
 * here and the channel becomes a label on the row.
 *
 * Threads stay per channel rather than per customer: the same person written
 * to on SMS and on WhatsApp has two histories, on two transports, and pretending
 * otherwise would put replies on the wrong one.
 */

export type MessagingChannel = 'sms' | 'whatsapp' | 'telegram'

export interface InboxThread {
  /** Stable across renders: channel plus whoever the thread belongs to. */
  key: string
  channel: MessagingChannel
  customerId: string | null
  name: string
  /** Phone number or chat id, shown under the name. */
  contact: string
  lastMessage: string
  lastDirection: string
  lastAt: string
  /** Inbound messages nobody has opened yet. */
  unread: number
}

export interface InboxPage {
  threads: InboxThread[]
  /**
   * Timestamp to continue from, or null at the end of the list. Keyset rather
   * than an offset: conversations move to the top as they are answered, and an
   * offset would skip or repeat rows every time one did.
   */
  nextCursor: string | null
  /** Channels the workshop can actually send on, for the composer. */
  channels: MessagingChannel[]
}

const DEFAULT_PAGE_SIZE = 30

interface ThreadRow {
  identity: string
  customerId: string | null
  name: string | null
  contact: string | null
  body: string | null
  mediaType?: string | null
  direction: string
  createdAt: Date
}

interface UnreadRow {
  identity: string
  unread: number
}

/** Empty bodies are common on media messages, so say what arrived instead. */
function preview(body: string | null, mediaType?: string | null): string {
  if (body?.trim()) return body
  return mediaType ? `[${mediaType}]` : ''
}

function toThread(
  channel: MessagingChannel,
  row: ThreadRow,
  unread: Map<string, number>
): InboxThread {
  const contact = row.contact ?? ''
  return {
    key: `${channel}:${row.identity}`,
    channel,
    customerId: row.customerId,
    name: row.name?.trim() || contact,
    contact,
    lastMessage: preview(row.body, row.mediaType),
    lastDirection: row.direction,
    lastAt: row.createdAt.toISOString(),
    unread: unread.get(row.identity) ?? 0,
  }
}

function byIdentity(rows: UnreadRow[]): Map<string, number> {
  return new Map(rows.map((row) => [row.identity, row.unread]))
}

export interface InboxQuery {
  /** ISO timestamp of the last row already shown. */
  cursor?: string | null
  search?: string
  limit?: number
}

/**
 * One page of conversations, newest first.
 *
 * Each channel is asked for its own newest page below the cursor and the
 * results are merged. Taking the newest `limit` of that union is exactly the
 * newest `limit` overall, because no channel can hide a newer row behind the
 * ones it already returned.
 */
export async function getInboxThreads(query: InboxQuery = {}) {
  return withAuth(
    async ({ organizationId }): Promise<InboxPage> => {
      const limit = Math.min(query.limit ?? DEFAULT_PAGE_SIZE, 100)
      const cursor = query.cursor ? new Date(query.cursor) : null
      const term = query.search?.trim()
      const pattern = term ? `%${term}%` : null

      const features = await getFeatures(organizationId)
      const [smsProvider, whatsappReady, telegramToken] = await Promise.all([
        features.sms ? getOrgSmsProvider(organizationId).catch(() => null) : null,
        features.whatsapp ? isWhatsappConfigured(organizationId).catch(() => false) : false,
        features.telegram ? getOrgTelegramBotToken(organizationId).catch(() => null) : null,
      ])

      const channels: MessagingChannel[] = []
      if (smsProvider) channels.push('sms')
      if (whatsappReady) channels.push('whatsapp')
      if (telegramToken) channels.push('telegram')

      // DISTINCT ON gives the newest message per thread in one pass, which the
      // (organizationId, customerId, createdAt DESC) indexes already order for.
      // History outlives configuration, so this does not check `channels`: a
      // workshop that switched a provider off can still read what it sent.
      //
      // Unread is counted per thread in its own small query rather than
      // folded into the DISTINCT ON, which only ever sees one row per thread.
      // Unread rows are few, so the whole workshop is counted at once.
      const [smsRows, telegramRows, whatsappRows, smsUnread, telegramUnread, whatsappUnread] =
        await Promise.all([
          db.$queryRaw<ThreadRow[]>`
          SELECT * FROM (
            SELECT DISTINCT ON (m."customerId")
              m."customerId" AS identity,
              m."customerId" AS "customerId",
              c."name" AS name,
              c."phone" AS contact,
              m."body" AS body,
              m."direction" AS direction,
              m."createdAt" AS "createdAt"
            FROM "sms_messages" m
            JOIN "customers" c ON c."id" = m."customerId"
            WHERE m."organizationId" = ${organizationId} AND m."customerId" IS NOT NULL
            ORDER BY m."customerId", m."createdAt" DESC
          ) t
          WHERE (${cursor}::timestamptz IS NULL OR t."createdAt" < ${cursor}::timestamptz)
            AND (
              ${pattern}::text IS NULL
              OR t.name ILIKE ${pattern} OR t.contact ILIKE ${pattern} OR t.body ILIKE ${pattern}
            )
          ORDER BY t."createdAt" DESC
          LIMIT ${limit}
        `,
          db.$queryRaw<ThreadRow[]>`
          SELECT * FROM (
            SELECT DISTINCT ON (m."customerId")
              m."customerId" AS identity,
              m."customerId" AS "customerId",
              c."name" AS name,
              m."chatId" AS contact,
              m."body" AS body,
              m."direction" AS direction,
              m."createdAt" AS "createdAt"
            FROM "telegram_messages" m
            JOIN "customers" c ON c."id" = m."customerId"
            WHERE m."organizationId" = ${organizationId} AND m."customerId" IS NOT NULL
            ORDER BY m."customerId", m."createdAt" DESC
          ) t
          WHERE (${cursor}::timestamptz IS NULL OR t."createdAt" < ${cursor}::timestamptz)
            AND (
              ${pattern}::text IS NULL
              OR t.name ILIKE ${pattern} OR t.contact ILIKE ${pattern} OR t.body ILIKE ${pattern}
            )
          ORDER BY t."createdAt" DESC
          LIMIT ${limit}
        `,
          // WhatsApp threads can belong to a number we never matched to a
          // customer, so they group by customer when there is one and by the
          // number itself when there is not.
          db.$queryRaw<ThreadRow[]>`
          SELECT * FROM (
            SELECT DISTINCT ON (COALESCE(m."customerId", CASE WHEN m."direction" = 'inbound' THEN m."fromNumber" ELSE m."toNumber" END))
              COALESCE(m."customerId", CASE WHEN m."direction" = 'inbound' THEN m."fromNumber" ELSE m."toNumber" END) AS identity,
              m."customerId" AS "customerId",
              c."name" AS name,
              CASE WHEN m."direction" = 'inbound' THEN m."fromNumber" ELSE m."toNumber" END AS contact,
              m."body" AS body,
              m."mediaType" AS "mediaType",
              m."direction" AS direction,
              m."createdAt" AS "createdAt"
            FROM "whatsapp_messages" m
            LEFT JOIN "customers" c ON c."id" = m."customerId"
            WHERE m."organizationId" = ${organizationId}
            ORDER BY COALESCE(m."customerId", CASE WHEN m."direction" = 'inbound' THEN m."fromNumber" ELSE m."toNumber" END), m."createdAt" DESC
          ) t
          WHERE (${cursor}::timestamptz IS NULL OR t."createdAt" < ${cursor}::timestamptz)
            AND (
              ${pattern}::text IS NULL
              OR t.name ILIKE ${pattern} OR t.contact ILIKE ${pattern} OR t.body ILIKE ${pattern}
            )
          ORDER BY t."createdAt" DESC
          LIMIT ${limit}
        `,
          db.$queryRaw<UnreadRow[]>`
          SELECT "customerId" AS identity, COUNT(*)::int AS unread
          FROM "sms_messages"
          WHERE "organizationId" = ${organizationId}
            AND "direction" = 'inbound' AND "readAt" IS NULL AND "customerId" IS NOT NULL
          GROUP BY "customerId"
        `,
          db.$queryRaw<UnreadRow[]>`
          SELECT "customerId" AS identity, COUNT(*)::int AS unread
          FROM "telegram_messages"
          WHERE "organizationId" = ${organizationId}
            AND "direction" = 'inbound' AND "readAt" IS NULL AND "customerId" IS NOT NULL
          GROUP BY "customerId"
        `,
          db.$queryRaw<UnreadRow[]>`
          SELECT COALESCE("customerId", "fromNumber") AS identity, COUNT(*)::int AS unread
          FROM "whatsapp_messages"
          WHERE "organizationId" = ${organizationId}
            AND "direction" = 'inbound' AND "readAt" IS NULL
          GROUP BY COALESCE("customerId", "fromNumber")
        `,
        ])

      const { threads, nextCursor } = mergeChannelPages(
        [
          smsRows.map((row) => toThread('sms', row, byIdentity(smsUnread))),
          telegramRows.map((row) => toThread('telegram', row, byIdentity(telegramUnread))),
          whatsappRows.map((row) => toThread('whatsapp', row, byIdentity(whatsappUnread))),
        ],
        limit
      )

      return { threads, nextCursor, channels }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.CUSTOMERS },
      ],
    }
  )
}

/**
 * Marks everything inbound in one thread as read.
 *
 * Called when the thread is opened. Reading a conversation is what the
 * customers permission already grants, so no extra permission is asked for.
 * Returns how many rows changed, so the caller can skip a refresh when it was
 * nothing.
 */
export async function markThreadRead(thread: {
  channel: MessagingChannel
  customerId: string | null
  /** The phone number a WhatsApp thread without a customer is filed under. */
  contact: string
}) {
  return withAuth(
    async ({ organizationId }): Promise<{ marked: number }> => {
      const now = new Date()
      const unread = { organizationId, direction: 'inbound', readAt: null }

      if (thread.channel === 'whatsapp') {
        const result = await db.whatsappMessage.updateMany({
          where: thread.customerId
            ? { ...unread, customerId: thread.customerId }
            : { ...unread, customerId: null, fromNumber: thread.contact },
          data: { readAt: now },
        })
        return { marked: result.count }
      }

      if (!thread.customerId) return { marked: 0 }

      const result =
        thread.channel === 'sms'
          ? await db.smsMessage.updateMany({
              where: { ...unread, customerId: thread.customerId },
              data: { readAt: now },
            })
          : await db.telegramMessage.updateMany({
              where: { ...unread, customerId: thread.customerId },
              data: { readAt: now },
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
 * Puts a thread back in the unread pile.
 *
 * Only the newest inbound message is unstamped: one waiting message is what
 * "come back to this" means, and it keeps the pill honest about how much is
 * actually new. A thread the customer has never written to has nothing to
 * mark, and says so with a zero.
 */
export async function markThreadUnread(thread: {
  channel: MessagingChannel
  customerId: string | null
  contact: string
}) {
  return withAuth(
    async ({ organizationId }): Promise<{ marked: number }> => {
      const inbound = { organizationId, direction: 'inbound' }
      const newest = { orderBy: { createdAt: 'desc' as const }, select: { id: true } }

      if (thread.channel === 'whatsapp') {
        const latest = await db.whatsappMessage.findFirst({
          where: thread.customerId
            ? { ...inbound, customerId: thread.customerId }
            : { ...inbound, customerId: null, fromNumber: thread.contact },
          ...newest,
        })
        if (!latest) return { marked: 0 }
        await db.whatsappMessage.update({ where: { id: latest.id }, data: { readAt: null } })
        return { marked: 1 }
      }

      if (!thread.customerId) return { marked: 0 }

      if (thread.channel === 'sms') {
        const latest = await db.smsMessage.findFirst({
          where: { ...inbound, customerId: thread.customerId },
          ...newest,
        })
        if (!latest) return { marked: 0 }
        await db.smsMessage.update({ where: { id: latest.id }, data: { readAt: null } })
        return { marked: 1 }
      }

      const latest = await db.telegramMessage.findFirst({
        where: { ...inbound, customerId: thread.customerId },
        ...newest,
      })
      if (!latest) return { marked: 0 }
      await db.telegramMessage.update({ where: { id: latest.id }, data: { readAt: null } })
      return { marked: 1 }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.CUSTOMERS },
      ],
    }
  )
}
