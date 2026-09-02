import { deleteTelegramWebhook, setTelegramWebhook } from '@/lib/telegram'
import { messagingConnector, requireFields } from '../messaging/factory'
import { manifest } from './manifest'

interface TelegramMe {
  ok: boolean
  result?: { id: number; username?: string; first_name?: string }
  description?: string
}

async function getMe(botToken: string): Promise<TelegramMe> {
  const res = await fetch(`https://api.telegram.org/bot${encodeURIComponent(botToken)}/getMe`)
  return (await res.json()) as TelegramMe
}

const base = messagingConnector(
  manifest,
  async ({ credentials }) => {
    const missing = requireFields(credentials, ['botToken'], 'Telegram')
    if (missing) return missing
    try {
      const me = await getMe(credentials.botToken)
      if (me.ok) return { ok: true }
      return { ok: false, message: me.description ?? 'Telegram rejected the bot token.' }
    } catch (err) {
      return { ok: false, message: `Could not reach Telegram: ${(err as Error).message}` }
    }
  },
  {
    identify: async ({ credentials }) => {
      const me = await getMe(credentials.botToken)
      const username = me.result?.username
      return {
        id: String(me.result?.id ?? ''),
        name: username ? `@${username}` : (me.result?.first_name ?? 'Telegram bot'),
      }
    },
  }
)

export const connector = {
  ...base,
  /**
   * Telegram only delivers messages to a URL the bot has registered, signed
   * with the secret the platform minted for this connection. The bot's
   * username is kept as a setting because invoices and the customer portal
   * print a t.me link from it.
   */
  async onConnect(ctx) {
    const botToken = String(ctx.credentials.botToken ?? '')
    const secret = String(ctx.credentials.webhookSecret ?? '')
    if (!botToken || !secret) throw new Error('Telegram connection is missing its keys')

    // The secret travels in the header Telegram signs with, so it has no
    // business in the URL, where it would end up in every access log.
    const url = `${ctx.appUrl}/api/webhooks/telegram/${ctx.connection.organizationId}`
    await setTelegramWebhook(botToken, url, secret)

    // Only overwrite the username with an answer; a rate-limited getMe must
    // not blank out one the workshop already had.
    const me = await getMe(botToken)
    const username = me.result?.username
    return username ? { settings: { botUsername: username } } : undefined
  },
  async onDisconnect(ctx) {
    const botToken = String(ctx.credentials.botToken ?? '')
    if (!botToken) return
    await deleteTelegramWebhook(botToken)
  },
} satisfies typeof base
