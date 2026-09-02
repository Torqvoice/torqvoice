import { sendTestEmail } from '../messaging/email-test'
import { messagingConnector, requireFields, verifyByGet } from '../messaging/factory'
import { manifest } from './manifest'

const SERVER_URL = 'https://api.postmarkapp.com/server'

function headers(apiKey: string): Record<string, string> {
  return { 'X-Postmark-Server-Token': apiKey, Accept: 'application/json' }
}

export const connector = messagingConnector(
  manifest,
  async ({ credentials }) => {
    const missing = requireFields(credentials, ['apiKey'], 'Postmark')
    if (missing) return missing
    return verifyByGet(SERVER_URL, headers(credentials.apiKey), 'Postmark')
  },
  {
    /** A Postmark token belongs to one named server. */
    identify: async ({ credentials }) => {
      const res = await fetch(SERVER_URL, { headers: headers(credentials.apiKey) })
      const body = (await res.json().catch(() => ({}))) as { ID?: number; Name?: string }
      return { id: String(body.ID ?? 'postmark'), name: body.Name ?? 'Postmark' }
    },
    sendTest: sendTestEmail,
  }
)
