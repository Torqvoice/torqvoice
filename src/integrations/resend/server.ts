import { sendTestEmail } from '../messaging/email-test'
import { messagingConnector, requireFields, verifyByGet } from '../messaging/factory'
import { manifest } from './manifest'

const DOMAINS_URL = 'https://api.resend.com/domains'

function headers(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}` }
}

export const connector = messagingConnector(
  manifest,
  async ({ credentials }) => {
    const missing = requireFields(credentials, ['apiKey'], 'Resend')
    if (missing) return missing
    return verifyByGet(DOMAINS_URL, headers(credentials.apiKey), 'Resend')
  },
  {
    /** Resend keys have no account name; the verified sending domain is the identity. */
    identify: async ({ credentials }) => {
      const res = await fetch(DOMAINS_URL, { headers: headers(credentials.apiKey) })
      const body = (await res.json().catch(() => ({}))) as {
        data?: { id?: string; name?: string }[]
      }
      const domain = body.data?.[0]
      return { id: domain?.id ?? 'resend', name: domain?.name ?? 'Resend' }
    },
    sendTest: sendTestEmail,
  }
)
