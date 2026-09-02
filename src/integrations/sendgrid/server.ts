import { sendTestEmail } from '../messaging/email-test'
import { messagingConnector, requireFields, verifyByGet } from '../messaging/factory'
import { manifest } from './manifest'

function headers(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}` }
}

export const connector = messagingConnector(
  manifest,
  async ({ credentials }) => {
    const missing = requireFields(credentials, ['apiKey'], 'SendGrid')
    if (missing) return missing
    return verifyByGet(
      'https://api.sendgrid.com/v3/scopes',
      headers(credentials.apiKey),
      'SendGrid'
    )
  },
  {
    /**
     * The account's username, when the key is allowed to read the profile.
     * A key scoped to sending only cannot, and then the vendor's name will do.
     */
    identify: async ({ credentials }) => {
      const res = await fetch('https://api.sendgrid.com/v3/user/profile', {
        headers: headers(credentials.apiKey),
      })
      const body = (await res.json().catch(() => ({}))) as { username?: string }
      const name = res.ok && body.username ? body.username : 'SendGrid'
      return { id: name, name }
    },
    sendTest: sendTestEmail,
  }
)
