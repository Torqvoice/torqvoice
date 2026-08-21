'use server'

import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { getFeatures } from '@/lib/features'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { getOrgSmsProvider } from '@/lib/sms'
import { getOrgTelegramBotToken } from '@/lib/telegram'
import { isWhatsappConfigured } from '@/lib/whatsapp'

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
}

export interface InboxData {
  threads: InboxThread[]
  /** Channels the workshop can actually use, for the filters and the composer. */
  channels: MessagingChannel[]
}

/** Empty bodies are common on media messages, so say what arrived instead. */
function preview(body: string | null, mediaType?: string | null): string {
  if (body?.trim()) return body
  return mediaType ? `[${mediaType}]` : ''
}

export async function getInboxThreads(limit = 50) {
  return withAuth(
    async ({ organizationId }): Promise<InboxData> => {
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

      // History outlives configuration: a workshop that switched provider off
      // should still be able to read what it sent, so the queries do not check
      // `channels` before running.
      const [smsCustomers, telegramCustomers, whatsappMessages] = await Promise.all([
        db.customer.findMany({
          where: { organizationId, smsMessages: { some: {} } },
          select: {
            id: true,
            name: true,
            phone: true,
            smsMessages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { body: true, direction: true, createdAt: true },
            },
          },
          take: limit,
        }),
        db.customer.findMany({
          where: { organizationId, telegramMessages: { some: {} } },
          select: {
            id: true,
            name: true,
            telegramChatId: true,
            telegramMessages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { body: true, direction: true, createdAt: true },
            },
          },
          take: limit,
        }),
        // WhatsApp threads can belong to a number we never matched to a
        // customer, so they are grouped from the messages rather than the
        // customers.
        db.whatsappMessage.findMany({
          where: { organizationId },
          orderBy: { createdAt: 'desc' },
          take: limit * 10,
          select: {
            direction: true,
            body: true,
            mediaType: true,
            createdAt: true,
            fromNumber: true,
            toNumber: true,
            customerId: true,
            customer: { select: { id: true, name: true } },
          },
        }),
      ])

      const threads: InboxThread[] = []

      for (const customer of smsCustomers) {
        const last = customer.smsMessages[0]
        if (!last) continue
        threads.push({
          key: `sms:${customer.id}`,
          channel: 'sms',
          customerId: customer.id,
          name: customer.name,
          contact: customer.phone ?? '',
          lastMessage: preview(last.body),
          lastDirection: last.direction,
          lastAt: last.createdAt.toISOString(),
        })
      }

      for (const customer of telegramCustomers) {
        const last = customer.telegramMessages[0]
        if (!last) continue
        threads.push({
          key: `telegram:${customer.id}`,
          channel: 'telegram',
          customerId: customer.id,
          name: customer.name,
          contact: customer.telegramChatId ?? '',
          lastMessage: preview(last.body),
          lastAt: last.createdAt.toISOString(),
          lastDirection: last.direction,
        })
      }

      const seenWhatsapp = new Set<string>()
      for (const message of whatsappMessages) {
        const contact = message.direction === 'inbound' ? message.fromNumber : message.toNumber
        const identity = message.customerId ?? contact
        if (seenWhatsapp.has(identity)) continue
        seenWhatsapp.add(identity)

        threads.push({
          key: `whatsapp:${identity}`,
          channel: 'whatsapp',
          customerId: message.customerId,
          name: message.customer?.name ?? contact,
          contact,
          lastMessage: preview(message.body, message.mediaType),
          lastDirection: message.direction,
          lastAt: message.createdAt.toISOString(),
        })
      }

      threads.sort((a, b) => b.lastAt.localeCompare(a.lastAt))

      return { threads: threads.slice(0, limit * 3), channels }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.CUSTOMERS },
      ],
    }
  )
}
