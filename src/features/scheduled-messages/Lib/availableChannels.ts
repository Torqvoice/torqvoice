import { getFeatures } from '@/lib/features'
import { getOrgSmsProvider } from '@/lib/sms'
import { getOrgTelegramBotToken } from '@/lib/telegram'
import { isWhatsappConfigured } from '@/lib/whatsapp'
import type { MessageChannel } from '../Schema/scheduledMessageSchema'

/**
 * The channels a workshop can actually schedule on right now.
 *
 * Email and the in-app note always work: mail falls back to the platform
 * sender, and a notification only touches our own database. SMS, WhatsApp and
 * Telegram need both the plan feature and a configured provider, so offering
 * them before that is set up would only queue messages that fail at send time.
 */
export async function getAvailableChannels(organizationId: string): Promise<MessageChannel[]> {
  const features = await getFeatures(organizationId)

  const [smsProvider, whatsappReady, telegramToken] = await Promise.all([
    features.sms ? getOrgSmsProvider(organizationId).catch(() => null) : null,
    features.whatsapp ? isWhatsappConfigured(organizationId).catch(() => false) : false,
    features.telegram ? getOrgTelegramBotToken(organizationId).catch(() => null) : null,
  ])

  const channels: MessageChannel[] = ['email']
  if (smsProvider) channels.push('sms')
  if (whatsappReady) channels.push('whatsapp')
  if (telegramToken) channels.push('telegram')
  channels.push('in_app')
  return channels
}
