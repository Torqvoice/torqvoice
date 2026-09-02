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

export const connector = messagingConnector(
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
  async ({ credentials }) => {
    const me = await getMe(credentials.botToken)
    const username = me.result?.username
    return {
      id: String(me.result?.id ?? ''),
      name: username ? `@${username}` : (me.result?.first_name ?? 'Telegram bot'),
    }
  }
)
