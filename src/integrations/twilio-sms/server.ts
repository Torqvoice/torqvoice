import { messagingConnector, requireFields, verifyByGet } from '../messaging/factory'
import { manifest } from './manifest'

/** Twilio's own account resource: the cheapest call that proves a key pair. */
function accountUrl(accountSid: string): string {
  return `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}.json`
}

function basic(accountSid: string, authToken: string): Record<string, string> {
  return { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}` }
}

export const connector = messagingConnector(
  manifest,
  async ({ credentials }) => {
    const missing = requireFields(credentials, ['accountSid', 'authToken'], 'Twilio')
    if (missing) return missing
    return verifyByGet(
      accountUrl(credentials.accountSid),
      basic(credentials.accountSid, credentials.authToken),
      'Twilio'
    )
  },
  async ({ credentials }) => ({ id: credentials.accountSid, name: credentials.accountSid })
)
