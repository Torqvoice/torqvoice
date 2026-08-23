import { db } from '@/lib/db'
import { notify } from '@/lib/notify'
import { sendOrgMail, getOrgFromAddress } from '@/lib/email'
import { sendOrgSms, getOrgSmsPhoneNumber, normalizeOrgPhone } from '@/lib/sms'
import { sendTelegramMessage } from '@/lib/telegram'
import { sendOrgWhatsapp } from '@/lib/whatsapp'
import type { MessageFrequency } from '../Schema/scheduledMessageSchema'

/** Everything a send needs, whether it comes from the cron or a manual push. */
export type DispatchableMessage = {
  id: string
  channel: string
  subject: string | null
  body: string
  recipient: string | null
  organizationId: string
  customerId: string | null
  vehicleId: string | null
}

/** Plain text to the minimal HTML the mail senders expect. */
function toHtml(body: string): string {
  const escaped = body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<div style="font-family:system-ui,sans-serif;white-space:pre-wrap;line-height:1.5;">${escaped}</div>`
}

/**
 * Send one scheduled message through its channel.
 *
 * Throws on anything that stops delivery, so the caller can record the reason
 * against the row. Outbound SMS and Telegram are logged to the same tables the
 * manual send paths write, which is what makes them show up in the customer's
 * conversation afterwards.
 */
export async function dispatchScheduledMessage(message: DispatchableMessage): Promise<void> {
  const { organizationId } = message

  const customer = message.customerId
    ? await db.customer.findFirst({
        where: { id: message.customerId, organizationId },
        select: { id: true, name: true, email: true, phone: true, telegramChatId: true },
      })
    : null

  switch (message.channel) {
    case 'email': {
      const to = message.recipient?.trim() || customer?.email
      if (!to) throw new Error('No email address for this message')
      const from = await getOrgFromAddress(organizationId)
      await sendOrgMail(organizationId, {
        from,
        to,
        subject: message.subject?.trim() || '',
        html: toHtml(message.body),
      })
      return
    }

    case 'sms': {
      const rawTo = message.recipient?.trim() || customer?.phone
      if (!rawTo) throw new Error('No phone number for this message')

      const to = await normalizeOrgPhone(organizationId, rawTo)
      if (!to) throw new Error('Phone number is not in a format we can dial')

      const fromNumber = await getOrgSmsPhoneNumber(organizationId)
      if (!fromNumber) throw new Error('SMS phone number is not configured')

      // Logged before the send, so a provider failure still leaves a trace in
      // the customer's thread rather than vanishing
      const logged = await db.smsMessage.create({
        data: {
          direction: 'outbound',
          fromNumber,
          toNumber: to,
          body: message.body,
          status: 'queued',
          organizationId,
          customerId: customer?.id ?? null,
          relatedEntityType: 'ScheduledMessage',
          relatedEntityId: message.id,
        },
      })

      try {
        const result = await sendOrgSms(organizationId, { to, body: message.body })
        await db.smsMessage.update({
          where: { id: logged.id },
          data: { status: 'sent', providerMsgId: result?.providerMsgId ?? null },
        })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        await db.smsMessage.update({
          where: { id: logged.id },
          data: { status: 'failed', errorMessage },
        })
        throw error
      }
      return
    }

    case 'whatsapp': {
      const number = message.recipient?.trim() || customer?.phone
      if (!number) throw new Error('No WhatsApp number for this message')

      // Unlike the other channels there is no row to write here first:
      // sendOrgWhatsapp records the attempt either way, and decides on its own
      // whether the 24 hour window allows free text or forces a template.
      await sendOrgWhatsapp(organizationId, {
        to: number,
        body: message.body,
        customerId: customer?.id,
        relatedEntityType: 'ScheduledMessage',
        relatedEntityId: message.id,
      })
      return
    }

    case 'telegram': {
      const chatId = message.recipient?.trim() || customer?.telegramChatId
      if (!chatId) throw new Error('No Telegram chat linked for this message')

      const logged = await db.telegramMessage.create({
        data: {
          direction: 'outbound',
          chatId,
          body: message.body,
          status: 'queued',
          organizationId,
          customerId: customer?.id ?? null,
          relatedEntityType: 'ScheduledMessage',
          relatedEntityId: message.id,
        },
      })

      try {
        const result = await sendTelegramMessage(organizationId, {
          chatId,
          text: message.body,
        })
        await db.telegramMessage.update({
          where: { id: logged.id },
          data: { status: 'sent', telegramMessageId: String(result.messageId) },
        })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        await db.telegramMessage.update({
          where: { id: logged.id },
          data: { status: 'failed', errorMessage },
        })
        throw error
      }
      return
    }

    case 'in_app': {
      // The workshop's own bell, not the customer's inbox
      await notify({
        type: 'scheduled_message',
        title: message.subject?.trim() || message.body.slice(0, 80),
        message: message.body,
        entityType: 'ScheduledMessage',
        entityId: message.id,
        entityUrl: message.customerId
          ? `/customers/${message.customerId}`
          : '/messages?tab=scheduled',
        organizationId,
      })
      return
    }

    default:
      throw new Error(`Unknown message channel: ${message.channel}`)
  }
}

/**
 * When a repeating message goes out next, or null when it is done.
 * Keeps the wall-clock time of day and stops once past `endDate`.
 */
export function nextSendAt(
  current: Date,
  frequency: MessageFrequency | string,
  endDate: Date | null
): Date | null {
  const next = new Date(current)
  switch (frequency) {
    case 'daily':
      next.setDate(next.getDate() + 1)
      break
    case 'weekly':
      next.setDate(next.getDate() + 7)
      break
    case 'biweekly':
      next.setDate(next.getDate() + 14)
      break
    case 'monthly':
      next.setMonth(next.getMonth() + 1)
      break
    case 'yearly':
      next.setFullYear(next.getFullYear() + 1)
      break
    default:
      return null // "once"
  }
  if (endDate && next > endDate) return null
  return next
}
