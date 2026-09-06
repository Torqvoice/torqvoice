import { db } from '@/lib/db'

/**
 * Inbound messages the workshop has not opened yet, across every channel.
 *
 * Feeds the sidebar pill, so it is a count of what is waiting and nothing
 * else: opening a thread clears its share, and history from before read
 * tracking existed was stamped read by the migration that added it.
 *
 * Server-side only. It takes the organisation as an argument, so it must not
 * live in a 'use server' file where it would become callable from a browser.
 */
export async function countUnreadMessages(organizationId: string): Promise<number> {
  const unread = { direction: 'inbound', readAt: null }
  const [sms, telegram, whatsapp] = await Promise.all([
    db.smsMessage.count({ where: { organizationId, ...unread } }),
    db.telegramMessage.count({ where: { organizationId, ...unread } }),
    db.whatsappMessage.count({ where: { organizationId, ...unread } }),
  ])
  return sms + telegram + whatsapp
}
