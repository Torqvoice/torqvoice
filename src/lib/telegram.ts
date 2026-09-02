import { channelSettings } from '@/features/integrations/Lib/messaging'
import { ORG_TELEGRAM_KEYS } from '@/features/telegram/Schema/telegramSettingsSchema'

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot'

// ─── Settings helpers ───────────────────────────────────────────────────────

/**
 * Telegram's bot token and name come from the connected integration now. A
 * bot set up before the move is adopted on the first read, so nothing has to
 * be pasted again.
 */
export async function getOrgTelegramBotToken(organizationId: string): Promise<string | null> {
  const settings = await channelSettings(organizationId, 'telegram')
  return settings.get(ORG_TELEGRAM_KEYS.TELEGRAM_BOT_TOKEN) || null
}

export async function getOrgTelegramBotUsername(organizationId: string): Promise<string | null> {
  // Printed on invoices and the customer portal: a broken Telegram setup
  // must cost the workshop the t.me link, never the invoice.
  try {
    const settings = await channelSettings(organizationId, 'telegram')
    return settings.get(ORG_TELEGRAM_KEYS.TELEGRAM_BOT_USERNAME) || null
  } catch (error) {
    console.error('[telegram] Could not read the bot username:', error)
    return null
  }
}

/** The secret Telegram signs its webhook calls with. */
export async function getOrgTelegramWebhookSecret(organizationId: string): Promise<string | null> {
  const settings = await channelSettings(organizationId, 'telegram')
  return settings.get(ORG_TELEGRAM_KEYS.TELEGRAM_WEBHOOK_SECRET) || null
}

// ─── Bot API: getMe ─────────────────────────────────────────────────────────

export interface TelegramBotInfo {
  username: string
  firstName: string
}

export async function getTelegramBotInfo(botToken: string): Promise<TelegramBotInfo> {
  const res = await fetch(`${TELEGRAM_API_BASE}${botToken}/getMe`, {
    method: 'GET',
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(
      `Telegram getMe failed: ${(err as { description?: string }).description || res.statusText}`
    )
  }

  const data = (await res.json()) as {
    ok: boolean
    result: { username: string; first_name: string }
  }

  if (!data.ok || !data.result?.username) {
    throw new Error('Invalid bot token: getMe did not return a valid bot')
  }

  return {
    username: data.result.username,
    firstName: data.result.first_name,
  }
}

// ─── Bot API: sendMessage ───────────────────────────────────────────────────

export interface SendTelegramMessageOptions {
  chatId: string
  text: string
}

export interface SendTelegramMessageResult {
  messageId: number
}

export async function sendTelegramMessage(
  organizationId: string,
  options: SendTelegramMessageOptions
): Promise<SendTelegramMessageResult> {
  const botToken = await getOrgTelegramBotToken(organizationId)
  if (!botToken) {
    throw new Error('Telegram bot is not configured. Set up a bot token in Settings.')
  }

  const res = await fetch(`${TELEGRAM_API_BASE}${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: options.chatId,
      text: options.text,
      parse_mode: 'HTML',
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(
      `Telegram sendMessage failed: ${(err as { description?: string }).description || res.statusText}`
    )
  }

  const data = (await res.json()) as {
    ok: boolean
    result: { message_id: number }
  }

  if (!data.ok) {
    throw new Error('Telegram sendMessage returned ok=false')
  }

  return { messageId: data.result.message_id }
}

// ─── Bot API: setWebhook ───────────────────────────────────────────────────

export async function setTelegramWebhook(
  botToken: string,
  webhookUrl: string,
  secret: string
): Promise<void> {
  const res = await fetch(`${TELEGRAM_API_BASE}${botToken}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: secret,
      allowed_updates: ['message'],
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(
      `Telegram setWebhook failed: ${(err as { description?: string }).description || res.statusText}`
    )
  }

  const data = (await res.json()) as { ok: boolean; description?: string }
  if (!data.ok) {
    throw new Error(`Telegram setWebhook error: ${data.description || 'unknown'}`)
  }
}

// ─── Bot API: deleteWebhook ─────────────────────────────────────────────────

export async function deleteTelegramWebhook(botToken: string): Promise<void> {
  const res = await fetch(`${TELEGRAM_API_BASE}${botToken}/deleteWebhook`, {
    method: 'POST',
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(
      `Telegram deleteWebhook failed: ${(err as { description?: string }).description || res.statusText}`
    )
  }
}
